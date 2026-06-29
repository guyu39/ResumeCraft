package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"resumecraft-pdf-backend/internal/model"
	aiStorage "resumecraft-pdf-backend/internal/storage/ai"

	"github.com/google/uuid"
)

// ============ STAR 引导改写（两阶段：分析 → 生成） ============

// AnalyzeStar 阶段一：分析原文已有/缺失哪些 STAR 维度，不编造内容
func (s *service) AnalyzeStar(ctx context.Context, userID string, req model.StarAnalyzeRequest) (*model.StarAnalyzeResponse, error) {
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

	prompt := buildStarAnalyzePrompt(req.Scenario)
	maskedPrompt, san := s.maskPrompt(prompt)
	result, err := s.aiProvider.Complete(ctx, CompleteRequest{
		APIKey:    apiKey,
		BaseURL:   cfg.BaseURL,
		Model:     cfg.DefaultModel,
		Prompt:    maskedPrompt,
		TimeoutMs: cfg.TimeoutMs,
	})
	if err != nil {
		log.Printf("[ai] AnalyzeStar failed: %v", err)
		return nil, ErrAIRequestFailed
	}
	result.Text = s.unmaskResponse(san, result.Text)

	resp, err := parseStarAnalyzeResponse(result.Text)
	if err != nil {
		log.Printf("[ai] Failed to parse STAR analyze response: %v, text: %s", err, result.Text)
		return nil, fmt.Errorf("failed to parse AI response")
	}
	resp.Model = cfg.DefaultModel
	return resp, nil
}

// GenerateStar 阶段二：结合用户补充内容生成 STAR HTML
func (s *service) GenerateStar(ctx context.Context, userID string, req model.StarGenerateRequest) (*model.EnhanceResponse, error) {
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

	prompt := buildStarGeneratePrompt(req.Scenario, req.Supplements)
	maskedPrompt, san := s.maskPrompt(prompt)
	result, err := s.aiProvider.Complete(ctx, CompleteRequest{
		APIKey:    apiKey,
		BaseURL:   cfg.BaseURL,
		Model:     cfg.DefaultModel,
		Prompt:    maskedPrompt,
		TimeoutMs: cfg.TimeoutMs,
	})
	if err != nil {
		log.Printf("[ai] GenerateStar failed: %v", err)
		return nil, ErrAIRequestFailed
	}
	result.Text = s.unmaskResponse(san, result.Text)
	return &model.EnhanceResponse{Result: strings.TrimSpace(result.Text)}, nil
}

func buildStarAnalyzePrompt(scenario string) string {
	return fmt.Sprintf(`你是资深简历撰写顾问，擅长用 STAR（Situation-Task-Action-Result）法则分析经历描述。

【隐私保护声明 — 必须遵守】
原文中以 [NAME_N]、[PHONE_N]、[EMAIL_N] 等固定格式出现的内容为隐私脱敏标记，分析时原样保留，禁止判定为缺失或无效。

【任务】
分析以下经历描述，判断 S/T/A/R 四个维度原文是否已包含，并抽取已有内容。

【强制规则】
1. 只返回一个 JSON 对象，禁止 Markdown、代码块、注释或额外说明。
2. extracted 必须来自原文，禁止编造原文没有的内容；该维度缺失时 extracted 为空字符串。
3. 缺失的维度（present=false）必须给出引导式提问 hint，帮助用户补充该维度。
4. 必须固定返回 S、T、A、R 四个维度，顺序固定。

【返回格式】
{
  "dimensions": [
    {"key":"S","label":"Situation","present":true/false,"extracted":"原文中的背景内容","hint":"缺失时的引导问题，如：当时面临什么业务挑战或问题？"},
    {"key":"T","label":"Task","present":true/false,"extracted":"","hint":"你负责的具体目标是什么？"},
    {"key":"A","label":"Action","present":true/false,"extracted":"","hint":"你采取了哪些具体行动或技术手段？"},
    {"key":"R","label":"Result","present":true/false,"extracted":"","hint":"带来了什么结果？能否量化（如提升 X%%、节省 Y 小时）？"}
  ]
}

【经历描述】
%s`, scenario)
}

