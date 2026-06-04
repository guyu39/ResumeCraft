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

// localeFontFallback 字体回退映射
var localeFontFallback = map[string]struct {
	BodyFont string
}{
	"zh-CN": {BodyFont: "Microsoft YaHei"},
	"en-US": {BodyFont: "Georgia"},
}

// Translate 翻译简历
func (s *service) Translate(ctx context.Context, userID string, req model.TranslateRequest, resumeContent map[string]interface{}) (*model.TranslateResponse, error) {
	// 1. 获取 AI 配置
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

	// 2. 构建翻译 prompt
	sourceLocale, _ := resumeContent["locale"].(string)
	if sourceLocale == "" {
		sourceLocale = "zh-CN"
	}
	prompt := buildTranslatePrompt(resumeContent, sourceLocale, req.TargetLocale, req.Options.KeepChineseFields)

	// 脱敏
	maskedPrompt, san := s.maskPrompt(prompt)

	// 3. 调用 AI（非流式）
	result, err := s.aiProvider.Complete(ctx, CompleteRequest{
		APIKey:    apiKey,
		BaseURL:   cfg.BaseURL,
		Model:     cfg.DefaultModel,
		Prompt:    maskedPrompt,
		TimeoutMs: cfg.TimeoutMs,
	})
	if err != nil {
		log.Printf("[ai] Translate failed: %v", err)
		return nil, ErrAIRequestFailed
	}
	// 还原脱敏
	result.Text = s.unmaskResponse(san, result.Text)

	// 4. 解析响应
	log.Printf("[ai] Translate AI response (first 800 chars): %s", truncateStr(result.Text, 800))
	// 兼容两种类型：[]map[string]interface{}（来自 ResumeDetail）或 []interface{}
	var originalModules []interface{}
	switch v := resumeContent["modules"].(type) {
	case []map[string]interface{}:
		for _, m := range v {
			originalModules = append(originalModules, m)
		}
	case []interface{}:
		originalModules = v
	default:
		return nil, fmt.Errorf("invalid modules type in resume content")
	}
	// 只保留 visible 的模块（与发送给 AI 的模块一致，避免索引错位）
	visibleOriginalModules := make([]map[string]interface{}, 0, len(originalModules))
	for _, m := range originalModules {
		if mm, ok := m.(map[string]interface{}); ok && mm["visible"] != false {
			visibleOriginalModules = append(visibleOriginalModules, mm)
		}
	}

	translatedModules, translatedTitle, warnings, err := parseTranslateResponse(result.Text, visibleOriginalModules)
	if err != nil {
		log.Printf("[ai] Failed to parse translate response: %v", err)
		return nil, fmt.Errorf("翻译结果解析失败")
	}

	// 5. 将翻译结果合并回原始模块（包含不可见模块）
	finalModules := make([]map[string]interface{}, 0, len(originalModules))
	visIdx := 0
	for _, m := range originalModules {
		mm, ok := m.(map[string]interface{})
		if !ok {
			finalModules = append(finalModules, mm)
			continue
		}
		if mm["visible"] == false {
			// 不可见模块保留原样
			finalModules = append(finalModules, mm)
			continue
		}
		if visIdx < len(translatedModules) {
			// 合并：用翻译结果覆盖可见模块，但保留原 id 和 visible
			merged := make(map[string]interface{})
			merged["id"] = mm["id"]
			merged["visible"] = mm["visible"]
			merged["type"] = translatedModules[visIdx]["type"]
			if title, ok := translatedModules[visIdx]["title"]; ok {
				merged["title"] = title
			}
			if data, ok := translatedModules[visIdx]["data"]; ok {
				merged["data"] = mergeData(mm["data"], data)
			} else {
				merged["data"] = mm["data"]
			}
			finalModules = append(finalModules, merged)
			visIdx++
		} else {
			// 翻译模块不足，保留原模块
			finalModules = append(finalModules, mm)
		}
	}
	var suggestedSettings *model.ResumeStyleSettings
	if req.Options.FontFallback {
		if fallback, ok := localeFontFallback[req.TargetLocale]; ok {
			// 从源简历 styleSettings 中取值并覆盖字体
			if ssRaw, ok := resumeContent["styleSettings"].(map[string]interface{}); ok {
				ss := model.ResumeStyleSettings{}
				if v, ok := ssRaw["fontFamily"].(string); ok {
					ss.FontFamily = v
				}
				if v, ok := ssRaw["fontSize"].(float64); ok {
					ss.FontSize = v
				}
				if v, ok := ssRaw["textColor"].(string); ok {
					ss.TextColor = v
				}
				if v, ok := ssRaw["lineHeight"].(float64); ok {
					ss.LineHeight = v
				}
				if v, ok := ssRaw["pagePaddingHorizontal"].(float64); ok {
					ss.PagePaddingHorizontal = v
				}
				if v, ok := ssRaw["pagePaddingVertical"].(float64); ok {
					ss.PagePaddingVertical = v
				}
				if v, ok := ssRaw["moduleSpacing"].(float64); ok {
					ss.ModuleSpacing = v
				}
				if v, ok := ssRaw["paragraphSpacing"].(float64); ok {
					ss.ParagraphSpacing = v
				}
				if v, ok := ssRaw["moduleTitleLinePosition"].(string); ok {
					ss.ModuleTitleLinePosition = v
				}
				if v, ok := ssRaw["moduleTitleMarkerStyle"].(string); ok {
					ss.ModuleTitleMarkerStyle = v
				}
				if v, ok := ssRaw["moduleTitleMarkerVisible"].(bool); ok {
					ss.ModuleTitleMarkerVisible = v
				}
				ss.FontFamily = fallback.BodyFont
				suggestedSettings = &ss
			}
		}
	}

	// 6. 保存 AI 对话
	convID := uuid.New().String()
	contextData := map[string]any{
		"sourceResumeId":  req.ResumeID,
		"sourceLocale":    sourceLocale,
		"targetLocale":    req.TargetLocale,
		"translatedTitle": translatedTitle,
		"warnings":        warnings,
		"model":           cfg.DefaultModel,
	}
	contextJSON, _ := json.Marshal(contextData)

	localeName := map[string]string{"zh-CN": "中文", "en-US": "英文"}
	conversation := &aiStorage.ConversationRecord{
		ID:       convID,
		UserID:   userID,
		ResumeID: &req.ResumeID,
		Type:     string(model.ConversationTypeTranslate),
		Title:    stringPtr(fmt.Sprintf("简历翻译 %s → %s", localeName[sourceLocale], localeName[req.TargetLocale])),
		Context:  contextJSON,
	}
	if err := s.repo.Create(ctx, conversation); err != nil {
		log.Printf("[ai] Failed to create translate conversation: %v", err)
	}
	s.repo.AddMessage(ctx, &aiStorage.MessageRecord{
		ID:             uuid.New().String(),
		ConversationID: convID,
		Role:           "user",
		Content:        prompt,
		Model:          &cfg.DefaultModel,
	})
	s.repo.AddMessage(ctx, &aiStorage.MessageRecord{
		ID:             uuid.New().String(),
		ConversationID: convID,
		Role:           "assistant",
		Content:        result.Text,
		Model:          &cfg.DefaultModel,
	})

	return &model.TranslateResponse{
		TranslatedModules:      finalModules,
		TranslatedTitle:        translatedTitle,
		TargetLocale:           req.TargetLocale,
		SuggestedStyleSettings: suggestedSettings,
		ConversationID:         convID,
		Model:                  cfg.DefaultModel,
		Warnings:               warnings,
	}, nil
}

