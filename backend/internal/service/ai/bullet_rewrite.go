package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"resumecraft-pdf-backend/internal/model"
	aiStorage "resumecraft-pdf-backend/internal/storage/ai"

	"github.com/google/uuid"
)

func (s *service) RewriteBullet(ctx context.Context, userID string, req model.BulletRewriteRequest) (*model.BulletRewriteResponse, error) {
	cfg, err := s.cfgRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, ErrAIConfigNotFound
	}
	if !cfg.Enabled {
		return nil, fmt.Errorf("AI 功能未启用")
	}
	apiKey, err := s.encryption.Decrypt(cfg.APIKeyEncrypted)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt API key")
	}

	prompt := buildBulletRewritePrompt(req)
	result, err := s.aiProvider.Complete(ctx, CompleteRequest{
		APIKey:    apiKey,
		BaseURL:   cfg.BaseURL,
		Model:     cfg.DefaultModel,
		Prompt:    prompt,
		TimeoutMs: cfg.TimeoutMs,
	})
	if err != nil {
		log.Printf("[ai] RewriteBullet failed: %v", err)
		return nil, ErrAIRequestFailed
	}

	rewriteResp, err := parseBulletRewriteResponse(result.Text)
	if err != nil {
		log.Printf("[ai] Failed to parse bullet rewrite response: %v", err)
		return nil, fmt.Errorf("failed to parse AI response")
	}
	rewriteResp.Model = cfg.DefaultModel
	rewriteResp.JDText = strings.TrimSpace(req.JDText)
	rewriteResp.TargetTitle = strings.TrimSpace(req.TargetTitle)
	rewriteResp.CompanyName = strings.TrimSpace(req.CompanyName)
	rewriteResp.RawText = result.Text

	convID := uuid.New().String()
	contextData := map[string]any{
		"moduleType":       req.ModuleType,
		"moduleInstanceId": req.ModuleInstanceID,
		"fieldKey":         req.FieldKey,
		"original":         rewriteResp.Original,
		"versions":         rewriteResp.Versions,
		"missingData":      rewriteResp.MissingData,
		"jdText":           req.JDText,
		"targetTitle":      req.TargetTitle,
		"companyName":      req.CompanyName,
		"model":            rewriteResp.Model,
	}
	contextJSON, _ := json.Marshal(contextData)
	conversation := &aiStorage.ConversationRecord{
		ID:               convID,
		UserID:           userID,
		ResumeID:         &req.ResumeID,
		Type:             string(model.ConversationTypeRewrite),
		Title:            stringPtr(fmt.Sprintf("Bullet重写 - %s", req.ModuleType)),
		Context:          contextJSON,
		ModuleType:       req.ModuleType,
		ModuleInstanceID: req.ModuleInstanceID,
	}
	if err := s.repo.Create(ctx, conversation); err != nil {
		log.Printf("[ai] Failed to create bullet rewrite conversation: %v", err)
	}

	s.repo.AddMessage(ctx, &aiStorage.MessageRecord{
		ID:             uuid.New().String(),
		ConversationID: convID,
		Role:           "user",
		Content:        prompt,
		Model:          &cfg.DefaultModel,
	})
	rewriteResp.ConversationID = convID
	s.repo.AddMessage(ctx, &aiStorage.MessageRecord{
		ID:             uuid.New().String(),
		ConversationID: convID,
		Role:           "assistant",
		Content:        result.Text,
		Model:          &cfg.DefaultModel,
	})

	return rewriteResp, nil
}

func buildBulletRewritePrompt(req model.BulletRewriteRequest) string {
	return fmt.Sprintf(`你是资深简历 Bullet Point 重写专家。请基于目标岗位 JD 的关键要求，重写以下简历条目。

【强制规则】
1. 只返回一个 JSON 对象，禁止 Markdown、代码块、注释或额外说明。
2. 禁止编造完全不存在的经历、公司、技术栈、奖项或结果。
3. 如果需要推断数字，必须在文本中标注 [estimated]。
4. 使用 STAR 思路强化 Action/Result，避免流水账和弱动词。
5. 每个版本适合直接放入简历，中文不超过 120 字，英文不超过 200 字符。
6. 必须返回 impact、technical、business 三个版本。

【返回格式】
{
  "original": "原文",
  "versions": [
    {"type":"impact","text":"成果导向版本","highlights":["量化成果"],"confidence":0.85},
    {"type":"technical","text":"技术深度版本","highlights":["核心技术"],"confidence":0.85},
    {"type":"business","text":"业务价值版本","highlights":["业务结果"],"confidence":0.85}
  ],
  "missingData": ["建议用户补充的数据，如无则返回空数组"]
}

【模块信息】
模块类型：%s
字段：%s
目标岗位：%s
目标公司：%s

【岗位 JD】
%s

【待重写内容】
%s`, strings.TrimSpace(req.ModuleType), strings.TrimSpace(req.FieldKey), strings.TrimSpace(req.TargetTitle), strings.TrimSpace(req.CompanyName), strings.TrimSpace(req.JDText), strings.TrimSpace(req.Content))
}

func parseBulletRewriteResponse(text string) (*model.BulletRewriteResponse, error) {
	firstBrace := strings.Index(text, "{")
	lastBrace := strings.LastIndex(text, "}")
	if firstBrace == -1 || lastBrace == -1 || lastBrace <= firstBrace {
		return nil, fmt.Errorf("invalid JSON response")
	}
	jsonStr := text[firstBrace : lastBrace+1]

	var resp struct {
		Original    string                       `json:"original"`
		Versions    []model.BulletRewriteVersion `json:"versions"`
		MissingData []string                     `json:"missingData"`
	}
	if err := json.Unmarshal([]byte(jsonStr), &resp); err != nil {
		return nil, err
	}
	if strings.TrimSpace(resp.Original) == "" || len(resp.Versions) == 0 {
		return nil, fmt.Errorf("bullet rewrite response is empty")
	}

	versions := make([]model.BulletRewriteVersion, 0, len(resp.Versions))
	for _, version := range resp.Versions {
		if strings.TrimSpace(version.Type) == "" || strings.TrimSpace(version.Text) == "" {
			continue
		}
		versions = append(versions, version)
	}
	if len(versions) == 0 {
		return nil, fmt.Errorf("bullet rewrite versions are empty")
	}

	return &model.BulletRewriteResponse{
		Original:    resp.Original,
		Versions:    versions,
		MissingData: resp.MissingData,
	}, nil
}