func buildStarGeneratePrompt(scenario string, supplements map[string]string) string {
	var sb strings.Builder
	sb.WriteString(`你是一位资深简历撰写顾问，擅长将项目描述重构为 STAR（Situation-Task-Action-Result）格式。

请将以下经历描述改写为 STAR 结构，使内容更具说服力和面试可读性。

【隐私保护声明 — 必须遵守】
原文中以 [NAME_N]、[PHONE_N]、[EMAIL_N] 等固定格式出现的内容为隐私脱敏标记，改写时原样保留，禁止修改或删除。

【STAR 结构要求】
- S (Situation)：一句话交代背景与面临的挑战
- T (Task)：明确你承担的任务目标
- A (Action)：你采取的具体行动与技术手段
- R (Result)：带来的具体结果，尽可能量化

【强制规则】
1. 禁止编造完全不存在的经历、公司、技术栈或结果。
2. 如需推断数字，必须在文本中标注 [estimated]。
3. 充分利用用户补充的维度内容（如有）。

【输出要求】
使用 HTML 格式输出（即将被填充到富文本编辑器中），不要使用 Markdown。
- 用 <strong>...</strong> 标注关键动词和量化数据
- 每个字母段用 <p><strong>S (Situation)</strong>：...</p> 的格式
不要输出任何额外说明，不要包裹在代码块中。
`)

	if len(supplements) > 0 {
		sb.WriteString("\n【用户补充内容】\n")
		for _, key := range []string{"S", "T", "A", "R"} {
			if v := strings.TrimSpace(supplements[key]); v != "" {
				sb.WriteString(fmt.Sprintf("%s：%s\n", key, v))
			}
		}
	}

	sb.WriteString("\n【经历描述】\n")
	sb.WriteString(scenario)
	return sb.String()
}

func parseStarAnalyzeResponse(text string) (*model.StarAnalyzeResponse, error) {
	firstBrace := strings.Index(text, "{")
	lastBrace := strings.LastIndex(text, "}")
	if firstBrace == -1 || lastBrace == -1 || lastBrace <= firstBrace {
		return nil, fmt.Errorf("invalid JSON response")
	}
	jsonStr := text[firstBrace : lastBrace+1]

	var resp struct {
		Dimensions []model.StarDimension `json:"dimensions"`
	}
	if err := json.Unmarshal([]byte(jsonStr), &resp); err != nil {
		return nil, err
	}
	if len(resp.Dimensions) == 0 {
		return nil, fmt.Errorf("star analyze dimensions are empty")
	}
	return &model.StarAnalyzeResponse{Dimensions: resp.Dimensions}, nil
}

// ============ 实时写作助手诊断（非流式、不落库） ============

// DiagnoseWriting 对当前编辑的要点做快速诊断
func (s *service) DiagnoseWriting(ctx context.Context, userID string, req model.WritingDiagnoseRequest) (*model.WritingDiagnoseResponse, error) {
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

	prompt := buildWritingDiagnosePrompt(req.ModuleType, req.FieldKey, req.Content)
	maskedPrompt, san := s.maskPrompt(prompt)
	result, err := s.aiProvider.Complete(ctx, CompleteRequest{
		APIKey:    apiKey,
		BaseURL:   cfg.BaseURL,
		Model:     cfg.DefaultModel,
		Prompt:    maskedPrompt,
		TimeoutMs: cfg.TimeoutMs,
	})
	if err != nil {
		log.Printf("[ai] DiagnoseWriting failed: %v", err)
		return nil, ErrAIRequestFailed
	}
	result.Text = s.unmaskResponse(san, result.Text)

	resp, err := parseWritingDiagnoseResponse(result.Text)
	if err != nil {
		log.Printf("[ai] Failed to parse writing diagnose response: %v, text: %s", err, result.Text)
		return nil, fmt.Errorf("failed to parse AI response")
	}
	resp.Model = cfg.DefaultModel
	return resp, nil
}

