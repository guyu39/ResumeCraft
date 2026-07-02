package ai

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"resumecraft-pdf-backend/internal/model"
	aiStorage "resumecraft-pdf-backend/internal/storage/ai"

	"github.com/google/uuid"
)

type roundConfig struct {
	name        string
	description string
	techW       int
	projectW    int
	industryW   int
	softSkillW  int
	behavioralW int
	basicPct    int
	mediumPct   int
	advancedPct int
}

var roundConfigs = map[string]roundConfig{
	"technical": {
		name: "技术面", description: "技术面，综合考察基础技术能力、项目深度与系统设计，难度由浅入深",
		techW: 35, projectW: 30, industryW: 15, softSkillW: 10, behavioralW: 10,
		basicPct: 30, mediumPct: 45, advancedPct: 25,
	},
	"hr": {
		name: "HR 面", description: "HR 面，侧重软技能、团队协作、职业规划和行为面试，不涉及技术细节",
		techW: 0, projectW: 15, industryW: 10, softSkillW: 40, behavioralW: 35,
		basicPct: 30, mediumPct: 50, advancedPct: 20,
	},
	// 兼容历史数据：旧的 technical_1/technical_2 记录映射到 technical
	"technical_1": {
		name: "技术面", description: "技术面，综合考察基础技术能力、项目深度与系统设计，难度由浅入深",
		techW: 35, projectW: 30, industryW: 15, softSkillW: 10, behavioralW: 10,
		basicPct: 30, mediumPct: 45, advancedPct: 25,
	},
	"technical_2": {
		name: "技术面", description: "技术面，综合考察基础技术能力、项目深度与系统设计，难度由浅入深",
		techW: 35, projectW: 30, industryW: 15, softSkillW: 10, behavioralW: 10,
		basicPct: 30, mediumPct: 45, advancedPct: 25,
	},
}

