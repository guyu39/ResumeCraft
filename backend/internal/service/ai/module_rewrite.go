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

// extractRewritableItems 从模块 content 中抽取可改写的文本条目。
// - work/project 等：取 items[].description，index 为 items 数组下标
// - skills/summary 等单字段模块：取顶层 content，index = -1 表示「整体 content 字段」
// 返回 [{index, text}]，便于前端按 index 回写（-1 写回 content，>=0 写回 items[index].description）。
func extractRewritableItems(content map[string]interface{}) []struct {
	Index int
	Text  string
} {
	var out []struct {
		Index int
		Text  string
	}

	// items 数组模块（work/project）
	if itemsRaw, ok := content["items"].([]interface{}); ok {
		for i, raw := range itemsRaw {
			item, ok := raw.(map[string]interface{})
			if !ok {
				continue
			}
			desc, _ := item["description"].(string)
			if strings.TrimSpace(desc) == "" {
				continue
			}
			out = append(out, struct {
				Index int
				Text  string
			}{Index: i, Text: desc})
		}
		return out
	}

	// 单字段模块（skills/summary）：顶层 content
	if c, ok := content["content"].(string); ok && strings.TrimSpace(c) != "" {
		out = append(out, struct {
			Index int
			Text  string
		}{Index: -1, Text: c})
	}
	return out
}

func (s *service) RewriteModule(ctx context.Context, userID string, req model.ModuleRewriteRequest) (*model.ModuleRewriteResponse, error) {
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

	items := extractRewritableItems(req.Content)
	if len(items) == 0 {
		return nil, fmt.Errorf("该模块没有可改写的内容")
	}

	prompt := buildModuleRewritePrompt(req, items)

	maskedPrompt, san := s.maskPrompt(prompt)
	result, err := s.aiProvider.Complete(ctx, CompleteRequest{
		APIKey:    apiKey,
		BaseURL:   cfg.BaseURL,
		Model:     cfg.DefaultModel,
		Prompt:    maskedPrompt,
		TimeoutMs: cfg.TimeoutMs,
	})
	if err != nil {
		log.Printf("[ai] RewriteModule failed: %v", err)
		return nil, ErrAIRequestFailed
	}
	result.Text = s.unmaskResponse(san, result.Text)

	resp, err := parseModuleRewriteResponse(result.Text, items)
	if err != nil {
		log.Printf("[ai] Failed to parse module rewrite response: %v", err)
		return nil, fmt.Errorf("failed to parse AI response")
	}
	resp.ModuleType = req.ModuleType
	resp.Model = cfg.DefaultModel
	resp.RawText = result.Text

	convID := uuid.New().String()
	contextJSON, _ := json.Marshal(map[string]any{
		"moduleType":       req.ModuleType,
		"moduleInstanceId": req.ModuleInstanceID,
		"items":            resp.Items,
		"jdText":           req.JDText,
		"targetTitle":      req.TargetTitle,
		"companyName":      req.CompanyName,
		"model":            resp.Model,
	})
	conversation := &aiStorage.ConversationRecord{
		ID:               convID,
		UserID:           userID,
		ResumeID:         &req.ResumeID,
		Type:             string(model.ConversationTypeRewrite),
		Title:            stringPtr(fmt.Sprintf("整模块改写 - %s", req.ModuleType)),
		Context:          contextJSON,
		ModuleType:       req.ModuleType,
		ModuleInstanceID: req.ModuleInstanceID,
	}
	if err := s.repo.Create(ctx, conversation); err != nil {
		log.Printf("[ai] Failed to create module rewrite conversation: %v", err)
	}
	s.repo.AddMessage(ctx, &aiStorage.MessageRecord{
		ID: uuid.New().String(), ConversationID: convID, Role: "user", Content: prompt, Model: &cfg.DefaultModel,
	})
	resp.ConversationID = convID
	s.repo.AddMessage(ctx, &aiStorage.MessageRecord{
		ID: uuid.New().String(), ConversationID: convID, Role: "assistant", Content: result.Text, Model: &cfg.DefaultModel,
	})

	return resp, nil
}

func buildModuleRewritePrompt(req model.ModuleRewriteRequest, items []struct {
	Index int
	Text  string
}) string {
	var sb strings.Builder
	for _, it := range items {
		sb.WriteString(fmt.Sprintf("[%d] %s\n", it.Index, strings.TrimSpace(it.Text)))
	}

	return fmt.Sprintf(`你是资深简历优化专家。请用 STAR 思路批量重写以下同一模块的多条内容，使其更具量化成果与岗位匹配度。

【强制规则】
1. 只返回一个 JSON 对象，禁止 Markdown、代码块、注释或额外说明。
2. 禁止编造不存在的经历、公司、技术栈、奖项或结果。需要数字但简历未提供时，用定性表述（如"显著提升""大幅缩短"），禁止输出 [estimated]、xx%、N 等占位符。
3. 强化 Action/Result，使用强动词，避免流水账与空泛套话。
4. **保留原文的 HTML 结构**：若输入含 <ul>/<li>/<p> 等标签，改写后必须保持相同的标签结构，只改写文字内容，不得删减或新增列表项数量。
5. 每条改写后中文不超过 150 字、英文不超过 260 字符，适合直接放入简历。
6. 必须按输入的编号逐条返回，index 与输入编号严格对应，不得遗漏或新增条目。
7. 隐私脱敏标记（如 [NAME_N]、[PHONE_N]）必须原样保留。

【返回格式】
{
  "items": [
    {"index": 0, "original": "原文", "rewritten": "改写后文本（保留原 HTML 结构）", "highlights": ["亮点关键词"]}
  ]
}

【模块类型】
%s

【目标岗位】
%s

【目标公司】
%s

【岗位 JD】
%s

【待重写条目（按编号，可能含 HTML 标签）】
%s`,
		strings.TrimSpace(req.ModuleType),
		strings.TrimSpace(req.TargetTitle),
		strings.TrimSpace(req.CompanyName),
		strings.TrimSpace(req.JDText),
		sb.String(),
	)
}

func parseModuleRewriteResponse(text string, items []struct {
	Index int
	Text  string
}) (*model.ModuleRewriteResponse, error) {
	firstBrace := strings.Index(text, "{")
	lastBrace := strings.LastIndex(text, "}")
	if firstBrace == -1 || lastBrace == -1 || lastBrace <= firstBrace {
		return nil, fmt.Errorf("invalid JSON response")
	}
	var parsed struct {
		Items []model.ModuleRewriteItem `json:"items"`
	}
	if err := json.Unmarshal([]byte(text[firstBrace:lastBrace+1]), &parsed); err != nil {
		return nil, err
	}

	// 用原始 items 的 text 回填 original，防止 LLM 改动原文造成 diff 失真
	origByIndex := make(map[int]string, len(items))
	for _, it := range items {
		origByIndex[it.Index] = it.Text
	}

	out := make([]model.ModuleRewriteItem, 0, len(parsed.Items))
	for _, ri := range parsed.Items {
		if strings.TrimSpace(ri.Rewritten) == "" {
			continue
		}
		orig, ok := origByIndex[ri.Index]
		if !ok {
			continue // 丢弃不在原条目内的编号，防止错配
		}
		ri.Original = orig
		out = append(out, ri)
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("module rewrite response is empty")
	}
	return &model.ModuleRewriteResponse{Items: out}, nil
}