func buildWritingDiagnosePrompt(moduleType, fieldKey, content string) string {
	return fmt.Sprintf(`你是资深简历写作助手，对用户正在编辑的简历要点做快速诊断，给出简短、可落地的提示。

【隐私保护声明 — 必须遵守】
原文中以 [NAME_N]、[PHONE_N]、[EMAIL_N] 等固定格式出现的内容为隐私脱敏标记，诊断时视为有效内容，禁止判定为缺失或无效。

【诊断维度，code 仅允许以下固定枚举】
- duty_not_result：只写职责（负责/参与/协助），没有体现产出和成果
- missing_metrics：缺少量化数据（数字、百分比、规模）
- weak_verb：句首动词偏弱（负责、参与、做了等），可换成更有力的动词
- too_long：单条表述过长（>80字）且未分点，建议拆分
- vague：表述空泛（"提升效率""优化体验"），缺少具体说明
- passive：被动语态或缺少行为主语

【强制规则】
1. 只返回一个 JSON 对象，禁止 Markdown、代码块、注释或额外说明。
2. 最多返回 4 条诊断，按严重程度排序（high → low）。
3. 若内容写得好、无明显问题，必须返回 {"diagnoses":[]}，禁止为凑数硬挑问题。
4. 只诊断不改写正文。quickFix 仅在 weak_verb 等可直接替换的场景给出简短替换词，其余留空字符串。
5. 严禁编造候选人没有的数字或成果，missing_metrics 只提示「缺少量化」，不得补造具体数字。
6. label 必须是一句话的中文诊断，简洁可落地（如「只写了职责，建议补充具体成果」）。

【返回格式】
{
  "diagnoses": [
    {"code":"duty_not_result","severity":"high","label":"只写了职责，建议补充具体产出与成果","span":"命中的原文片段或留空","quickFix":""}
  ]
}

【当前编辑信息】
模块类型：%s
字段：%s
当前内容：
%s`, moduleType, fieldKey, content)
}

func parseWritingDiagnoseResponse(text string) (*model.WritingDiagnoseResponse, error) {
	firstBrace := strings.Index(text, "{")
	lastBrace := strings.LastIndex(text, "}")
	if firstBrace == -1 || lastBrace == -1 || lastBrace <= firstBrace {
		return nil, fmt.Errorf("invalid JSON response")
	}
	jsonStr := text[firstBrace : lastBrace+1]

	var resp struct {
		Diagnoses []model.WritingDiagnosis `json:"diagnoses"`
	}
	if err := json.Unmarshal([]byte(jsonStr), &resp); err != nil {
		return nil, err
	}
	// 空数组是合法结果（内容无问题）
	if resp.Diagnoses == nil {
		resp.Diagnoses = []model.WritingDiagnosis{}
	}
	return &model.WritingDiagnoseResponse{Diagnoses: resp.Diagnoses}, nil
}

// ============ 简历一致性体检（流式） ============

