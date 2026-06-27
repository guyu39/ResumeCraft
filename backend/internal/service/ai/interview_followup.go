package ai

import (
	"context"
	"fmt"
	"strings"

	"resumecraft-pdf-backend/internal/model"
)

// GenerateFollowup 基于某道面试题 + 候选人回答 + 已有追问历史，生成下一个追问问题。
// 追问很短，用非流式 Complete；多轮历史拼进 prompt 文本（provider 仅接受单 prompt）。
// 返回值：followup 追问问题文本；done=true 表示本题无需继续追问。
func (s *service) GenerateFollowup(ctx context.Context, userID string, req model.InterviewFollowupRequest) (string, bool, error) {
	cfg, err := s.cfgRepo.GetByUserID(ctx, userID)
	if err != nil {
		return "", false, ErrAIConfigNotFound
	}
	if !cfg.Enabled {
		return "", false, fmt.Errorf("AI 功能未启用")
	}
	apiKey, err := s.encryption.Decrypt(cfg.APIKeyEncrypted)
	if err != nil {
		return "", false, fmt.Errorf("failed to decrypt API key")
	}

	// 校验 session 归属（避免越权对他人 session 追问）
	if _, err := s.interviewRepo.GetSessionByID(ctx, userID, req.SessionID); err != nil {
		return "", false, fmt.Errorf("get interview session: %w", err)
	}

	prompt := buildFollowupPrompt(req)
	maskedPrompt, san := s.maskPrompt(prompt)
	result, err := s.aiProvider.Complete(ctx, CompleteRequest{
		APIKey:    apiKey,
		BaseURL:   cfg.BaseURL,
		Model:     cfg.DefaultModel,
		Prompt:    maskedPrompt,
		TimeoutMs: cfg.TimeoutMs,
	})
	if err != nil {
		return "", false, ErrAIRequestFailed
	}
	text := strings.TrimSpace(s.unmaskResponse(san, result.Text))

	// 约定：模型认为无需追问时输出 [DONE]
	if text == "" || strings.Contains(text, "[DONE]") {
		return "", true, nil
	}
	// 去掉可能的引导前缀/markdown
	text = strings.TrimPrefix(text, "追问：")
	text = strings.TrimSpace(strings.Trim(text, "`"))
	return text, false, nil
}

func buildFollowupPrompt(req model.InterviewFollowupRequest) string {
	var hist strings.Builder
	for _, t := range req.History {
		role := "候选人"
		if t.Role == "assistant" {
			role = "面试官"
		}
		hist.WriteString(fmt.Sprintf("%s：%s\n", role, strings.TrimSpace(t.Content)))
	}

	return fmt.Sprintf(`你是严谨的技术面试官，正在就一道题对候选人进行追问，目的是考察其回答的深度与真实性。

【规则】
1. 只输出一句追问问题，不要解释、不要分析、不要 Markdown。
2. 追问要基于候选人的具体回答深挖（如实现细节、权衡取舍、边界情况、量化结果），避免泛泛而问。
3. 如果候选人的回答已足够充分、或继续追问已无意义，只输出 [DONE]。
4. 追问要简洁，一句话，中文不超过 60 字。

【原始题目】
%s

【候选人首次回答】
%s

【已有追问对话】
%s
请输出下一句追问，或在无需继续时输出 [DONE]：`,
		strings.TrimSpace(req.Question),
		strings.TrimSpace(req.Answer),
		strings.TrimSpace(hist.String()),
	)
}