func (s *service) GenerateInterviewQuestions(ctx context.Context, userID string, req model.InterviewGenerateRequest, onEvent func(StreamEvent)) error {
	cfg, err := s.cfgRepo.GetByUserID(ctx, userID)
	if err != nil {
		return ErrAIConfigNotFound
	}
	if !cfg.Enabled {
		return fmt.Errorf("AI 功能未启用")
	}
	apiKey, err := s.encryption.Decrypt(cfg.APIKeyEncrypted)
	if err != nil {
		return fmt.Errorf("failed to decrypt API key")
	}

	roundKey := req.InterviewRound
	if roundKey == "" {
		roundKey = "technical"
	}
	rc, ok := roundConfigs[roundKey]
	if !ok {
		rc = roundConfigs["technical"]
	}

	questionCount := req.QuestionCount
	if questionCount < 3 || questionCount > 30 {
		questionCount = 8
	}

	prompt := s.buildInterviewGeneratePrompt(req.Content, req.JDText, req.TargetTitle, req.CompanyName, questionCount, rc, req.FocusAreas)

	sessionID := uuid.New().String()
	focusAreasJSON, _ := json.Marshal(req.FocusAreas)
	jdHash := fmt.Sprintf("%x", sha256.Sum256([]byte(req.JDText)))[:16]

	now := time.Now()
	sessionRec := &aiStorage.InterviewSessionRecord{
		ID:             sessionID,
		UserID:         userID,
		TargetTitle:    req.TargetTitle,
		CompanyName:    req.CompanyName,
		JDText:         req.JDText,
		JDHash:         &jdHash,
		FocusAreas:     focusAreasJSON,
		QuestionCount:  questionCount,
		InterviewRound: roundKey,
		Mode:           "simulate",
		Questions:      json.RawMessage("[]"),
		Answers:        json.RawMessage("[]"),
		Status:         "generating",
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if req.ResumeID != "" {
		sessionRec.ResumeID = &req.ResumeID
	}
	if req.SnapshotVersionID != nil {
		sessionRec.SnapshotID = req.SnapshotVersionID
	}

	if err := s.interviewRepo.CreateSession(ctx, sessionRec); err != nil {
		return fmt.Errorf("create interview session: %w", err)
	}

	// 流式累积缓冲：OnProgress 每次传入的是 delta 片段，需累积后按完整 \n 行切分
	var streamBuf strings.Builder
	emittedQuestions := make(map[int]bool)

	completeReq := CompleteRequest{
		APIKey:    apiKey,
		BaseURL:   cfg.BaseURL,
		Model:     cfg.DefaultModel,
		Prompt:    prompt,
		TimeoutMs: cfg.TimeoutMs,
		Stream:    true,
		MaxTokens: questionCount*600 + 1000,
		OnProgress: func(delta string) {
			streamBuf.WriteString(delta)
			// 按 \n 切分已完整的行，剩余部分回填 buffer
			content := streamBuf.String()
			lastNewline := strings.LastIndex(content, "\n")
			if lastNewline < 0 {
				return
			}
			completedLines := content[:lastNewline]
			remainder := content[lastNewline+1:]
			streamBuf.Reset()
			streamBuf.WriteString(remainder)

			for _, line := range strings.Split(completedLines, "\n") {
				line = strings.TrimSpace(line)
				if line == "" || !strings.HasPrefix(line, "{") {
					continue
				}
				var evt struct {
					Type     string                   `json:"type"`
					Index    int                      `json:"index"`
					Question *model.InterviewQuestion `json:"question"`
				}
				if err := json.Unmarshal([]byte(line), &evt); err != nil {
					continue
				}
				if evt.Type == "question" && evt.Question != nil && !emittedQuestions[evt.Index] {
					emittedQuestions[evt.Index] = true
					if evt.Question.ID == "" {
						evt.Question.ID = fmt.Sprintf("q_%d", evt.Index+1)
					}
					idx := evt.Index
					onEvent(StreamEvent{
						Type:     "question",
						Index:    &idx,
						Question: evt.Question,
					})
				}
			}
		},
	}

	resp, err := s.aiProvider.StreamComplete(ctx, completeReq)
	if err != nil {
		// 用户主动取消（关闭页面）：清理空 session
		if ctxErr := ctx.Err(); ctxErr != nil {
			log.Printf("[interview] GenerateInterviewQuestions canceled by client: sessionID=%s", sessionID)
			cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cleanupCancel()
			_ = s.interviewRepo.DeleteSession(cleanupCtx, userID, sessionID)
			return nil
		}
		return fmt.Errorf("LLM generate interview questions: %w", err)
	}

	// 处理最后可能未带换行符的尾行 + 数据库持久化：从完整 resp.Text 重新解析全部题目
	var questions []model.InterviewQuestion
	for _, line := range strings.Split(resp.Text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || !strings.HasPrefix(line, "{") {
			continue
		}
		var evt struct {
			Type     string                   `json:"type"`
			Index    int                      `json:"index"`
			Question *model.InterviewQuestion `json:"question"`
		}
		if err := json.Unmarshal([]byte(line), &evt); err != nil {
			continue
		}
		if evt.Type == "question" && evt.Question != nil {
			if evt.Question.ID == "" {
				evt.Question.ID = fmt.Sprintf("q_%d", evt.Index+1)
			}
			questions = append(questions, *evt.Question)
			// 补发流式中遗漏的题目（例如最后一题没换行符的情况）
			if !emittedQuestions[evt.Index] {
				emittedQuestions[evt.Index] = true
				idx := evt.Index
				q := *evt.Question
				onEvent(StreamEvent{
					Type:     "question",
					Index:    &idx,
					Question: &q,
				})
			}
		}
	}

	questionsJSON, _ := json.Marshal(questions)
	if err := s.interviewRepo.UpdateSessionQuestions(ctx, userID, sessionID, questionsJSON, cfg.DefaultModel); err != nil {
		return fmt.Errorf("update session questions: %w", err)
	}

	finishEvt := makeFinishWithUsage(sessionID, time.Now().UnixMilli(), resp)
	onEvent(finishEvt)

	return nil
}

func (s *service) EvaluateInterviewAnswers(ctx context.Context, userID string, req model.InterviewEvaluateRequest, onEvent func(StreamEvent)) error {
	cfg, err := s.cfgRepo.GetByUserID(ctx, userID)
	if err != nil {
		return ErrAIConfigNotFound
	}
	if !cfg.Enabled {
		return fmt.Errorf("AI 功能未启用")
	}
	apiKey, err := s.encryption.Decrypt(cfg.APIKeyEncrypted)
	if err != nil {
		return fmt.Errorf("failed to decrypt API key")
	}

	session, err := s.interviewRepo.GetSessionByID(ctx, userID, req.SessionID)
	if err != nil {
		return fmt.Errorf("get interview session: %w", err)
	}

	var questions []model.InterviewQuestion
	if err := json.Unmarshal(session.Questions, &questions); err != nil {
		return fmt.Errorf("unmarshal questions: %w", err)
	}

	roundKey := req.InterviewRound
	if roundKey == "" {
		roundKey = session.InterviewRound
	}
	// 归一化历史值：technical_1/technical_2 → technical
	if roundKey == "technical_1" || roundKey == "technical_2" {
		roundKey = "technical"
	}
	rc, ok := roundConfigs[roundKey]
	if !ok {
		roundKey = "technical"
		rc = roundConfigs["technical"]
	}

	// 读取出题范围（评估维度据此收窄）
	var focusAreas []string
	if len(session.FocusAreas) > 0 {
		_ = json.Unmarshal(session.FocusAreas, &focusAreas)
	}

	prompt := s.buildInterviewEvaluatePrompt(questions, req.Answers, session.TargetTitle, session.CompanyName, rc, roundKey, focusAreas)

	// 允许的维度集合（与 prompt 约束一致），用于过滤 LLM 越界输出的维度，消除"其他"标签
	allowedDims := map[string]bool{}
	if roundKey == "hr" {
		for _, d := range []string{"soft_skill", "behavioral", "industry"} {
			allowedDims[d] = true
		}
	} else {
		for _, d := range []string{"technical", "project", "industry", "soft_skill"} {
			allowedDims[d] = true
		}
	}
	if len(focusAreas) > 0 {
		focusSet := map[string]bool{}
		for _, f := range focusAreas {
			focusSet[f] = true
		}
		narrowed := map[string]bool{}
		for d := range allowedDims {
			if focusSet[d] || d == "soft_skill" || d == "behavioral" {
				narrowed[d] = true
			}
		}
		if len(narrowed) > 0 {
			allowedDims = narrowed
		}
	}

	// 流式累积缓冲
	var streamBuf strings.Builder

	// 累积评估结果用于落库（与 AnalyzeTranscript 路径保持一致，避免评估完成后数据丢失）
	dimensionMap := make(map[string]model.InterviewDimScore)
	roundScoreMap := make(map[string]int)
	var questionEvals []model.InterviewQEval
	var improvements []model.InterviewImprovement
	var overallScore *int
	var overallLevel string
	var overallSummary string

	// 包装 onEvent：透传给前端的同时截获并累积事件数据（读平铺字段，与 flush 输出一致）
	captureEvent := func(evt StreamEvent) {
		// 过滤越界维度：LLM 偶尔输出预定义集合外的 dimension，会在前端显示为"其他"，这里直接丢弃
		if evt.Type == "dimension_score" && evt.Dimension != "" && !allowedDims[evt.Dimension] {
			return
		}
		onEvent(evt)
		switch evt.Type {
		case "question_eval":
			questionEvals = append(questionEvals, model.InterviewQEval{
				QuestionID:    evt.QuestionID,
				Score:         valueOrZero(evt.Score),
				BriefFeedback: evt.BriefFeedback,
				KeyPointsHit:  evt.KeyPointsHit,
				MissedPoints:  evt.MissedPoints,
				RedFlagsFound: evt.RedFlagsFound,
			})
		case "dimension_score":
			if evt.Dimension != "" {
				dimensionMap[evt.Dimension] = model.InterviewDimScore{
					Score: valueOrZero(evt.Score), Level: evt.Level, Feedback: evt.Feedback,
				}
			}
		case "round_score":
			if evt.Round != "" {
				roundScoreMap[evt.Round] = valueOrZero(evt.Score)
			}
		case "overall":
			v := valueOrZero(evt.Score)
			overallScore = &v
			overallLevel = evt.Level
			overallSummary = evt.Summary
			for k, val := range evt.RoundScores {
				roundScoreMap[k] = val
			}
		case "improvement":
			improvements = append(improvements, model.InterviewImprovement{
				Priority:      evt.Priority,
				Area:          evt.Area,
				Suggestion:    evt.Suggestion,
				EstimatedGain: valueOrZero(evt.EstimatedGain),
				TargetRound:   evt.TargetRound,
			})
		}
	}

	completeReq := CompleteRequest{
		APIKey:    apiKey,
		BaseURL:   cfg.BaseURL,
		Model:     cfg.DefaultModel,
		Prompt:    prompt,
		TimeoutMs: cfg.TimeoutMs,
		Stream:    true,
		MaxTokens: 12000,
		OnProgress: func(delta string) {
			streamBuf.WriteString(delta)
			content := streamBuf.String()
			lastNewline := strings.LastIndex(content, "\n")
			if lastNewline < 0 {
				return
			}
			completedLines := content[:lastNewline]
			remainder := content[lastNewline+1:]
			streamBuf.Reset()
			streamBuf.WriteString(remainder)
			s.flushInterviewEvalChunk(completedLines, captureEvent)
		},
	}

	evalStreamResp, err := s.aiProvider.StreamComplete(ctx, completeReq)
	if err != nil {
		// 用户主动取消（关闭页面）不算错误
		if ctxErr := ctx.Err(); ctxErr != nil {
			log.Printf("[interview] EvaluateInterviewAnswers canceled by client")
			return nil
		}
		return fmt.Errorf("LLM evaluate interview answers: %w", err)
	}

	// 兜底处理尾行
	tail := streamBuf.String()
	if strings.TrimSpace(tail) != "" {
		s.flushInterviewEvalChunk(tail, captureEvent)
	}

	// === 持久化评估结果 ===
	// 用独立 ctx：即使原 ctx 被 client 关闭，写库也要完成，避免评估结果丢失
	persistCtx, persistCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer persistCancel()

	// 先把本次提交的回答落库（保持 answers 与评估一致）
	answersJSON, _ := json.Marshal(req.Answers)
	answeredCount, skippedCount := 0, 0
	for _, a := range req.Answers {
		if a.Skipped {
			skippedCount++
		} else {
			answeredCount++
		}
	}
	if err := s.interviewRepo.UpdateSessionProgress(persistCtx, userID, req.SessionID, answersJSON, answeredCount, skippedCount); err != nil {
		log.Printf("[interview] persist evaluate progress failed: %v", err)
	}

	evaluation := model.InterviewEvaluation{
		Summary:                overallSummary,
		OverallScore:           overallScore,
		OverallLevel:           overallLevel,
		DimensionScores:        dimensionMap,
		RoundScores:            roundScoreMap,
		QuestionEvaluations:    questionEvals,
		ImprovementSuggestions: improvements,
		Model:                  cfg.DefaultModel,
		EvaluatedAt:            time.Now().UTC().Format(time.RFC3339),
	}
	evaluationJSON, _ := json.Marshal(evaluation)

	scoreVal := valueOrZero(overallScore)
	if err := s.interviewRepo.UpdateSessionEvaluation(persistCtx, userID, req.SessionID, evaluationJSON, scoreVal, overallLevel); err != nil {
		log.Printf("[interview] persist evaluation failed: %v", err)
	}

	// 推送 finish 事件，附带本次 token 用量
	onEvent(makeFinishWithUsage(req.SessionID, 0, evalStreamResp))

	return nil
}

func (s *service) AnalyzeTranscript(ctx context.Context, userID string, req model.AnalyzeTranscriptRequest, onEvent func(StreamEvent)) error {
	cfg, err := s.cfgRepo.GetByUserID(ctx, userID)
	if err != nil {
		return ErrAIConfigNotFound
	}
	if !cfg.Enabled {
		return fmt.Errorf("AI 功能未启用")
	}
	apiKey, err := s.encryption.Decrypt(cfg.APIKeyEncrypted)
	if err != nil {
		return fmt.Errorf("failed to decrypt API key")
	}

	roundKey := req.InterviewRound
	if roundKey == "" {
		roundKey = "technical"
	}
	rc, ok := roundConfigs[roundKey]
	if !ok {
		rc = roundConfigs["technical"]
	}

	prompt := s.buildTranscriptAnalyzePrompt(req.Content, req.TranscriptText, req.JDText, req.TargetTitle, req.CompanyName, rc)

	sessionID := uuid.New().String()
	focusAreasJSON, _ := json.Marshal([]string{})
	jdHash := ""
	if req.JDText != "" {
		jdHash = fmt.Sprintf("%x", sha256.Sum256([]byte(req.JDText)))[:16]
	}

	now := time.Now()
	sessionRec := &aiStorage.InterviewSessionRecord{
		ID:               sessionID,
		UserID:           userID,
		TargetTitle:      req.TargetTitle,
		CompanyName:      req.CompanyName,
		JDText:           req.JDText,
		JDHash:           &jdHash,
		FocusAreas:       focusAreasJSON,
		QuestionCount:    0,
		InterviewRound:   roundKey,
		Mode:             "transcript",
		TranscriptText:   &req.TranscriptText,
		TranscriptSource: &req.TranscriptSource,
		Questions:        json.RawMessage("[]"),
		Answers:          json.RawMessage("[]"),
		Status:           "generating",
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	if req.ResumeID != "" {
		sessionRec.ResumeID = &req.ResumeID
	}
	if req.SnapshotVersionID != nil {
		sessionRec.SnapshotID = req.SnapshotVersionID
	}

	if err := s.interviewRepo.CreateSession(ctx, sessionRec); err != nil {
		return fmt.Errorf("create interview session: %w", err)
	}

	// 流式累积缓冲：OnProgress 传入的是 delta 片段，需累积后按完整 \n 行切分
	var streamBuf strings.Builder

	// 同时累积分析结果用于落库
	type qaPair struct {
		Index    int    `json:"index"`
		Question string `json:"question"`
		Answer   string `json:"answer"`
	}
	var qaPairs []qaPair
	qaEvalMap := make(map[int]map[string]interface{})
	dimensionMap := make(map[string]map[string]interface{})
	roundScoreMap := make(map[string]int)
	roundReasonMap := make(map[string]string)
	var improvements []map[string]interface{}
	var overallScore *int
	var overallLevel string
	var overallSummary string

	// 包装 onEvent：透传给前端的同时，截获并累积事件数据
	captureEvent := func(evt StreamEvent) {
		onEvent(evt)
		switch evt.Type {
		case "qa_extracted":
			if evt.Index != nil {
				qaPairs = append(qaPairs, qaPair{
					Index:    *evt.Index,
					Question: evt.QAQuestion,
					Answer:   evt.QAAnswer,
				})
			}
		case "qa_eval":
			if evt.Index != nil {
				qaEvalMap[*evt.Index] = map[string]interface{}{
					"score":         valueOrZero(evt.Score),
					"briefFeedback": evt.BriefFeedback,
					"keyPointsHit":  evt.KeyPointsHit,
					"missedPoints":  evt.MissedPoints,
				}
			}
		case "dimension_score":
			if evt.Dimension != "" {
				dimensionMap[evt.Dimension] = map[string]interface{}{
					"score":    valueOrZero(evt.Score),
					"level":    evt.Level,
					"feedback": evt.Feedback,
				}
			}
		case "round_score":
			if evt.Round != "" {
				roundScoreMap[evt.Round] = valueOrZero(evt.Score)
				if evt.Reason != "" {
					roundReasonMap[evt.Round] = evt.Reason
				}
			}
		case "overall":
			if evt.Score != nil {
				v := *evt.Score
				overallScore = &v
			}
			overallLevel = evt.Level
			overallSummary = evt.Summary
			for k, v := range evt.RoundScores {
				roundScoreMap[k] = v
			}
		case "improvement":
			improvements = append(improvements, map[string]interface{}{
				"priority":      evt.Priority,
				"area":          evt.Area,
				"suggestion":    evt.Suggestion,
				"estimatedGain": valueOrZero(evt.EstimatedGain),
				"targetRound":   evt.TargetRound,
			})
		}
	}

	completeReq := CompleteRequest{
		APIKey:    apiKey,
		BaseURL:   cfg.BaseURL,
		Model:     cfg.DefaultModel,
		Prompt:    prompt,
		TimeoutMs: cfg.TimeoutMs,
		Stream:    true,
		MaxTokens: 8000,
		OnProgress: func(delta string) {
			streamBuf.WriteString(delta)
			content := streamBuf.String()
			lastNewline := strings.LastIndex(content, "\n")
			if lastNewline < 0 {
				return
			}
			completedLines := content[:lastNewline]
			remainder := content[lastNewline+1:]
			streamBuf.Reset()
			streamBuf.WriteString(remainder)
			s.flushTranscriptAnalyzeChunk(completedLines, captureEvent)
		},
	}

	resp, err := s.aiProvider.StreamComplete(ctx, completeReq)
	if err != nil {
		// 区分两种错误：
		// 1) ctx 被用户主动取消（关闭页面/抽屉）：不算业务错误，仅打日志，不写部分数据
		// 2) 真正的 LLM 调用失败：返回错误让上层日志记录
		if ctxErr := ctx.Err(); ctxErr != nil {
			log.Printf("[interview] AnalyzeTranscript canceled by client: sessionID=%s, qaPairs=%d", sessionID, len(qaPairs))
			// 用户取消时，不持久化部分结果，避免历史里出现破损记录
			// 同时把已生成中状态的 session 直接清理（保持数据一致性）
			cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cleanupCancel()
			if delErr := s.interviewRepo.DeleteSession(cleanupCtx, userID, sessionID); delErr != nil {
				log.Printf("[interview] cleanup canceled session failed: %v", delErr)
			}
			return nil
		}
		return fmt.Errorf("LLM analyze transcript: %w", err)
	}

	// 兜底：处理最后未带换行的尾行
	tail := streamBuf.String()
	if strings.TrimSpace(tail) != "" {
		s.flushTranscriptAnalyzeChunk(tail, captureEvent)
	}
	_ = resp

	// 校验：至少要拿到 1 个问答对才算分析有效，否则视为失败、清理 session
	if len(qaPairs) == 0 {
		log.Printf("[interview] AnalyzeTranscript no QA extracted, cleanup session: %s", sessionID)
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cleanupCancel()
		_ = s.interviewRepo.DeleteSession(cleanupCtx, userID, sessionID)
		return fmt.Errorf("LLM 未能从录音中提取到任何问答对，请检查转写文本是否完整")
	}

	// === 持久化分析结果 ===
	// 持久化用独立 ctx：即使原 ctx 已被 client 关闭，写库也要完成（避免数据丢失）
	// 但仍带超时上限，防止永久阻塞
	persistCtx, persistCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer persistCancel()

	// 1) 把 qaPairs 落到 questions/answers
	type questionShape struct {
		ID                 string                 `json:"id"`
		Category           string                 `json:"category"`
		Difficulty         string                 `json:"difficulty"`
		Question           string                 `json:"question"`
		EvaluationCriteria map[string]interface{} `json:"evaluationCriteria"`
	}
	type answerShape struct {
		QuestionID     string `json:"questionId"`
		Answer         string `json:"answer"`
		Skipped        bool   `json:"skipped"`
		AnsweredAt     string `json:"answeredAt"`
		FromTranscript bool   `json:"fromTranscript"`
		OriginalText   string `json:"originalText"`
	}
	questions := make([]questionShape, 0, len(qaPairs))
	answers := make([]answerShape, 0, len(qaPairs))
	nowStr := time.Now().UTC().Format(time.RFC3339)
	for _, qa := range qaPairs {
		qid := fmt.Sprintf("qa_%d", qa.Index)
		questions = append(questions, questionShape{
			ID: qid, Category: "technical", Difficulty: "medium",
			Question: qa.Question,
			EvaluationCriteria: map[string]interface{}{
				"keyPoints": []string{}, "bonusPoints": []string{}, "redFlags": []string{},
			},
		})
		answers = append(answers, answerShape{
			QuestionID: qid, Answer: qa.Answer, Skipped: false,
			AnsweredAt: nowStr, FromTranscript: true, OriginalText: qa.Answer,
		})
	}
	questionsJSON, _ := json.Marshal(questions)
	answersJSON, _ := json.Marshal(answers)
	if err := s.interviewRepo.UpdateSessionQuestions(persistCtx, userID, sessionID, questionsJSON, cfg.DefaultModel); err != nil {
		log.Printf("[interview] persist questions failed: %v", err)
	}
	if err := s.interviewRepo.UpdateSessionProgress(persistCtx, userID, sessionID, answersJSON, len(answers), 0); err != nil {
		log.Printf("[interview] persist progress failed: %v", err)
	}

	// 2) 组装 evaluation 落库
	// 把 qaEvalMap 转为有序数组（按 index 排序）
	questionEvaluations := make([]map[string]interface{}, 0, len(qaEvalMap))
	for i := range qaPairs {
		if eval, ok := qaEvalMap[qaPairs[i].Index]; ok {
			eval["questionId"] = fmt.Sprintf("qa_%d", qaPairs[i].Index)
			questionEvaluations = append(questionEvaluations, eval)
		}
	}
	evaluation := map[string]interface{}{
		"summary":                overallSummary,
		"overallScore":           overallScore,
		"overallLevel":           overallLevel,
		"dimensionScores":        dimensionMap,
		"roundScores":            roundScoreMap,
		"roundReasons":           roundReasonMap,
		"questionEvaluations":    questionEvaluations,
		"improvementSuggestions": improvements,
		"model":                  cfg.DefaultModel,
		"evaluatedAt":            nowStr,
	}
	evaluationJSON, _ := json.Marshal(evaluation)

	scoreVal := 0
	passLevel := overallLevel
	if overallScore != nil {
		scoreVal = *overallScore
	}
	if err := s.interviewRepo.UpdateSessionEvaluation(persistCtx, userID, sessionID, evaluationJSON, scoreVal, passLevel); err != nil {
		log.Printf("[interview] persist evaluation failed: %v", err)
	}

	// 推送 finish 事件（如果原 ctx 已关，前端也收不到，无所谓）
	onEvent(StreamEvent{Type: "finish", SessionID: sessionID})

	return nil
}

// valueOrZero 安全取 *int 值
func valueOrZero(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}

func (s *service) SaveInterviewProgress(ctx context.Context, userID, sessionID string, req model.SaveInterviewProgressRequest) error {
	answersJSON, _ := json.Marshal(req.Answers)
	return s.interviewRepo.UpdateSessionProgress(ctx, userID, sessionID, answersJSON, req.AnsweredCount, req.SkippedCount)
}

// ListInterviewSessions 分页查询当前用户在指定简历下的面试历史（轻量字段，最多 10 条）
func (s *service) ListInterviewSessions(ctx context.Context, userID, resumeID string, limit, offset int) (*model.InterviewSessionListResponse, error) {
	const maxHistory = 10
	if limit <= 0 || limit > maxHistory {
		limit = maxHistory
	}
	if offset < 0 {
		offset = 0
	}

	records, err := s.interviewRepo.ListSessionsByUser(ctx, userID, resumeID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list interview sessions: %w", err)
	}
	total, err := s.interviewRepo.CountSessionsByUser(ctx, userID, resumeID)
	if err != nil {
		return nil, fmt.Errorf("count interview sessions: %w", err)
	}
	// 前端最多展示 10 条，对外暴露的 total 也封顶
	if total > maxHistory {
		total = maxHistory
	}

	items := make([]model.InterviewSessionListItem, 0, len(records))
	for i := range records {
		rec := records[i]
		item := model.InterviewSessionListItem{
			ID:             rec.ID,
			TargetTitle:    rec.TargetTitle,
			CompanyName:    rec.CompanyName,
			InterviewRound: rec.InterviewRound,
			Mode:           rec.Mode,
			QuestionCount:  rec.QuestionCount,
			AnsweredCount:  rec.AnsweredCount,
			SkippedCount:   rec.SkippedCount,
			Status:         rec.Status,
			CreatedAt:      rec.CreatedAt.UnixMilli(),
			UpdatedAt:      rec.UpdatedAt.UnixMilli(),
		}
		if rec.OverallScore != nil {
			item.OverallScore = rec.OverallScore
		}
		if rec.PassLevel != nil {
			item.PassLevel = *rec.PassLevel
		}
		items = append(items, item)
	}

	return &model.InterviewSessionListResponse{
		Items:  items,
		Total:  total,
		Limit:  limit,
		Offset: offset,
	}, nil
}

// GetInterviewSession 查询单个面试会话详情（含 questions/answers/evaluation）
func (s *service) GetInterviewSession(ctx context.Context, userID, sessionID string) (*model.InterviewSession, error) {
	rec, err := s.interviewRepo.GetSessionByID(ctx, userID, sessionID)
	if err != nil {
		return nil, fmt.Errorf("get interview session: %w", err)
	}
	if rec == nil {
		return nil, ErrInterviewSessionNotFound
	}
	return aiStorage.InterviewRecordToModel(rec)
}

// DeleteInterviewSession 删除面试会话
func (s *service) DeleteInterviewSession(ctx context.Context, userID, sessionID string) error {
	// 先校验存在性，避免 DELETE 静默通过
	rec, err := s.interviewRepo.GetSessionByID(ctx, userID, sessionID)
	if err != nil {
		return fmt.Errorf("verify session ownership: %w", err)
	}
	if rec == nil {
		return ErrInterviewSessionNotFound
	}
	return s.interviewRepo.DeleteSession(ctx, userID, sessionID)
}

func (s *service) flushInterviewGenerateChunk(text string, onEvent func(StreamEvent)) {
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || !strings.HasPrefix(line, "{") {
			continue
		}
		var evt struct {
			Type     string                   `json:"type"`
			Index    int                      `json:"index"`
			Question *model.InterviewQuestion `json:"question"`
		}
		if err := json.Unmarshal([]byte(line), &evt); err != nil {
			continue
		}
		if evt.Type == "question" && evt.Question != nil {
			if evt.Question.ID == "" {
				evt.Question.ID = fmt.Sprintf("q_%d", evt.Index+1)
			}
			onEvent(StreamEvent{
				Type:     "question",
				Index:    &evt.Index,
				Question: evt.Question,
			})
		}
	}
}

func (s *service) flushInterviewEvalChunk(text string, onEvent func(StreamEvent)) {
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || !strings.HasPrefix(line, "{") {
			continue
		}
		var raw map[string]json.RawMessage
		if err := json.Unmarshal([]byte(line), &raw); err != nil {
			continue
		}
		evtType := ""
		if t, ok := raw["type"]; ok {
			json.Unmarshal(t, &evtType)
		}

		switch evtType {
		case "question_eval":
			var qe struct {
				QuestionID    string   `json:"questionId"`
				Score         int      `json:"score"`
				BriefFeedback string   `json:"briefFeedback"`
				KeyPointsHit  []string `json:"keyPointsHit"`
				MissedPoints  []string `json:"missedPoints"`
				RedFlagsFound []string `json:"redFlagsFound"`
			}
			json.Unmarshal([]byte(line), &qe)
			score := qe.Score
			// 平铺字段输出，与前端 useInterviewPrep 的 evaluate 回调契约一致
			onEvent(StreamEvent{
				Type:          "question_eval",
				QuestionID:    qe.QuestionID,
				Score:         &score,
				BriefFeedback: qe.BriefFeedback,
				KeyPointsHit:  qe.KeyPointsHit,
				MissedPoints:  qe.MissedPoints,
				RedFlagsFound: qe.RedFlagsFound,
			})

		case "dimension_score":
			var ds struct {
				Dimension string `json:"dimension"`
				Score     int    `json:"score"`
				Level     string `json:"level"`
				Feedback  string `json:"feedback"`
			}
			json.Unmarshal([]byte(line), &ds)
			score := ds.Score
			onEvent(StreamEvent{
				Type:      "dimension_score",
				Dimension: ds.Dimension,
				Score:     &score,
				Level:     ds.Level,
				Feedback:  ds.Feedback,
			})

		case "round_score":
			var rs struct {
				Round  string `json:"round"`
				Score  int    `json:"score"`
				Reason string `json:"reason"`
			}
			json.Unmarshal([]byte(line), &rs)
			score := rs.Score
			onEvent(StreamEvent{
				Type:   "round_score",
				Round:  rs.Round,
				Score:  &score,
				Reason: rs.Reason,
			})

		case "overall":
			var ov struct {
				Score       int            `json:"score"`
				Level       string         `json:"level"`
				Summary     string         `json:"summary"`
				RoundScores map[string]int `json:"roundScores"`
			}
			json.Unmarshal([]byte(line), &ov)
			score := ov.Score
			onEvent(StreamEvent{
				Type:        "overall",
				Score:       &score,
				Level:       ov.Level,
				Summary:     ov.Summary,
				RoundScores: ov.RoundScores,
			})

		case "improvement":
			var imp struct {
				Priority      string `json:"priority"`
				Area          string `json:"area"`
				Suggestion    string `json:"suggestion"`
				EstimatedGain int    `json:"estimatedGain"`
				TargetRound   string `json:"targetRound"`
			}
			json.Unmarshal([]byte(line), &imp)
			gain := imp.EstimatedGain
			onEvent(StreamEvent{
				Type:          "improvement",
				Priority:      imp.Priority,
				Area:          imp.Area,
				Suggestion:    imp.Suggestion,
				EstimatedGain: &gain,
				TargetRound:   imp.TargetRound,
			})
		}
	}
}