// StreamCheckup 跨模块一致性体检，复刻 StreamEvaluate 的 NDJSON 流式骨架
func (s *service) StreamCheckup(ctx context.Context, userID string, req model.ResumeCheckupRequest, onEvent func(StreamEvent)) (*model.ResumeCheckupResponse, error) {
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

	checkupModel := cfg.DefaultModel
	prompt := buildCheckupPrompt(req.Content, req.ContentAlt)
	maskedPrompt, san := s.maskPrompt(prompt)

	onEvent(StreamEvent{Type: "model", Model: checkupModel})

	accumulated := &strings.Builder{}
	pendingBuf := ""
	ch := make(chan string)
	doneCh := make(chan struct{})

	var (
		pendingSummary     string
		pendingHealthScore *int
		pendingFindings    []model.CheckupFinding
		prevType           string
	)

	flushModule := func() {
		if pendingSummary != "" {
			onEvent(StreamEvent{Type: "summary", Summary: pendingSummary})
			pendingSummary = ""
		}
		if pendingHealthScore != nil {
			onEvent(StreamEvent{Type: "health_score", HealthScore: pendingHealthScore})
			pendingHealthScore = nil
		}
		if len(pendingFindings) > 0 {
			onEvent(StreamEvent{Type: "finding_item", Findings: pendingFindings})
			pendingFindings = nil
		}
	}

	flushLine := func(line string) {
		line = strings.TrimSpace(line)
		if line == "" || !strings.HasPrefix(line, "{") || !strings.HasSuffix(line, "}") {
			return
		}
		var obj map[string]interface{}
		if err := json.Unmarshal([]byte(line), &obj); err != nil {
			return
		}
		accumulated.WriteString(line)
		accumulated.WriteByte('\n')

		evtType := getString(obj["type"])
		if prevType != "" && evtType != prevType {
			flushModule()
			time.Sleep(200 * time.Millisecond)
		}
		prevType = evtType

		switch evtType {
		case "summary":
			pendingSummary = getString(obj["content"])
		case "health_score":
			score := int(getFloat(obj["score"]))
			pendingHealthScore = &score
		case "finding_item":
			if code := getString(obj["code"]); code != "" {
				pendingFindings = append(pendingFindings, model.CheckupFinding{
					Code:       code,
					Severity:   getString(obj["severity"]),
					Title:      getString(obj["title"]),
					Detail:     getString(obj["detail"]),
					Modules:    toStringSlice(obj["modules"]),
					Suggestion: getString(obj["suggestion"]),
				})
			}
		case "finish":
			flushModule()
			onEvent(StreamEvent{Type: "finish"})
		}
	}

	go func() {
		defer close(doneCh)
		for raw := range ch {
			for _, r := range raw {
				pendingBuf += string(r)
				if string(r) == "\n" {
					flushLine(pendingBuf)
					pendingBuf = ""
				}
			}
		}
		if pendingBuf != "" {
			flushLine(pendingBuf)
		}
	}()

	_, err = s.aiProvider.StreamComplete(ctx, CompleteRequest{
		APIKey:    apiKey,
		BaseURL:   cfg.BaseURL,
		Model:     checkupModel,
		Prompt:    maskedPrompt,
		TimeoutMs: cfg.TimeoutMs,
		OnProgress: func(chunk string) {
			ch <- chunk
		},
	})
	close(ch)
	<-doneCh

	if err != nil {
		log.Printf("[ai] StreamCheckup failed: %v", err)
		return nil, ErrAIRequestFailed
	}

	fullText := s.unmaskResponse(san, accumulated.String())
	resp, err := parseCheckupResponse(fullText)
	if err != nil {
		log.Printf("[ai] Failed to parse checkup response: %v, text: %s", err, fullText)
		return nil, fmt.Errorf("failed to parse AI response")
	}
	resp.Model = checkupModel

	// 落库
	convID := uuid.New().String()
	contextData := map[string]any{
		"healthScore": resp.HealthScore,
		"summary":     resp.Summary,
		"findings":    resp.Findings,
		"model":       resp.Model,
	}
	contextJSON, _ := json.Marshal(contextData)
	conversation := &aiStorage.ConversationRecord{
		ID:                convID,
		UserID:            userID,
		ResumeID:          &req.ResumeID,
		SnapshotVersionID: req.SnapshotVersionID,
		Type:              string(model.ConversationTypeCheckup),
		Title:             stringPtr("一致性体检"),
		Context:           contextJSON,
	}
	if err := s.repo.Create(context.Background(), conversation); err != nil {
		log.Printf("[ai] Failed to create checkup conversation: %v", err)
	} else if conversation.ResumeID != nil {
		s.invalidateConvCache(context.Background(), userID, *conversation.ResumeID)
	}
	s.repo.AddMessage(context.Background(), &aiStorage.MessageRecord{
		ID:             uuid.New().String(),
		ConversationID: convID,
		Role:           "user",
		Content:        prompt,
		Model:          &checkupModel,
	})
	resp.ConversationID = convID
	s.repo.AddMessage(context.Background(), &aiStorage.MessageRecord{
		ID:             uuid.New().String(),
		ConversationID: convID,
		Role:           "assistant",
		Content:        fullText,
		Model:          &checkupModel,
	})

	return resp, nil
}