// ============ 翻译 Prompt ============

func buildTranslatePrompt(resumeContent map[string]interface{}, sourceLocale, targetLocale string, keepChineseFields bool) string {
	var sb strings.Builder

	sb.WriteString("你是资深简历翻译专家，将简历从一种语言翻译为另一种语言，严格遵循以下规则。\n\n")

	// ====== 强制规则 ======
	sb.WriteString("【强制规则】\n")
	sb.WriteString("1. 只返回一个 JSON 对象，禁止输出 Markdown、代码块、注释或额外说明。\n")
	sb.WriteString("2. 翻译必须覆盖所有模块的所有文本字段，禁止遗漏。\n")
	sb.WriteString("3. 翻译后的模块结构（type、id、visible）必须与源简历完全一致，禁止增删模块或改变顺序。\n")
	sb.WriteString("4. items 数组的顺序和 id 必须与源简历一致，禁止重排或合并。\n")
	sb.WriteString("5. 翻译应自然、专业、适合目标语言国家的求职文化，而非逐字直译。\n")
	sb.WriteString("6. 日期格式保持不变（YYYY-MM 或 YYYY-MM-DD），URL、邮箱、电话号码等纯数据字段不翻译。\n")
	sb.WriteString("7. techStack 数组中的技术名词不翻译（如 React、Go、Kubernetes 保持原样）。\n\n")

	// ====== 枚举映射规则 ======
	sb.WriteString("【枚举字段映射规则】\n")
	if targetLocale == "en-US" {
		sb.WriteString("degree 字段映射：初中→Middle School, 中专→Vocational, 高中→High School, 大专→Associate, 本科→Bachelor, 硕士→Master, 博士→PhD\n")
		sb.WriteString("skillLevel 保持数值不变（1=Beginner, 2=Familiar, 3=Proficient, 4=Expert），但 level 字段中的中文标签不出现\n")
		sb.WriteString("workYears 映射：应届毕业生→Fresh Graduate, 1年以下→Less than 1 year, 1-3年→1-3 years, 3-5年→3-5 years, 5-10年→5-10 years, 10年以上→10+ years\n")
	} else {
		sb.WriteString("degree 字段映射：Middle School→初中, Vocational→中专, High School→高中, Associate→大专, Bachelor→本科, Master→硕士, PhD→博士\n")
		sb.WriteString("skillLevel 保持数值不变（1=入门, 2=熟悉, 3=熟练, 4=精通）\n")
		sb.WriteString("workYears 映射：Fresh Graduate→应届毕业生, Less than 1 year→1年以下, 1-3 years→1-3年, 3-5 years→3-5年, 5-10 years→5-10年, 10+ years→10年以上\n")
	}

	// ====== 模块标题映射 ======
	sb.WriteString("\n【模块标题映射规则】\n")
	if targetLocale == "en-US" {
		sb.WriteString("personal→Personal Information, education→Education, work→Work Experience, project→Projects, skills→Skills, summary→Summary, languages→Languages, awards→Awards & Honors, certificates→Certifications, portfolio→Portfolio, custom→翻译 title 字段\n")
	} else {
		sb.WriteString("Personal Information→个人信息, Education→教育经历, Work Experience→工作经历, Projects→项目经历, Skills→专业技能, Summary→自我评价, Languages→语言能力, Awards & Honors→荣誉奖项, Certifications→证书资质, Portfolio→作品链接\n")
	}

	// ====== 中国特有字段处理 ======
	if !keepChineseFields && targetLocale == "en-US" {
		sb.WriteString("\n【中国特有字段处理】\n")
		sb.WriteString("英文简历中通常不包含以下字段，请将对应字段设为空字符串：\n")
		sb.WriteString("- politics（政治面貌）：设为空字符串\n")
		sb.WriteString("- hometown（籍贯）：设为空字符串\n")
		sb.WriteString("- gender（性别）：设为空字符串\n")
		sb.WriteString("- age（年龄/出生年月）：设为空字符串\n")
		sb.WriteString("请在 warnings 数组中列出被隐藏的字段名。\n")
	}

	// ====== 返回格式 ======
	sb.WriteString("\n【返回格式强制要求】\n")
	sb.WriteString("{\n")
	sb.WriteString("  \"translatedTitle\": \"翻译后的简历标题\",\n")
	sb.WriteString("  \"modules\": [与源简历模块结构完全一致的数组，仅文本内容被翻译],\n")
	sb.WriteString("  \"warnings\": [\"被隐藏或调整的字段说明\"]\n")
	sb.WriteString("}\n\n")

	// ====== 源简历数据 ======
	localeName := map[string]string{"zh-CN": "中文", "en-US": "英文"}
	sb.WriteString(fmt.Sprintf("【翻译方向】%s → %s\n\n", localeName[sourceLocale], localeName[targetLocale]))
	sb.WriteString("【源简历 JSON】\n")
	data, _ := json.Marshal(sanitizeAIResumeContent(resumeContent))
	sb.WriteString(string(data))

	return sb.String()
}

