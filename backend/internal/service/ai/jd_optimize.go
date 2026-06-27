package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"resumecraft-pdf-backend/internal/model"
)

// jdOptimizeField 描述一个可被 AI 改写的文本字段在 content 中的定位。
// kind: "module" 表示模块顶层 content 字段（skills/summary）；"item" 表示 items[idx].description（work/project）。
type jdOptimizeField struct {
	ModuleID string
	Kind     string // module | item
	ItemIdx  int    // kind=item 时有效
	Text     string
}

// collectOptimizableFields 从 content.modules 中抽取所有可改写文本（work/project 的 items[].description，
// skills/summary 的顶层 content），用于喂给 LLM。返回顺序稳定，便于 prompt 编号。
func collectOptimizableFields(content map[string]interface{}) []jdOptimizeField {
	var out []jdOptimizeField
	modules, ok := content["modules"].([]interface{})
	if !ok {
		return out
	}
	for _, m := range modules {
		mod, ok := m.(map[string]interface{})
		if !ok {
			continue
		}
		id, _ := mod["id"].(string)
		mType, _ := mod["type"].(string)
		data, _ := mod["data"].(map[string]interface{})
		if id == "" || data == nil {
			continue
		}
		switch mType {
		case "work", "project":
			items, _ := data["items"].([]interface{})
			for i, raw := range items {
				it, ok := raw.(map[string]interface{})
				if !ok {
					continue
				}
				desc, _ := it["description"].(string)
				if strings.TrimSpace(desc) == "" {
					continue
				}
				out = append(out, jdOptimizeField{ModuleID: id, Kind: "item", ItemIdx: i, Text: desc})
			}
		case "skills", "summary":
			c, _ := data["content"].(string)
			if strings.TrimSpace(c) != "" {
				out = append(out, jdOptimizeField{ModuleID: id, Kind: "module", Text: c})
			}
		}
	}
	return out
}

// OptimizeForJD 基于 JD 生成优化后的简历 content（只改文本字段，结构完全保留）。
// 返回优化后的完整 content（可直接落快照）+ notes 优化说明 + changedCount + model。
// 不落库——落库由 handler 调 resumeService.CreateSnapshotWithContent 完成（service 解耦）。
func (s *service) OptimizeForJD(ctx context.Context, userID string, req model.JDOptimizeRequest) (map[string]interface{}, []string, int, string, error) {
	cfg, err := s.cfgRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, nil, 0, "", ErrAIConfigNotFound
	}
	if !cfg.Enabled {
		return nil, nil, 0, "", fmt.Errorf("AI 功能未启用")
	}
	apiKey, err := s.encryption.Decrypt(cfg.APIKeyEncrypted)
	if err != nil {
		return nil, nil, 0, "", fmt.Errorf("failed to decrypt API key")
	}

	fields := collectOptimizableFields(req.Content)
	if len(fields) == 0 {
		return nil, nil, 0, "", fmt.Errorf("简历中没有可优化的文本内容")
	}

	prompt := buildJDOptimizePrompt(req, fields)
	maskedPrompt, san := s.maskPrompt(prompt)
	result, err := s.aiProvider.Complete(ctx, CompleteRequest{
		APIKey:    apiKey,
		BaseURL:   cfg.BaseURL,
		Model:     cfg.DefaultModel,
		Prompt:    maskedPrompt,
		TimeoutMs: cfg.TimeoutMs,
	})
	if err != nil {
		log.Printf("[ai] OptimizeForJD failed: %v", err)
		return nil, nil, 0, "", ErrAIRequestFailed
	}
	text := s.unmaskResponse(san, result.Text)

	// 解析 LLM 返回：{"changes":[{"index":N,"text":"新文本"}],"notes":[...]}
	firstBrace := strings.Index(text, "{")
	lastBrace := strings.LastIndex(text, "}")
	if firstBrace == -1 || lastBrace == -1 || lastBrace <= firstBrace {
		return nil, nil, 0, "", fmt.Errorf("failed to parse AI response")
	}
	var parsed struct {
		Changes []struct {
			Index int    `json:"index"`
			Text  string `json:"text"`
		} `json:"changes"`
		Notes []string `json:"notes"`
	}
	if err := json.Unmarshal([]byte(text[firstBrace:lastBrace+1]), &parsed); err != nil {
		return nil, nil, 0, "", fmt.Errorf("failed to parse AI response: %w", err)
	}

	// 把改动按 index 合并回 content 的深拷贝（只覆盖对应文本字段，结构字段一律不动）
	optimized := deepCopyContent(req.Content)
	changed := applyOptimizedFields(optimized, fields, parsed.Changes)

	if changed == 0 {
		return nil, nil, 0, "", fmt.Errorf("AI 未产生有效优化")
	}
	return optimized, parsed.Notes, changed, cfg.DefaultModel, nil
}