func buildCheckupPrompt(content, contentAlt map[string]interface{}) string {
	var sb strings.Builder
	sb.WriteString(`你是资深简历一致性审查专家，专门发现简历中跨模块的矛盾、断档与不一致问题。

【隐私保护声明 — 必须遵守】
简历中以 [NAME_N]、[PHONE_N]、[EMAIL_N]、[ADDR_N]、[URL_N]、[ID_N]、[CODE_N]、[COMP_N]、[SALARY_N] 等固定格式出现的内容均为已填写真实信息的隐私脱敏标记，禁止判定为缺失或无效。

【职责边界 — 极其重要】
你只做"一致性 / 断档 / 矛盾"层面的全局审查，禁止做单模块的内容质量打分或润色建议（那是其他功能的职责）。

【体检维度，code 仅允许以下固定枚举】
- timeline_gap：教育或工作时间线存在超过 3 个月的未说明空白
- timeline_overlap：同期存在多段全职经历且未标注
- skill_evidence_missing：技能清单列出但工作/项目经历中无任何体现
- experience_skill_missing：经历中用到的技术未列入技能清单
- metric_conflict：同一指标/数字在不同模块出现矛盾
- i18n_mismatch：中英文版本模块数或关键字段缺漏不一致
- title_mismatch：求职意向与实际经历方向明显偏离
- date_format_inconsistent：模块间日期格式写法不统一

【输出格式强制规则】
1. 必须使用 JSON Lines 格式输出，每行一个完整 JSON 对象，每行以换行符结尾。
2. 禁止输出 Markdown、解释性文字、代码块或任何非 JSON 内容。
3. type 仅允许：summary、health_score、finding_item、finish。
4. 输出顺序固定为：summary → health_score → finding_item* → finish。
5. finish 必须是最后一行。

【每个 type 的 JSON 结构】
- {"type":"summary","content":"150字以内的整体一致性概述"}
- {"type":"health_score","score":0-100整数}
- {"type":"finding_item","code":"上述枚举","severity":"high/medium/low","title":"问题标题","detail":"具体矛盾说明，时间断档需给出起止区间，指标矛盾需引用两处原文数字","modules":["涉及的moduleType"],"suggestion":"修复建议"}
- {"type":"finish","timestamp":"毫秒级时间戳"}

【分析规则】
1. 只基于给定简历内容分析，禁止编造。
2. 无对应问题的维度不输出 finding_item。
3. health_score 体现整体一致性：问题越多越严重，分数越低；无明显问题应接近满分。
4. modules 字段必须填实际涉及的模块类型（personal/education/work/project/skills/awards/summary/certificates/portfolio/languages/custom）。
`)

	mainJSON, _ := json.Marshal(sanitizeAIResumeContent(content))
	sb.WriteString("\n【主简历 JSON】\n")
	sb.WriteString(string(mainJSON))

	if len(contentAlt) > 0 {
		altJSON, _ := json.Marshal(sanitizeAIResumeContent(contentAlt))
		sb.WriteString("\n\n【另一语言版本 JSON（用于 i18n_mismatch 检查）】\n")
		sb.WriteString(string(altJSON))
	} else {
		sb.WriteString("\n\n【说明】未提供另一语言版本，跳过 i18n_mismatch 检查。")
	}

	return sb.String()
}

func parseCheckupResponse(text string) (*model.ResumeCheckupResponse, error) {
	resp := &model.ResumeCheckupResponse{
		Findings: []model.CheckupFinding{},
		RawText:  text,
	}

	lines := strings.Split(text, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || !strings.HasPrefix(line, "{") {
			continue
		}
		var obj map[string]interface{}
		if err := json.Unmarshal([]byte(line), &obj); err != nil {
			continue
		}
		switch getString(obj["type"]) {
		case "summary":
			resp.Summary = getString(obj["content"])
		case "health_score":
			resp.HealthScore = int(getFloat(obj["score"]))
		case "finding_item":
			if code := getString(obj["code"]); code != "" {
				resp.Findings = append(resp.Findings, model.CheckupFinding{
					Code:       code,
					Severity:   getString(obj["severity"]),
					Title:      getString(obj["title"]),
					Detail:     getString(obj["detail"]),
					Modules:    toStringSlice(obj["modules"]),
					Suggestion: getString(obj["suggestion"]),
				})
			}
		}
	}

	if resp.Summary == "" && resp.HealthScore == 0 && len(resp.Findings) == 0 {
		return nil, fmt.Errorf("failed to parse checkup response: no valid data found")
	}
	return resp, nil
}

// toStringSlice 将 interface{} 转为 []string
func toStringSlice(v interface{}) []string {
	arr, ok := v.([]interface{})
	if !ok {
		return []string{}
	}
	result := make([]string, 0, len(arr))
	for _, item := range arr {
		if s := getString(item); s != "" {
			result = append(result, s)
		}
	}
	return result
}