// ============ 翻译响应解析 ============

func parseTranslateResponse(text string, originalModules []map[string]interface{}) (
	[]map[string]interface{}, string, []string, error,
) {
	// 提取 JSON：先尝试从 markdown 代码块中提取，再 fallback 到大括号匹配
	jsonStr := extractJSONFromText(text)
	if jsonStr == "" {
		log.Printf("[ai] Translate raw response (first 500 chars): %s", truncateStr(text, 500))
		return nil, "", nil, fmt.Errorf("no JSON found in AI response")
	}

	// 先尝试用严格结构解析
	var resp struct {
		TranslatedTitle string                   `json:"translatedTitle"`
		Modules         []map[string]interface{} `json:"modules"`
		Warnings        []string                 `json:"warnings"`
	}
	if err := json.Unmarshal([]byte(jsonStr), &resp); err != nil {
		log.Printf("[ai] Translate JSON parse error: %v", err)
		log.Printf("[ai] Translate extracted JSON (first 300 chars): %s", truncateStr(jsonStr, 300))
		return nil, "", nil, fmt.Errorf("failed to parse JSON: %w", err)
	}

	// 如果 modules 为空，尝试 alternate key "translatedModules"
	if len(resp.Modules) == 0 {
		var altResp struct {
			TranslatedTitle string                   `json:"translatedTitle"`
			Modules         []map[string]interface{} `json:"translatedModules"`
			Warnings        []string                 `json:"warnings"`
		}
		if err := json.Unmarshal([]byte(jsonStr), &altResp); err == nil && len(altResp.Modules) > 0 {
			resp.Modules = altResp.Modules
			resp.TranslatedTitle = altResp.TranslatedTitle
			resp.Warnings = altResp.Warnings
		}
	}

	// 如果 modules 仍为空，尝试把整个 JSON 解析为 modules 数组
	if len(resp.Modules) == 0 {
		var modulesArr []map[string]interface{}
		if err := json.Unmarshal([]byte(jsonStr), &modulesArr); err == nil && len(modulesArr) > 0 {
			// AI 直接返回了模块数组，没有包装对象
			log.Printf("[ai] Translate: AI returned bare modules array, merging directly")
			merged := mergeTranslatedModules(originalModules, modulesArr)
			return merged, "", []string{}, nil
		}
	}

	if len(resp.Modules) == 0 {
		log.Printf("[ai] Translate: parsed JSON but modules is empty. Raw response (first 500 chars): %s", truncateStr(text, 500))
		return nil, "", nil, fmt.Errorf("translated modules is empty")
	}

	// 合并：保留原模块的 id 和 visible，用翻译内容覆盖
	merged := mergeTranslatedModules(originalModules, resp.Modules)

	warnings := resp.Warnings
	if warnings == nil {
		warnings = []string{}
	}

	return merged, resp.TranslatedTitle, warnings, nil
}