func (s *service) flushTranscriptAnalyzeChunk(text string, onEvent func(StreamEvent)) {
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || !strings.HasPrefix(line, "{") {
			continue
		}
		var raw map[string]json.RawMessage
		if err := json.Unmarshal([]byte(line), &raw); err != nil {
			continue
		}
		evtType := ""
		if t, ok := raw["type"]; ok {
			json.Unmarshal(t, &evtType)
		}

		switch evtType {
		case "qa_extracted":
			var qa struct {
				Index    int    `json:"index"`
				Question string `json:"question"`
				Answer   string `json:"answer"`
			}
			json.Unmarshal([]byte(line), &qa)
			idx := qa.Index
			onEvent(StreamEvent{
				Type:       "qa_extracted",
				Index:      &idx,
				QAQuestion: qa.Question,
				QAAnswer:   qa.Answer,
			})

		case "qa_eval":
			var qe struct {
				Index         int      `json:"index"`
				Score         int      `json:"score"`
				BriefFeedback string   `json:"briefFeedback"`
				KeyPointsHit  []string `json:"keyPointsHit"`
				MissedPoints  []string `json:"missedPoints"`
			}
			json.Unmarshal([]byte(line), &qe)
			idx := qe.Index
			score := qe.Score
			onEvent(StreamEvent{
				Type:          "qa_eval",
				Index:         &idx,
				Score:         &score,
				BriefFeedback: qe.BriefFeedback,
				KeyPointsHit:  qe.KeyPointsHit,
				MissedPoints:  qe.MissedPoints,
			})

		case "dimension_score":
			var ds struct {
				Dimension string `json:"dimension"`
				Score     int    `json:"score"`
				Level     string `json:"level"`
				Feedback  string `json:"feedback"`
			}
			json.Unmarshal([]byte(line), &ds)
			score := ds.Score
			onEvent(StreamEvent{
				Type:      "dimension_score",
				Dimension: ds.Dimension,
				Score:     &score,
				Level:     ds.Level,
				Feedback:  ds.Feedback,
			})

		case "round_score":
			var rs struct {
				Round  string `json:"round"`
				Score  int    `json:"score"`
				Reason string `json:"reason"`
			}
			json.Unmarshal([]byte(line), &rs)
			score := rs.Score
			onEvent(StreamEvent{
				Type:   "round_score",
				Round:  rs.Round,
				Score:  &score,
				Reason: rs.Reason,
			})

		case "overall":
			var ov struct {
				Score       int            `json:"score"`
				Level       string         `json:"level"`
				Summary     string         `json:"summary"`
				RoundScores map[string]int `json:"roundScores"`
			}
			json.Unmarshal([]byte(line), &ov)
			score := ov.Score
			onEvent(StreamEvent{
				Type:        "overall",
				Score:       &score,
				Level:       ov.Level,
				Summary:     ov.Summary,
				RoundScores: ov.RoundScores,
			})

		case "improvement":
			var imp struct {
				Priority      string `json:"priority"`
				Area          string `json:"area"`
				Suggestion    string `json:"suggestion"`
				EstimatedGain int    `json:"estimatedGain"`
				TargetRound   string `json:"targetRound"`
			}
			json.Unmarshal([]byte(line), &imp)
			gain := imp.EstimatedGain
			onEvent(StreamEvent{
				Type:          "improvement",
				Priority:      imp.Priority,
				Area:          imp.Area,
				Suggestion:    imp.Suggestion,
				EstimatedGain: &gain,
				TargetRound:   imp.TargetRound,
			})

		case "finish":
			var fin struct {
				SessionID string `json:"sessionId"`
				Timestamp int64  `json:"timestamp"`
			}
			json.Unmarshal([]byte(line), &fin)
			onEvent(StreamEvent{Type: "finish", SessionID: fin.SessionID, Timestamp: fin.Timestamp})
		}
	}
}