// applyOptimizedFields 按 LLM 返回的 {index,text} 覆盖 fields[index] 指向的文本字段。
// index 越界、文本为空、与原文相同的改动都跳过。返回实际改动数。
func applyOptimizedFields(content map[string]interface{}, fields []jdOptimizeField, changes []struct {
	Index int    `json:"index"`
	Text  string `json:"text"`
}) int {
	modules, _ := content["modules"].([]interface{})
	// 建 moduleID -> module map 便于定位
	modByID := make(map[string]map[string]interface{})
	for _, m := range modules {
		if mod, ok := m.(map[string]interface{}); ok {
			if id, _ := mod["id"].(string); id != "" {
				modByID[id] = mod
			}
		}
	}

	changed := 0
	for _, ch := range changes {
		if ch.Index < 0 || ch.Index >= len(fields) {
			continue
		}
		newText := strings.TrimSpace(ch.Text)
		f := fields[ch.Index]
		if newText == "" || newText == strings.TrimSpace(f.Text) {
			continue
		}
		mod := modByID[f.ModuleID]
		if mod == nil {
			continue
		}
		data, _ := mod["data"].(map[string]interface{})
		if data == nil {
			continue
		}
		switch f.Kind {
		case "item":
			items, _ := data["items"].([]interface{})
			if f.ItemIdx < 0 || f.ItemIdx >= len(items) {
				continue
			}
			if it, ok := items[f.ItemIdx].(map[string]interface{}); ok {
				it["description"] = newText
				changed++
			}
		case "module":
			data["content"] = newText
			changed++
		}
	}
	return changed
}

// deepCopyContent 通过 JSON 往返做深拷贝，避免改动污染入参
func deepCopyContent(content map[string]interface{}) map[string]interface{} {
	b, _ := json.Marshal(content)
	var out map[string]interface{}
	_ = json.Unmarshal(b, &out)
	if out == nil {
		out = map[string]interface{}{}
	}
	return out
}

func buildJDOptimizePrompt(req model.JDOptimizeRequest, fields []jdOptimizeField) string {
	var sb strings.Builder
	for i, f := range fields {
		sb.WriteString(fmt.Sprintf("[%d] %s\n", i, strings.TrimSpace(f.Text)))
	}

	return fmt.Sprintf(`你是资深简历优化顾问。基于目标 JD，优化候选人简历各条文本的表述，使其更贴合岗位要求。

【强制规则】
1. 只返回一个 JSON 对象，禁止 Markdown、代码块、注释。
2. 严禁编造：不得新增/虚构经历、公司、项目、技术栈、奖项、数字。只能对【已有内容】做重组、突出、措辞优化、与 JD 关键词对齐。
3. 强化 Action/Result，使用强动词；需要数字但原文未提供时用定性表述（如"显著提升"），禁止输出 [estimated]、百分比占位、N 等占位符。
4. 保留原文的 HTML 结构（<ul>/<li>/<p> 等），只改文字；保留隐私脱敏标记（如 [NAME_N]、[PHONE_N]）。
5. 按编号返回改动；未改动或无需优化的条目不要返回。
6. notes 用 3-5 条简述优化思路（如"突出与 JD 匹配的 Redis/Kafka 经验"）。

【返回格式】
{"changes":[{"index":0,"text":"优化后文本（保留原 HTML 结构）"}],"notes":["..."]}

【目标岗位】
%s

【目标公司】
%s

【目标 JD】
%s

【待优化文本（按编号，可能含 HTML 标签）】
%s`,
		strings.TrimSpace(req.TargetTitle),
		strings.TrimSpace(req.CompanyName),
		strings.TrimSpace(req.JDText),
		sb.String(),
	)
}