// extractJSONFromText 从 AI 响应中提取 JSON 字符串
// 支持：纯 JSON、markdown 代码块包裹的 JSON、混合文本中的 JSON
func extractJSONFromText(text string) string {
	text = strings.TrimSpace(text)

	// 1. 尝试从 markdown 代码块提取 ```json ... ```
	if idx := strings.Index(text, "```json"); idx != -1 {
		start := idx + len("```json")
		if end := strings.Index(text[start:], "```"); end != -1 {
			candidate := strings.TrimSpace(text[start : start+end])
			if strings.HasPrefix(candidate, "{") || strings.HasPrefix(candidate, "[") {
				return candidate
			}
		}
	}
	// 也尝试 ``` ... ``` （无语言标注）
	if idx := strings.Index(text, "```"); idx != -1 {
		start := idx + len("```")
		// 跳过可能的语言标识行
		newlineIdx := strings.Index(text[start:], "\n")
		if newlineIdx != -1 {
			start += newlineIdx + 1
		}
		if end := strings.Index(text[start:], "```"); end != -1 {
			candidate := strings.TrimSpace(text[start : start+end])
			if strings.HasPrefix(candidate, "{") || strings.HasPrefix(candidate, "[") {
				return candidate
			}
		}
	}

	// 2. 尝试从大括号匹配提取
	firstBrace := strings.Index(text, "{")
	lastBrace := strings.LastIndex(text, "}")
	if firstBrace != -1 && lastBrace != -1 && lastBrace > firstBrace {
		return text[firstBrace : lastBrace+1]
	}

	// 3. 尝试中括号匹配（可能直接返回数组）
	firstBracket := strings.Index(text, "[")
	lastBracket := strings.LastIndex(text, "]")
	if firstBracket != -1 && lastBracket != -1 && lastBracket > firstBracket {
		return text[firstBracket : lastBracket+1]
	}

	return ""
}

// truncateStr 截断字符串
func truncateStr(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

// mergeTranslatedModules 将翻译结果合并回原模块结构
// 策略：按 index 一一对应，保留原 id/visible/type，替换 data 和 title
func mergeTranslatedModules(original, translated []map[string]interface{}) []map[string]interface{} {
	result := make([]map[string]interface{}, len(original))
	for i, orig := range original {
		merged := make(map[string]interface{})
		// 保留结构性字段
		for _, key := range []string{"id", "type", "visible"} {
			if v, ok := orig[key]; ok {
				merged[key] = v
			}
		}
		// 从翻译结果中取 title 和 data
		if i < len(translated) {
			if title, ok := translated[i]["title"]; ok {
				merged["title"] = title
			}
			if data, ok := translated[i]["data"]; ok {
				// 合并 data：保留原 id，用翻译的文本
				merged["data"] = mergeData(orig["data"], data)
			} else {
				merged["data"] = orig["data"]
			}
		} else {
			// 翻译模块不足，保留原模块
			merged["title"] = orig["title"]
			merged["data"] = orig["data"]
		}
		result[i] = merged
	}
	return result
}

// mergeData 合并模块数据：保留 id 字段，替换文本字段
func mergeData(originalData, translatedData interface{}) interface{} {
	origMap, ok1 := originalData.(map[string]interface{})
	transMap, ok2 := translatedData.(map[string]interface{})
	if !ok1 || !ok2 {
		return translatedData // 无法合并时直接使用翻译结果
	}

	result := make(map[string]interface{})
	// 先写入翻译结果
	for k, v := range transMap {
		result[k] = v
	}
	// 对 items 数组，逐项保留原 id
	if origItems, ok1 := origMap["items"].([]interface{}); ok1 {
		if transItems, ok2 := transMap["items"].([]interface{}); ok2 {
			mergedItems := make([]interface{}, len(origItems))
			for i := range origItems {
				if i < len(transItems) {
					if origItem, ok1 := origItems[i].(map[string]interface{}); ok1 {
						if transItem, ok2 := transItems[i].(map[string]interface{}); ok2 {
							mergedItem := make(map[string]interface{})
							for k, v := range transItem {
								mergedItem[k] = v
							}
							if origID, hasID := origItem["id"]; hasID {
								mergedItem["id"] = origID
							}
							mergedItems[i] = mergedItem
							continue
						}
					}
					mergedItems[i] = transItems[i]
				} else {
					mergedItems[i] = origItems[i]
				}
			}
			result["items"] = mergedItems
		}
	}
	return result
}
