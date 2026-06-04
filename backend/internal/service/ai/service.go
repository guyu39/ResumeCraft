package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"

	"resumecraft-pdf-backend/internal/config"
	"resumecraft-pdf-backend/internal/model"
	"resumecraft-pdf-backend/internal/service/ai/sanitizer"
	aiStorage "resumecraft-pdf-backend/internal/storage/ai"

	"github.com/google/uuid"
)

var (
	ErrConversationNotFound = errors.New("conversation not found")
	ErrAIConfigNotFound     = errors.New("ai config not found")
	ErrAIRequestFailed      = errors.New("ai request failed")
	ErrAPIKeyRequired       = errors.New("api key required for first-time setup")
)

type Service interface {
	// 配置管理
	GetConfig(ctx context.Context, userID string) (*model.AIConfig, error)
	SaveConfig(ctx context.Context, userID string, req model.AIConfigRequest) error

	// 对话管理
	ListConversations(ctx context.Context, userID string, conversationType, resumeID string, page, pageSize int) (*model.ConversationListResponse, error)
	GetConversation(ctx context.Context, userID, conversationID string) (*model.AIConversation, error)
	DeleteConversation(ctx context.Context, userID, conversationID string) error

	// AI 操作
	EvaluateStream(ctx context.Context, userID string, req model.EvaluateRequest, onChunk func(chunk string)) (*model.EvaluateResponse, error)
	StreamEvaluate(ctx context.Context, userID string, req model.EvaluateRequest, onEvent func(StreamEvent)) (*model.EvaluateResponse, error)
	StreamJDMatch(ctx context.Context, userID string, req model.JDMatchRequest, onEvent func(StreamEvent)) (*model.JDMatchResponse, error)
	ScoreResumeForJD(ctx context.Context, userID string, req model.JDScoreRequest) (*model.JDScoreResponse, error)
	GenerateCoverLetter(ctx context.Context, userID string, req model.CoverLetterRequest) (*model.CoverLetterResponse, error)
	RewriteBullet(ctx context.Context, userID string, req model.BulletRewriteRequest) (*model.BulletRewriteResponse, error)
	Suggest(ctx context.Context, userID string, req model.SuggestRequest) (*model.SuggestResponse, error)

	// 对话消息
	AddMessage(ctx context.Context, conversationID, role, content string) (*model.AIMessage, error)

	// 润色记录
	ListSuggestRecords(ctx context.Context, userID, resumeID, moduleType, moduleInstanceID string, limit int) (*model.SuggestRecordListResponse, error)
	SaveSuggestRecordFull(ctx context.Context, userID string, req model.SaveSuggestRecordRequest) error
	// 简历解析配置
	GetParserConfig(ctx context.Context, userID string) (*model.ResumeParserConfig, error)
	SaveParserConfig(ctx context.Context, userID string, req model.ResumeParserConfigRequest) error
	ResolveParserConfig(ctx context.Context, userID string) (*aiStorage.ParserConfigRecord, error)

	// 简历翻译
	Translate(ctx context.Context, userID string, req model.TranslateRequest, resumeContent map[string]interface{}) (*model.TranslateResponse, error)

	// AI 增强（e.g. 抽取指标、补全风控、转STAR）
	Enhance(ctx context.Context, userID string, req model.EnhanceRequest) (*model.EnhanceResponse, error)

	// 简历分析与需求文档（分享页公开接口，无 userID）
	AnalyzeResume(ctx context.Context, resumeSummary string) (*model.AIAnalysisResponse, error)
	GenerateRequirementDoc(ctx context.Context, resumeSummary string) (string, error)
}

type service struct {
	repo              aiStorage.Repository
	cfgRepo           aiStorage.ConfigRepository
	suggestRecordRepo aiStorage.SuggestRecordRepository
	parserCfgRepo     aiStorage.ParserConfigRepository
	aiProvider        AIProvider
	encryption        *Encryption
	redis             *redis.Client    // AI 对话缓存
	sanitizeCfg       sanitizer.Config // 脱敏配置
}

func NewService(repo aiStorage.Repository, cfgRepo aiStorage.ConfigRepository, suggestRecordRepo aiStorage.SuggestRecordRepository, parserCfgRepo aiStorage.ParserConfigRepository, aiCfg config.AIConfig, redisClient *redis.Client) Service {
	// 脱敏配置：默认开启，可通过 AI_SANITIZE_ENABLED=false 关闭
	sanCfg := sanitizer.DefaultConfig()
	if !aiCfg.SanitizeEnabled {
		sanCfg.Enabled = false
	}
	return &service{
		repo:              repo,
		cfgRepo:           cfgRepo,
		suggestRecordRepo: suggestRecordRepo,
		parserCfgRepo:     parserCfgRepo,
		aiProvider:        newAIProvider(aiCfg),
		encryption:        NewEncryption(aiCfg.EncryptionKey),
		redis:             redisClient,
		sanitizeCfg:       sanCfg,
	}
}

// GetConfig 获取用户 AI 配置
func (s *service) GetConfig(ctx context.Context, userID string) (*model.AIConfig, error) {
	cfg, err := s.cfgRepo.GetByUserID(ctx, userID)
	if err != nil {
		if errors.Is(err, aiStorage.ErrConfigNotFound) {
			return nil, ErrAIConfigNotFound
		}
		return nil, err
	}

	return &model.AIConfig{
		ID:           cfg.ID,
		UserID:       &cfg.UserID,
		Provider:     model.AIProvider(cfg.Provider),
		BaseURL:      cfg.BaseURL,
		DefaultModel: cfg.DefaultModel,
		HasAPIKey:    cfg.APIKeyEncrypted != "",
		Enabled:      cfg.Enabled,
		IsGlobal:     cfg.IsGlobal,
		CreatedAt:    cfg.CreatedAt.UnixMilli(),
		UpdatedAt:    cfg.UpdatedAt.UnixMilli(),
		// 不返回解密后的 API Key，通过单独接口获取
	}, nil
}

// SaveConfig 保存用户 AI 配置
func (s *service) SaveConfig(ctx context.Context, userID string, req model.AIConfigRequest) error {
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	isGlobal := false
	if req.IsGlobal != nil {
		isGlobal = *req.IsGlobal
	}

	// 查询已有配置
	var existingCfg *aiStorage.AIConfigRecord
	if cfg, err := s.cfgRepo.GetByUserID(ctx, userID); err == nil && cfg != nil {
		existingCfg = cfg
	}

	// 确定 API Key：新 key 优先，否则复用旧 key，都没有才报错
	var encryptedKey string
	if strings.TrimSpace(req.APIKey) != "" {
		enc, err := s.encryption.Encrypt(req.APIKey)
		if err != nil {
			return fmt.Errorf("failed to encrypt API key: %w", err)
		}
		encryptedKey = enc
	} else if existingCfg != nil && existingCfg.APIKeyEncrypted != "" {
		encryptedKey = existingCfg.APIKeyEncrypted
	} else {
		return ErrAPIKeyRequired
	}

	existingID := uuid.New().String()
	if existingCfg != nil {
		existingID = existingCfg.ID
	}

	cfg := &aiStorage.AIConfigRecord{
		ID:              existingID,
		UserID:          userID,
		Provider:        string(req.Provider),
		APIKeyEncrypted: encryptedKey,
		BaseURL:         req.BaseURL,
		DefaultModel:    req.DefaultModel,
		TimeoutMs:       900000, // Default timeout 15min
		Enabled:         enabled,
		IsGlobal:        isGlobal,
	}

	return s.cfgRepo.Upsert(ctx, cfg)
}

// ListConversations 获取对话列表（Redis 缓存 30 分钟）
func (s *service) ListConversations(ctx context.Context, userID string, conversationType, resumeID string, page, pageSize int) (*model.ConversationListResponse, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	// Redis 缓存：key = ai:conv:{userID}:{type}:{resumeID}:{page}:{pageSize}
	if s.redis != nil {
		cacheKey := fmt.Sprintf("ai:conv:%s:%s:%s:%d:%d", userID, conversationType, resumeID, page, pageSize)
		cached, err := s.redis.Get(ctx, cacheKey).Result()
		if err == nil && cached != "" {
			var resp model.ConversationListResponse
			if json.Unmarshal([]byte(cached), &resp) == nil {
				return &resp, nil
			}
		}
	}

	items, total, err := s.repo.List(ctx, userID, conversationType, resumeID, page, pageSize)
	if err != nil {
		return nil, err
	}

	totalPages := total / pageSize
	if total%pageSize > 0 {
		totalPages++
	}

	resp := &model.ConversationListResponse{
		Items: items,
		Pagination: model.Pagination{
			Page:       page,
			PageSize:   pageSize,
			Total:      total,
			TotalPages: totalPages,
		},
	}

	// 回写 Redis（TTL 30 分钟）
	if s.redis != nil {
		cacheKey := fmt.Sprintf("ai:conv:%s:%s:%s:%d:%d", userID, conversationType, resumeID, page, pageSize)
		data, _ := json.Marshal(resp)
		_ = s.redis.Set(ctx, cacheKey, data, 30*time.Minute)
	}

	return resp, nil
}

// GetConversation 获取对话详情
func (s *service) GetConversation(ctx context.Context, userID, conversationID string) (*model.AIConversation, error) {
	conv, err := s.repo.GetByID(ctx, userID, conversationID)
	if err != nil {
		if errors.Is(err, aiStorage.ErrConversationNotFound) {
			return nil, ErrConversationNotFound
		}
		return nil, err
	}
	return conv, nil
}

// DeleteConversation 删除对话
func (s *service) DeleteConversation(ctx context.Context, userID, conversationID string) error {
	// 清除该会话的缓存（因为不知道 resumeID，需要先查出来）
	if s.redis != nil {
		conv, err := s.repo.GetByID(ctx, userID, conversationID)
		if err == nil && conv.ResumeID != nil {
			s.invalidateConvCache(context.Background(), userID, *conv.ResumeID)
		}
	}
	return s.repo.Delete(ctx, userID, conversationID)
}

// maskPrompt 对 prompt 做脱敏，返回 (脱敏后文本, 脱敏器)。
// 若 sanitizer 为 nil 表示脱敏未启用，调用方 skip unmask。
func (s *service) maskPrompt(prompt string) (string, *sanitizer.Sanitizer) {
	if !s.sanitizeCfg.Enabled {
		return prompt, nil
	}
	san := sanitizer.New(s.sanitizeCfg)
	return san.Mask(prompt), san
}

// unmaskResponse 还原 AI 响应中的占位符
func (s *service) unmaskResponse(san *sanitizer.Sanitizer, text string) string {
	if san == nil {
		return text
	}
	return san.Unmask(text)
}
func (s *service) invalidateConvCache(ctx context.Context, userID, resumeID string) {
	if s.redis == nil {
		return
	}
	// 使用 SCAN 删除匹配的 key（ai:conv:{userID}:*:{resumeID}:*:*）
	pattern := fmt.Sprintf("ai:conv:%s:*:%s:*", userID, resumeID)
	iter := s.redis.Scan(ctx, 0, pattern, 0).Iterator()
	for iter.Next(ctx) {
		s.redis.Del(ctx, iter.Val())
	}
}

// EvaluateStream 流式评估简历
// onProgress 返回累积文本供前端实时渲染
func (s *service) EvaluateStream(ctx context.Context, userID string, req model.EvaluateRequest, onProgress func(text string)) (*model.EvaluateResponse, error) {
	// 获取配置
	cfg, err := s.cfgRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, ErrAIConfigNotFound
	}
	if !cfg.Enabled {
		return nil, fmt.Errorf("AI 功能未启用")
	}

	// 解密 API Key
	apiKey, err := s.encryption.Decrypt(cfg.APIKeyEncrypted)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt API key")
	}

	// 构建提示词
	prompt := buildEvaluatePrompt(req.Content)

	// 脱敏
	maskedPrompt, san := s.maskPrompt(prompt)

	// 调用 AI（流式）
	evaluateModel := cfg.DefaultModel
	if cfg.EvaluateModel != nil && *cfg.EvaluateModel != "" {
		evaluateModel = *cfg.EvaluateModel
	}

	// 累积文本
	accumulated := &strings.Builder{}
	progressCh := make(chan string, 100)
	doneCh := make(chan struct{})

	// 启动 goroutine 读取消求并推送累积文本
	go func() {
		for chunk := range progressCh {
			accumulated.WriteString(chunk)
			onProgress(chunk)
		}
		close(doneCh)
	}()

	_, err = s.aiProvider.StreamComplete(ctx, CompleteRequest{
		APIKey:    apiKey,
		BaseURL:   cfg.BaseURL,
		Model:     evaluateModel,
		Prompt:    maskedPrompt,
		TimeoutMs: cfg.TimeoutMs,
		OnProgress: func(chunk string) {
			select {
			case progressCh <- chunk:
			default:
			}
		},
	})
	close(progressCh)
	<-doneCh

	if err != nil {
		log.Printf("[ai] EvaluateStream failed: %v", err)
		return nil, ErrAIRequestFailed
	}

	// 解析 AI 响应
	fullText := s.unmaskResponse(san, accumulated.String())
	evalResp, err := parseEvaluateResponse(fullText)
	if err != nil {
		log.Printf("[ai] Failed to parse evaluate response: %v, text: %s", err, fullText)
		return nil, fmt.Errorf("failed to parse AI response")
	}
	evalResp.Model = evaluateModel

	// 创建对话会话
	convID := uuid.New().String()
	contextData := map[string]any{
		"overallScore": evalResp.OverallScore,
		"level":        evalResp.Level,
		"summary":      evalResp.Summary,
		"dimensions":   evalResp.Dimensions,
		"issues":       evalResp.Issues,
		"actionItems":  evalResp.ActionItems,
	}
	contextJSON, _ := json.Marshal(contextData)
	conversation := &aiStorage.ConversationRecord{
		ID:                convID,
		UserID:            userID,
		ResumeID:          &req.ResumeID,
		SnapshotVersionID: req.SnapshotVersionID,
		Type:              string(model.ConversationTypeEvaluate),
		Title:             stringPtr("简历评估"),
		Context:           contextJSON,
	}
	if err := s.repo.Create(context.Background(), conversation); err != nil {
		log.Printf("[ai] Failed to create conversation: %v", err)
	} else if conversation.ResumeID != nil {
		s.invalidateConvCache(context.Background(), userID, *conversation.ResumeID)
	}
	// 保存用户消息
	s.repo.AddMessage(context.Background(), &aiStorage.MessageRecord{
		ID:             uuid.New().String(),
		ConversationID: convID,
		Role:           "user",
		Content:        prompt,
		Model:          &evaluateModel,
	})

	evalResp.ConversationID = convID

	// 保存 AI 响应
	s.repo.AddMessage(context.Background(), &aiStorage.MessageRecord{
		ID:             uuid.New().String(),
		ConversationID: convID,
		Role:           "assistant",
		Content:        fullText,
		Model:          &evaluateModel,
	})

	return evalResp, nil
}

// StreamEvaluate 流式评估简历
// - 实时将 LLM 原始输出流式发送给前端（onChunk）
// - 流结束后解析完整 JSON，保存数据库，返回最终结构化结果
func (s *service) StreamEvaluate(ctx context.Context, userID string, req model.EvaluateRequest, onEvent func(StreamEvent)) (*model.EvaluateResponse, error) {
	// 获取配置
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

	prompt := buildEvaluatePrompt(req.Content)

	// 脱敏
	maskedPrompt, san := s.maskPrompt(prompt)
	evaluateModel := cfg.DefaultModel
	if cfg.EvaluateModel != nil && *cfg.EvaluateModel != "" {
		evaluateModel = *cfg.EvaluateModel
	}

	// 首次推送 model 事件
	onEvent(StreamEvent{Type: "model", Model: evaluateModel})

	// 累积完整文本用于最终解析，pendingBuf 缓冲未完整的行
	accumulated := &strings.Builder{}
	pendingBuf := ""
	ch := make(chan string) // 无缓冲：goroutine 必须先读完 channel 中的 chunk，LLM 的 StreamComplete 才会继续
	doneCh := make(chan struct{})

	// 模块级累积变量：等模块收齐后再一次性 flush
	var (
		pendingSummary     string
		pendingScore       *int
		pendingLevel       string
		pendingDimensions  []model.EvaluateDimension
		pendingIssues      []model.EvaluateIssue
		pendingActionItems []string
		prevType           string // 上一个 NDJSON 行的 type，用于检测模块切换
	)

	// flushModule：将累积的模块数据 flush 一次发给前端，flush 后清空累积变量
	flushModule := func() {
		if pendingSummary != "" {
			onEvent(StreamEvent{Type: "summary", Summary: pendingSummary})
			pendingSummary = ""
		}
		if pendingScore != nil || pendingLevel != "" {
			onEvent(StreamEvent{Type: "overall_score", OverallScore: pendingScore, Level: pendingLevel})
			pendingScore = nil
			pendingLevel = ""
		}
		if len(pendingDimensions) > 0 {
			onEvent(StreamEvent{Type: "dimension_score", Dimensions: pendingDimensions})
			pendingDimensions = nil
		}
		if len(pendingIssues) > 0 {
			onEvent(StreamEvent{Type: "issue_item", Issues: pendingIssues})
			pendingIssues = nil
		}
		if len(pendingActionItems) > 0 {
			onEvent(StreamEvent{Type: "action_item", ActionItems: pendingActionItems})
			pendingActionItems = nil
		}
	}

	// flushLine：收到完整 NDJSON 行时调用，先检测类型变化（flush 上一模块），再解析当前行
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

		evtType, _ := obj["type"].(string)

		// 类型发生变化时（summary→overall_score，overall_score→dimension_score 等），
		// 说明上一模块已经收齐，立即 flush 整个模块
		if prevType != "" && evtType != prevType {
			flushModule()
			// 模块 flush 后暂停 ~200ms，让前端有真实的时间差感知（模块之间可见间隔）
			time.Sleep(200 * time.Millisecond)
		}
		prevType = evtType

		switch evtType {
		case "summary":
			pendingSummary = getString(obj["content"])
		case "overall_score":
			score := int(getFloat(obj["score"]))
			pendingScore = &score
			pendingLevel = getString(obj["level"])
		case "dimension_score":
			if key, ok := obj["key"].(string); ok {
				pendingDimensions = append(pendingDimensions, model.EvaluateDimension{
					Key:     key,
					Label:   getString(obj["label"]),
					Score:   int(getFloat(obj["score"])),
					Comment: getString(obj["comment"]),
				})
			}
		case "issue_item":
			if id, ok := obj["id"].(string); ok {
				pendingIssues = append(pendingIssues, model.EvaluateIssue{
					ID:          id,
					Severity:    getString(obj["severity"]),
					Title:       getString(obj["title"]),
					Description: getString(obj["description"]),
					Suggestion:  getString(obj["suggestion"]),
				})
			}
		case "action_item":
			pendingActionItems = append(pendingActionItems, getString(obj["content"]))
		case "finish":
			// finish 到达时，flush 最后剩余的模块，然后发 finish
			flushModule()
			onEvent(StreamEvent{Type: "finish"})
		}
	}

	// goroutine：从 LLM 流中读 chunk，以 \n 为界推送完整行
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
		// LLM 流结束，兜底 flush 残留（正常情况下 finish 会触发 flush）
		if pendingBuf != "" {
			flushLine(pendingBuf)
		}
	}()

	_, err = s.aiProvider.StreamComplete(ctx, CompleteRequest{
		APIKey:    apiKey,
		BaseURL:   cfg.BaseURL,
		Model:     evaluateModel,
		Prompt:    maskedPrompt,
		TimeoutMs: cfg.TimeoutMs,
		OnProgress: func(chunk string) {
			ch <- chunk
		},
	})
	close(ch)
	<-doneCh

	if err != nil {
		log.Printf("[ai] StreamEvaluate failed: %v", err)
		return nil, ErrAIRequestFailed
	}

	fullText := s.unmaskResponse(san, accumulated.String())

	// 最终解析（兜底，若流中已完整推送则数据一致）
	evalResp, err := parseEvaluateResponse(fullText)
	if err != nil {
		log.Printf("[ai] Failed to parse evaluate response: %v, text: %s", err, fullText)
		return nil, fmt.Errorf("failed to parse AI response")
	}
	evalResp.Model = evaluateModel

	// 保存到数据库
	convID := uuid.New().String()
	contextData := map[string]any{
		"overallScore": evalResp.OverallScore,
		"level":        evalResp.Level,
		"summary":      evalResp.Summary,
		"dimensions":   evalResp.Dimensions,
		"issues":       evalResp.Issues,
		"actionItems":  evalResp.ActionItems,
		"model":        evalResp.Model,
	}
	contextJSON, _ := json.Marshal(contextData)
	conversation := &aiStorage.ConversationRecord{
		ID:                convID,
		UserID:            userID,
		ResumeID:          &req.ResumeID,
		SnapshotVersionID: req.SnapshotVersionID,
		Type:              string(model.ConversationTypeEvaluate),
		Title:             stringPtr("简历评估"),
		Context:           contextJSON,
	}
	if err := s.repo.Create(context.Background(), conversation); err != nil {
		log.Printf("[ai] Failed to create conversation: %v", err)
	} else if conversation.ResumeID != nil {
		s.invalidateConvCache(context.Background(), userID, *conversation.ResumeID)
	}
	s.repo.AddMessage(context.Background(), &aiStorage.MessageRecord{
		ID:             uuid.New().String(),
		ConversationID: convID,
		Role:           "user",
		Content:        prompt,
		Model:          &evaluateModel,
	})
	evalResp.ConversationID = convID

	s.repo.AddMessage(context.Background(), &aiStorage.MessageRecord{
		ID:             uuid.New().String(),
		ConversationID: convID,
		Role:           "assistant",
		Content:        fullText,
		Model:          &evaluateModel,
	})

	return evalResp, nil
}

// StreamJDMatch 流式分析简历与 JD 的匹配度
func (s *service) StreamJDMatch(ctx context.Context, userID string, req model.JDMatchRequest, onEvent func(StreamEvent)) (*model.JDMatchResponse, error) {
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

	jdMatchModel := cfg.DefaultModel
	prompt := buildJDMatchPrompt(req.Content, req.JDText, req.TargetTitle, req.CompanyName)

	// 脱敏
	maskedPrompt, san := s.maskPrompt(prompt)
	onEvent(StreamEvent{Type: "model", Model: jdMatchModel})

	accumulated := &strings.Builder{}
	pendingBuf := ""
	ch := make(chan string)
	doneCh := make(chan struct{})

	var (
		pendingSummary     string
		pendingScore       *int
		pendingLevel       string
		pendingKeywords    []model.JDKeywordMatch
		pendingStrengths   []string
		pendingGaps        []model.JDGap
		pendingSuggestions []model.JDResumeSuggestion
		pendingActions     []string
		prevType           string
	)

	flushModule := func() {
		if pendingSummary != "" {
			onEvent(StreamEvent{Type: "summary", Summary: pendingSummary})
			pendingSummary = ""
		}
		if pendingScore != nil || pendingLevel != "" {
			onEvent(StreamEvent{Type: "match_score", MatchScore: pendingScore, Level: pendingLevel})
			pendingScore = nil
			pendingLevel = ""
		}
		if len(pendingKeywords) > 0 {
			onEvent(StreamEvent{Type: "keyword_match", KeywordMatches: pendingKeywords})
			pendingKeywords = nil
		}
		if len(pendingStrengths) > 0 {
			onEvent(StreamEvent{Type: "strength_item", Strengths: pendingStrengths})
			pendingStrengths = nil
		}
		if len(pendingGaps) > 0 {
			onEvent(StreamEvent{Type: "gap_item", Gaps: pendingGaps})
			pendingGaps = nil
		}
		if len(pendingSuggestions) > 0 {
			onEvent(StreamEvent{Type: "resume_suggestion", ResumeSuggestions: pendingSuggestions})
			pendingSuggestions = nil
		}
		if len(pendingActions) > 0 {
			onEvent(StreamEvent{Type: "action_item", ActionItems: pendingActions})
			pendingActions = nil
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
		case "match_score":
			score := int(getFloat(obj["score"]))
			if score == 0 {
				score = int(getFloat(obj["matchScore"]))
			}
			pendingScore = &score
			pendingLevel = getString(obj["level"])
		case "keyword_match":
			pendingKeywords = append(pendingKeywords, model.JDKeywordMatch{
				Keyword:  getString(obj["keyword"]),
				Required: getBool(obj["required"]),
				Matched:  getBool(obj["matched"]),
				Evidence: getString(obj["evidence"]),
			})
		case "strength_item":
			pendingStrengths = append(pendingStrengths, getString(obj["content"]))
		case "gap_item":
			pendingGaps = append(pendingGaps, model.JDGap{
				Severity:        getString(obj["severity"]),
				Requirement:     getString(obj["requirement"]),
				CurrentEvidence: getString(obj["currentEvidence"]),
				Suggestion:      getString(obj["suggestion"]),
			})
		case "resume_suggestion":
			pendingSuggestions = append(pendingSuggestions, model.JDResumeSuggestion{
				ModuleType: getString(obj["moduleType"]),
				Title:      getString(obj["title"]),
				Suggestion: getString(obj["suggestion"]),
			})
		case "action_item":
			pendingActions = append(pendingActions, getString(obj["content"]))
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
		Model:     jdMatchModel,
		Prompt:    maskedPrompt,
		TimeoutMs: cfg.TimeoutMs,
		OnProgress: func(chunk string) {
			ch <- chunk
		},
	})
	close(ch)
	<-doneCh
	if err != nil {
		log.Printf("[ai] StreamJDMatch failed: %v", err)
		return nil, ErrAIRequestFailed
	}

	fullText := s.unmaskResponse(san, accumulated.String())
	jdResp, err := parseJDMatchResponse(fullText)
	if err != nil {
		log.Printf("[ai] Failed to parse JD match response: %v, text: %s", err, fullText)
		return nil, fmt.Errorf("failed to parse AI response")
	}
	jdResp.Model = jdMatchModel
	jdResp.TargetTitle = strings.TrimSpace(req.TargetTitle)
	jdResp.CompanyName = strings.TrimSpace(req.CompanyName)
	jdResp.JDText = req.JDText

	convID := uuid.New().String()
	contextData := map[string]any{
		"matchScore":        jdResp.MatchScore,
		"level":             jdResp.Level,
		"summary":           jdResp.Summary,
		"keywordMatches":    jdResp.KeywordMatches,
		"strengths":         jdResp.Strengths,
		"gaps":              jdResp.Gaps,
		"resumeSuggestions": jdResp.ResumeSuggestions,
		"actionItems":       jdResp.ActionItems,
		"jdText":            jdResp.JDText,
		"model":             jdResp.Model,
		"targetTitle":       req.TargetTitle,
		"companyName":       req.CompanyName,
	}
	contextJSON, _ := json.Marshal(contextData)
	title := "JD匹配分析"
	if strings.TrimSpace(req.TargetTitle) != "" {
		title = fmt.Sprintf("JD匹配 - %s", strings.TrimSpace(req.TargetTitle))
	}
	conversation := &aiStorage.ConversationRecord{
		ID:                convID,
		UserID:            userID,
		ResumeID:          &req.ResumeID,
		SnapshotVersionID: req.SnapshotVersionID,
		Type:              string(model.ConversationTypeJDMatch),
		Title:             stringPtr(title),
		Context:           contextJSON,
	}
	if err := s.repo.Create(context.Background(), conversation); err != nil {
		log.Printf("[ai] Failed to create JD match conversation: %v", err)
	} else if conversation.ResumeID != nil {
		s.invalidateConvCache(context.Background(), userID, *conversation.ResumeID)
	}
	s.repo.AddMessage(context.Background(), &aiStorage.MessageRecord{
		ID:             uuid.New().String(),
		ConversationID: convID,
		Role:           "user",
		Content:        prompt,
		Model:          &jdMatchModel,
	})
	jdResp.ConversationID = convID
	s.repo.AddMessage(context.Background(), &aiStorage.MessageRecord{
		ID:             uuid.New().String(),
		ConversationID: convID,
		Role:           "assistant",
		Content:        fullText,
		Model:          &jdMatchModel,
	})

	return jdResp, nil
}

// ScoreResumeForJD 基于 JD 对简历做深度评分
func (s *service) ScoreResumeForJD(ctx context.Context, userID string, req model.JDScoreRequest) (*model.JDScoreResponse, error) {
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

	prompt := buildJDScorePrompt(req.Content, req.JDText, req.TargetTitle, req.CompanyName)

	// 脱敏
	maskedPrompt, san := s.maskPrompt(prompt)
	result, err := s.aiProvider.Complete(ctx, CompleteRequest{
		APIKey:    apiKey,
		BaseURL:   cfg.BaseURL,
		Model:     cfg.DefaultModel,
		Prompt:    maskedPrompt,
		TimeoutMs: cfg.TimeoutMs,
	})
	if err != nil {
		log.Printf("[ai] ScoreResumeForJD failed: %v", err)
		return nil, ErrAIRequestFailed
	}
	// 还原脱敏
	result.Text = s.unmaskResponse(san, result.Text)

	jdParsed, summary, improvements, err := parseJDScoreAIResponse(result.Text)
	if err != nil {
		log.Printf("[ai] Failed to parse JD score response: %v, text: %s", err, result.Text)
		return nil, fmt.Errorf("failed to parse AI response")
	}

	breakdown := calculateJDScoreBreakdown(req.Content, jdParsed)
	overallScore := clampScore(int(float64(breakdown.ATS.Score)*0.3 + float64(breakdown.KeywordMatch.Score)*0.5 + float64(breakdown.SeniorityFit.Score)*0.2))
	if summary == "" {
		summary = buildJDScoreSummary(overallScore, breakdown)
	}
	if len(improvements) == 0 {
		improvements = buildJDScoreImprovements(breakdown)
	}

	resp := &model.JDScoreResponse{
		OverallScore: overallScore,
		Level:        scoreLevel(overallScore),
		Summary:      summary,
		JDParsed:     jdParsed,
		Breakdown:    breakdown,
		Improvements: improvements,
		TargetTitle:  strings.TrimSpace(req.TargetTitle),
		CompanyName:  strings.TrimSpace(req.CompanyName),
		JDText:       strings.TrimSpace(req.JDText),
		RawText:      result.Text,
		Model:        cfg.DefaultModel,
	}

	convID := uuid.New().String()
	contextData := map[string]any{
		"overallScore": resp.OverallScore,
		"level":        resp.Level,
		"summary":      resp.Summary,
		"jdParsed":     resp.JDParsed,
		"breakdown":    resp.Breakdown,
		"improvements": resp.Improvements,
		"model":        resp.Model,
		"targetTitle":  req.TargetTitle,
		"companyName":  req.CompanyName,
		"jdText":       req.JDText,
	}
	contextJSON, _ := json.Marshal(contextData)
	title := "JD深度评分"
	if strings.TrimSpace(req.TargetTitle) != "" {
		title = fmt.Sprintf("JD评分 - %s", strings.TrimSpace(req.TargetTitle))
	}
	conversation := &aiStorage.ConversationRecord{
		ID:                convID,
		UserID:            userID,
		ResumeID:          &req.ResumeID,
		SnapshotVersionID: req.SnapshotVersionID,
		Type:              string(model.ConversationTypeJDMatch),
		Title:             stringPtr(title),
		Context:           contextJSON,
	}
	if err := s.repo.Create(context.Background(), conversation); err != nil {
		log.Printf("[ai] Failed to create JD score conversation: %v", err)
	} else if conversation.ResumeID != nil {
		s.invalidateConvCache(context.Background(), userID, *conversation.ResumeID)
	}
	s.repo.AddMessage(context.Background(), &aiStorage.MessageRecord{
		ID:             uuid.New().String(),
		ConversationID: convID,
		Role:           "user",
		Content:        prompt,
		Model:          &cfg.DefaultModel,
	})
	resp.ConversationID = convID
	s.repo.AddMessage(context.Background(), &aiStorage.MessageRecord{
		ID:             uuid.New().String(),
		ConversationID: convID,
		Role:           "assistant",
		Content:        result.Text,
		Model:          &cfg.DefaultModel,
	})

	return resp, nil
}

// GenerateCoverLetter 生成求职信
func (s *service) GenerateCoverLetter(ctx context.Context, userID string, req model.CoverLetterRequest) (*model.CoverLetterResponse, error) {
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

	prompt := buildCoverLetterPrompt(req.Content, req.JDText, req.JobTitle, req.CompanyName, req.Tone, req.Language)

	// 脱敏
	maskedPrompt, san := s.maskPrompt(prompt)
	result, err := s.aiProvider.Complete(ctx, CompleteRequest{
		APIKey:    apiKey,
		BaseURL:   cfg.BaseURL,
		Model:     cfg.DefaultModel,
		Prompt:    maskedPrompt,
		TimeoutMs: cfg.TimeoutMs,
	})
	if err != nil {
		log.Printf("[ai] GenerateCoverLetter failed: %v", err)
		return nil, ErrAIRequestFailed
	}
	// 还原脱敏
	result.Text = s.unmaskResponse(san, result.Text)

	coverResp, err := parseCoverLetterResponse(result.Text)
	if err != nil {
		log.Printf("[ai] Failed to parse cover letter response: %v", err)
		return nil, fmt.Errorf("failed to parse AI response")
	}
	coverResp.Model = cfg.DefaultModel
	coverResp.JobTitle = strings.TrimSpace(req.JobTitle)
	coverResp.CompanyName = strings.TrimSpace(req.CompanyName)
	coverResp.JDText = strings.TrimSpace(req.JDText)

	convID := uuid.New().String()
	contextData := map[string]any{
		"title":          coverResp.Title,
		"coverLetter":    coverResp.CoverLetter,
		"highlightsUsed": coverResp.HighlightsUsed,
		"tips":           coverResp.Tips,
		"model":          coverResp.Model,
		"jobTitle":       req.JobTitle,
		"companyName":    req.CompanyName,
		"jdText":         req.JDText,
		"tone":           req.Tone,
		"language":       req.Language,
	}
	contextJSON, _ := json.Marshal(contextData)
	title := "求职信生成"
	if strings.TrimSpace(req.JobTitle) != "" {
		title = fmt.Sprintf("求职信 - %s", strings.TrimSpace(req.JobTitle))
	}
	conversation := &aiStorage.ConversationRecord{
		ID:                convID,
		UserID:            userID,
		ResumeID:          &req.ResumeID,
		SnapshotVersionID: req.SnapshotVersionID,
		Type:              string(model.ConversationTypeCoverLetter),
		Title:             stringPtr(title),
		Context:           contextJSON,
	}
	if err := s.repo.Create(context.Background(), conversation); err != nil {
		log.Printf("[ai] Failed to create cover letter conversation: %v", err)
	} else if conversation.ResumeID != nil {
		s.invalidateConvCache(context.Background(), userID, *conversation.ResumeID)
	}
	s.repo.AddMessage(context.Background(), &aiStorage.MessageRecord{
		ID:             uuid.New().String(),
		ConversationID: convID,
		Role:           "user",
		Content:        prompt,
		Model:          &cfg.DefaultModel,
	})
	coverResp.ConversationID = convID
	s.repo.AddMessage(context.Background(), &aiStorage.MessageRecord{
		ID:             uuid.New().String(),
		ConversationID: convID,
		Role:           "assistant",
		Content:        result.Text,
		Model:          &cfg.DefaultModel,
	})

	return coverResp, nil
}

// PartialEvaluateResult 部分评估结果（流式推送用）
type PartialEvaluateResult struct {
	Raw          string                    `json:"raw,omitempty"`
	OverallScore *int                      `json:"overallScore,omitempty"`
	Level        string                    `json:"level,omitempty"`
	Summary      string                    `json:"summary,omitempty"`
	Dimensions   []model.EvaluateDimension `json:"dimensions,omitempty"`
	Issues       []model.EvaluateIssue     `json:"issues,omitempty"`
	ActionItems  []string                  `json:"actionItems,omitempty"`
	Done         bool                      `json:"done,omitempty"`
	Finish       bool                      `json:"finish,omitempty"`
	Model        string                    `json:"model,omitempty"`
}

// StreamEvent 流式 SSE 事件，封装所有可能推送给前端的数据结构
type StreamEvent struct {
	Type              string                     `json:"type"` // "model" | "summary" | "overall_score" | "dimension_score" | "issue_item" | "action_item" | "finish"
	Model             string                     `json:"model,omitempty"`
	Summary           string                     `json:"summary,omitempty"`
	OverallScore      *int                       `json:"overallScore,omitempty"`
	MatchScore        *int                       `json:"matchScore,omitempty"`
	Level             string                     `json:"level,omitempty"`
	Dimensions        []model.EvaluateDimension  `json:"dimensions,omitempty"`
	Issues            []model.EvaluateIssue      `json:"issues,omitempty"`
	KeywordMatches    []model.JDKeywordMatch     `json:"keywordMatches,omitempty"`
	Strengths         []string                   `json:"strengths,omitempty"`
	Gaps              []model.JDGap              `json:"gaps,omitempty"`
	ResumeSuggestions []model.JDResumeSuggestion `json:"resumeSuggestions,omitempty"`
	ActionItems       []string                   `json:"actionItems,omitempty"`
	RawText           string                     `json:"rawText,omitempty"` // 用于 debug 的原始行文本
}

// tryParsePartial 从累积文本中解析部分结果，支持 NDJSON 格式
func tryParsePartial(text string) *PartialEvaluateResult {
	result := &PartialEvaluateResult{Raw: text}
	lines := strings.Split(text, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || !strings.HasPrefix(line, "{") {
			continue
		}
		// 可能是完整 JSON 对象，尝试解析
		var obj map[string]interface{}
		if err := json.Unmarshal([]byte(line), &obj); err != nil {
			continue
		}
		// 合并到结果
		if v, ok := obj["type"]; ok {
			switch v {
			case "overall_score":
				if score, ok := obj["score"].(float64); ok {
					scoreInt := int(score)
					result.OverallScore = &scoreInt
				}
				if level, ok := obj["level"].(string); ok {
					result.Level = level
				}
			case "summary":
				if content, ok := obj["content"].(string); ok {
					result.Summary = content
				}
			case "dimension_score":
				if key, ok := obj["key"].(string); ok {
					dim := model.EvaluateDimension{
						Key:     key,
						Label:   obj["label"].(string),
						Score:   int(obj["score"].(float64)),
						Comment: obj["comment"].(string),
					}
					result.Dimensions = append(result.Dimensions, dim)
				}
			case "issue_item":
				if id, ok := obj["id"].(string); ok {
					issue := model.EvaluateIssue{
						ID:          id,
						Severity:    obj["severity"].(string),
						Title:       obj["title"].(string),
						Description: obj["description"].(string),
						Suggestion:  obj["suggestion"].(string),
					}
					result.Issues = append(result.Issues, issue)
				}
			case "action_item":
				if content, ok := obj["content"].(string); ok {
					result.ActionItems = append(result.ActionItems, content)
				}
			case "finish":
				result.Finish = true
			}
		}
	}

	// 只有解析到有效数据才返回
	if result.OverallScore != nil || result.Summary != "" || len(result.Dimensions) > 0 {
		return result
	}
	return nil
}

// Suggest 内容润色建议
func (s *service) Suggest(ctx context.Context, userID string, req model.SuggestRequest) (*model.SuggestResponse, error) {
	// 获取配置
	cfg, err := s.cfgRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, ErrAIConfigNotFound
	}
	if !cfg.Enabled {
		return nil, fmt.Errorf("AI 功能未启用")
	}

	// 优先检查缓存：相同简历+模块+实例ID+内容hash，返回最近一条润色结果
	if req.ContentHash != "" {
		cached, messages, err := s.repo.GetSuggestByContentHash(ctx, userID, req.ResumeID, req.ModuleType, req.ModuleInstanceID, req.ContentHash)
		if err == nil && cached != nil && len(messages) >= 2 {
			// 从缓存中提取 AI 响应
			var aiContent string
			for _, msg := range messages {
				if msg.Role == "assistant" {
					aiContent = msg.Content
					break
				}
			}
			if aiContent != "" {
				suggestResp, err := parseSuggestResponse(aiContent)
				if err == nil {
					suggestResp.Model = cfg.DefaultModel
					suggestResp.ConversationID = cached.ID
					suggestResp.FromCache = true
					return suggestResp, nil
				}
			}
		}
	}

	// 解密 API Key
	apiKey, err := s.encryption.Decrypt(cfg.APIKeyEncrypted)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt API key")
	}

	// 构建提示词
	prompt := buildSuggestPrompt(req.ModuleType, req.FieldKey, req.Content)

	// 脱敏
	maskedPrompt, san := s.maskPrompt(prompt)

	// 调用 AI
	result, err := s.aiProvider.Complete(ctx, CompleteRequest{
		APIKey:    apiKey,
		BaseURL:   cfg.BaseURL,
		Model:     cfg.DefaultModel,
		Prompt:    maskedPrompt,
		TimeoutMs: cfg.TimeoutMs,
	})
	if err != nil {
		log.Printf("[ai] Suggest failed: %v", err)
		return nil, ErrAIRequestFailed
	}
	// 还原脱敏
	result.Text = s.unmaskResponse(san, result.Text)

	// 解析响应
	suggestResp, err := parseSuggestResponse(result.Text)
	if err != nil {
		log.Printf("[ai] Failed to parse suggest response: %v", err)
		return nil, fmt.Errorf("failed to parse AI response")
	}
	suggestResp.Model = cfg.DefaultModel
	suggestResp.FromCache = false

	// 创建对话会话，context 保存润色结果
	convID := uuid.New().String()
	contextData := map[string]any{
		"moduleType":       req.ModuleType,
		"moduleInstanceId": req.ModuleInstanceID,
		"fieldKey":         req.FieldKey,
		"contentHash":      req.ContentHash,
		"suggestions":      suggestResp.Suggestions,
	}
	contextJSON, _ := json.Marshal(contextData)
	conversation := &aiStorage.ConversationRecord{
		ID:               convID,
		UserID:           userID,
		ResumeID:         &req.ResumeID,
		Type:             string(model.ConversationTypeSuggest),
		Title:            stringPtr(fmt.Sprintf("润色 - %s", req.ModuleType)),
		Context:          contextJSON,
		ModuleType:       req.ModuleType,
		ModuleInstanceID: req.ModuleInstanceID,
	}
	if err := s.repo.Create(context.Background(), conversation); err != nil {
		log.Printf("[ai] Failed to create conversation: %v", err)
	} else if conversation.ResumeID != nil {
		s.invalidateConvCache(context.Background(), userID, *conversation.ResumeID)
	}

	// 保存用户消息
	s.repo.AddMessage(context.Background(), &aiStorage.MessageRecord{
		ID:             uuid.New().String(),
		ConversationID: convID,
		Role:           "user",
		Content:        prompt,
		Model:          &cfg.DefaultModel,
	})

	suggestResp.ConversationID = convID

	// 保存 AI 响应
	s.repo.AddMessage(context.Background(), &aiStorage.MessageRecord{
		ID:             uuid.New().String(),
		ConversationID: convID,
		Role:           "assistant",
		Content:        result.Text,
		Model:          &cfg.DefaultModel,
	})

	return suggestResp, nil
}

// AddMessage 添加消息
func (s *service) AddMessage(ctx context.Context, conversationID, role, content string) (*model.AIMessage, error) {
	msg, err := s.repo.AddMessage(ctx, &aiStorage.MessageRecord{
		ID:             uuid.New().String(),
		ConversationID: conversationID,
		Role:           role,
		Content:        content,
	})
	if err != nil {
		return nil, err
	}
	return msg, nil
}

// ============ 提示词构建 ============

func sanitizeAIResumeContent(content map[string]interface{}) map[string]interface{} {
	result := map[string]interface{}{
		"title":  truncateString(getString(content["title"]), 200),
		"locale": truncateString(getString(content["locale"]), 20),
	}

	// 兼容两种类型：[]map[string]interface{}（来自 ResumeDetail.Modules）或 []interface{}
	var modulesValue []interface{}
	switch v := content["modules"].(type) {
	case []map[string]interface{}:
		for _, m := range v {
			modulesValue = append(modulesValue, m)
		}
	case []interface{}:
		modulesValue = v
	default:
		return result
	}

	modules := make([]map[string]interface{}, 0, len(modulesValue))
	for _, moduleValue := range modulesValue {
		module, ok := moduleValue.(map[string]interface{})
		if !ok || module["visible"] == false {
			continue
		}

		moduleType := getString(module["type"])
		sanitized := map[string]interface{}{
			"type":  moduleType,
			"title": truncateString(getString(module["title"]), 100),
			"data":  sanitizeModuleData(moduleType, module["data"]),
		}
		modules = append(modules, sanitized)
	}

	result["modules"] = modules
	return result
}

func sanitizeModuleData(moduleType string, dataValue interface{}) interface{} {
	data, ok := dataValue.(map[string]interface{})
	if !ok {
		return map[string]interface{}{}
	}

	switch moduleType {
	case "personal":
		return pickStringFields(data, []string{"name", "targetPosition", "phone", "email", "gender", "education", "personalAccount", "city", "website", "github", "linkedin", "workYears", "politics", "age", "hometown"})
	case "skills", "summary":
		result := pickStringFields(data, []string{"content"})
		if items, ok := data["items"].([]interface{}); ok {
			result["items"] = sanitizeItems(items, []string{"name", "level"}, 80)
		}
		return result
	case "custom":
		result := pickStringFields(data, []string{"title"})
		if items, ok := data["items"].([]interface{}); ok {
			result["items"] = sanitizeItems(items, []string{"title", "content", "date"}, 1200)
		}
		return result
	default:
		if items, ok := data["items"].([]interface{}); ok {
			return map[string]interface{}{"items": sanitizeItems(items, fieldsForModule(moduleType), 1200)}
		}
		return pickStringFields(data, fieldsForModule(moduleType))
	}
}

func fieldsForModule(moduleType string) []string {
	switch moduleType {
	case "education":
		return []string{"school", "major", "degree", "startDate", "endDate", "gpa", "honors", "schoolExperience"}
	case "work":
		return []string{"company", "position", "department", "startDate", "endDate", "description", "companySize"}
	case "project":
		return []string{"name", "role", "startDate", "endDate", "description", "link", "techStack"}
	case "awards":
		return []string{"name", "level", "date", "description"}
	case "certificates":
		return []string{"name", "date", "issuer"}
	case "portfolio":
		return []string{"title", "url", "description"}
	case "languages":
		return []string{"language", "level"}
	default:
		return []string{"content", "description", "title"}
	}
}

func sanitizeItems(items []interface{}, fields []string, maxTextLength int) []map[string]interface{} {
	result := make([]map[string]interface{}, 0, len(items))
	for _, itemValue := range items {
		item, ok := itemValue.(map[string]interface{})
		if !ok {
			continue
		}
		result = append(result, pickFields(item, fields, maxTextLength))
	}
	return result
}

func pickStringFields(data map[string]interface{}, fields []string) map[string]interface{} {
	return pickFields(data, fields, 1200)
}

func pickFields(data map[string]interface{}, fields []string, maxTextLength int) map[string]interface{} {
	result := map[string]interface{}{}
	for _, field := range fields {
		value, ok := data[field]
		if !ok {
			continue
		}
		switch typed := value.(type) {
		case string:
			if strings.TrimSpace(typed) != "" {
				result[field] = truncateString(typed, maxTextLength)
			}
		case []interface{}:
			values := make([]string, 0, len(typed))
			for _, item := range typed {
				text := truncateString(getString(item), 80)
				if text != "" {
					values = append(values, text)
				}
			}
			if len(values) > 0 {
				result[field] = values
			}
		case float64, bool:
			result[field] = typed
		}
	}
	return result
}

func truncateString(value string, maxLength int) string {
	value = strings.TrimSpace(value)
	if len([]rune(value)) <= maxLength {
		return value
	}
	runes := []rune(value)
	return string(runes[:maxLength]) + "..."
}

func buildEvaluatePrompt(content map[string]interface{}) string {
	var sb strings.Builder
	sb.WriteString("你是资深简历评估顾问，严格遵守以下所有规则，禁止任何违规输出，禁止对空内容/无有效信息的简历给出任何形式的高分。\n")
	sb.WriteString("\n【隐私保护声明 — 必须遵守】\n")
	sb.WriteString("简历中以 [NAME_N]、[PHONE_N]、[EMAIL_N]、[ADDR_N]、[URL_N]、[ID_N]、[CODE_N]、[COMP_N]、[SALARY_N] 等固定格式出现的内容均为已填写真实信息的隐私脱敏标记，不是缺失、不是占位、不是无效内容。你必须在评估中将其视为已填写的有效信息，禁止将这些标记判定为\"未填写\"\"占位符\"\"缺失\"\"不完整\"等质量问题。\n")
	sb.WriteString("【基础定义强制规则】\n")
	sb.WriteString("1. 有效内容定义：仅指能支撑求职画像的、非空的、有具体信息的内容，包括但不限于完整的个人求职信息、教育经历、工作经历、项目经历、技能成果等；空白字段、无意义字符、纯标点符号，不属于有效内容。注意：[NAME_N]、[PHONE_N] 等固定格式为隐私脱敏标记，属于有效内容。\n")
	sb.WriteString("2. 核心必填模块定义：个人信息（含求职意向）、教育背景、工作经历/项目经历（应届生至少有一项），以上为简历必须有有效内容的核心模块，缺一不可。\n")
	sb.WriteString("3. 空简历判定：核心必填模块均无有效内容，直接判定为无效空简历，强制执行后续兜底扣分规则。\n")

	// 核心流式格式约束
	sb.WriteString("\n【输出格式强制规则】\n")
	sb.WriteString("1. 必须使用 JSON Lines 格式输出，**每行一个独立完整的JSON对象**，每行必须以换行符\\n结尾，禁止输出任何非JSON内容、markdown、注释、解释。\n")
	sb.WriteString("2. 每个JSON对象必须包含type字段，type仅允许以下枚举值：summary、overall_score、dimension_score、issue_item、action_item、finish，禁止自定义type。\n")
	sb.WriteString("3. 仅当模块有有效内容时才输出对应JSON行，**空内容、无数据的模块禁止输出**。\n")
	sb.WriteString("4. 输出顺序必须严格固定为：summary → overall_score → dimension_score（按固定6个维度顺序输出） → issue_item（按严重程度高→中→低排序输出） → action_item → finish，禁止乱序。\n")
	sb.WriteString("5. finish类型必须是最后一行输出，标识流式输出结束。\n")

	// 每个type的结构约束
	sb.WriteString("\n【每个type的JSON结构约束】\n")
	sb.WriteString("- type:summary 结构：{\"type\":\"summary\",\"content\":\"字符串，220字以内的整体评价，空简历必须明确标注「无效空简历，核心模块无有效内容」\"}\n")
	sb.WriteString("- type:overall_score 结构：{\"type\":\"overall_score\",\"score\":0-100整数,\"level\":\"A/A-/B+/B/B-/C+/C/D\"}\n")
	sb.WriteString("- type:dimension_score 结构：{\"type\":\"dimension_score\",\"key\":\"固定枚举key\",\"label\":\"固定枚举label\",\"score\":0-100整数,\"comment\":\"120字以内评价，无有效内容必须明确说明「无有效内容，无法评估，得0分」\"}\n")
	sb.WriteString("- type:issue_item 结构：{\"type\":\"issue_item\",\"id\":\"issue-1格式唯一ID\",\"moduleType\":\"固定枚举值\",\"severity\":\"high/medium/low\",\"title\":\"问题标题\",\"description\":\"120字以内描述\",\"suggestion\":\"修改建议\"}\n")
	sb.WriteString("- type:action_item 结构：{\"type\":\"action_item\",\"content\":\"可执行改进项内容\"}\n")
	sb.WriteString("- type:finish 结构：{\"type\":\"finish\",\"timestamp\":\"毫秒级时间戳\"}\n")

	// 固定枚举约束
	sb.WriteString("\n【固定枚举值约束，禁止修改】\n")
	sb.WriteString("1. dimension_score的key与label必须严格一一对应，输出顺序必须和下方枚举顺序完全一致：\n")
	sb.WriteString(`[{"key":"structure","label":"结构完整性"},{"key":"content_relevance","label":"内容相关性"},{"key":"skill_experience","label":"技能与经验展示"},{"key":"language_format","label":"语言表达与格式"},{"key":"overall_impression","label":"整体印象"},{"key":"quantified_impact","label":"量化成果与影响力"}]` + "\n")
	sb.WriteString("2. moduleType枚举值：personal, education, work, project, skills, awards, summary, certificates, portfolio, languages, custom\n")
	sb.WriteString("3. severity枚举值：high/medium/low\n")
	sb.WriteString("4. level枚举值与分数强制对应关系，禁止越级定级：\n")
	sb.WriteString("   A:90-100 | A-:85-89 | B+:80-84 | B:75-79 | B-:70-74 | C+:65-69 | C:60-64 | D:0-59\n")

	// 评分核心强制规则（修复核心漏洞）
	sb.WriteString("\n【评分核心强制规则，优先级最高，违反视为无效输出】\n")
	sb.WriteString("1. 综合评分强制计算规则：综合分 = 6个维度得分的平均分，禁止脱离维度分随意给综合分；空简历综合分不得超过10分，必须定级为D。\n")
	sb.WriteString("2. 维度评分强制规则：\n")
	sb.WriteString("   - 核心必填模块无有效内容时，结构完整性、内容相关性、技能与经验展示、量化成果与影响力、整体印象，5个维度必须直接给0分；\n")
	sb.WriteString("   - 语言表达与格式维度：仅当简历有≥3个核心模块有效内容时，才可评估格式规范度；无有效内容时，必须直接给0分，禁止给任何正分，comment必须标注「无有效简历内容，格式无评估意义，得0分」；\n")
	sb.WriteString("3. 空简历/核心模块全空时，必须输出最高严重程度(high)的issue_item，覆盖所有缺失的核心必填模块，禁止遗漏。\n")
	sb.WriteString("4. action_item必须固定输出3条可执行的改进项，禁止输出空字符串，空简历必须输出补充核心模块的对应动作。\n")

	// 业务规则约束
	sb.WriteString("\n【业务评估补充规则】\n")
	sb.WriteString("1. 评估范围仅限简历内容质量（信息完整性、岗位相关性、表达与量化成果），禁止评价页面结构、UI配置、visible、layout、style等展示控制字段。\n")
	sb.WriteString("2. 特殊豁免规则：专业技能模块visible=false、个人信息targetPosition/workyears为空、教育经历gpa/honors为空时，视为可选信息，不得作为问题项或扣分依据。\n")
	sb.WriteString("3. issues必须按严重程度高→中→低排序输出，无对应问题则不输出该issue_item，核心模块缺失必须归为high严重程度。\n")

	sb.WriteString("\n简历 JSON：\n")
	data, _ := json.Marshal(sanitizeAIResumeContent(content))
	sb.WriteString(string(data))
	return sb.String()
}

func buildJDMatchPrompt(content map[string]interface{}, jdText, targetTitle, companyName string) string {
	resumeJSON, _ := json.Marshal(sanitizeAIResumeContent(content))
	return fmt.Sprintf(`你是资深招聘顾问和简历优化专家，请基于候选人简历与目标岗位 JD 做匹配分析。

【隐私保护声明 — 必须遵守】
简历中以 [NAME_N]、[PHONE_N]、[EMAIL_N]、[ADDR_N]、[URL_N]、[ID_N]、[CODE_N]、[COMP_N]、[SALARY_N] 等固定格式出现的内容均为已填写真实信息的隐私脱敏标记，不是缺失、不是占位、不是无效内容。你必须在分析中将其视为已填写的有效信息，禁止将这些标记判定为"未填写""占位符""缺失""不完整"等质量问题。

【输出格式强制规则】
1. 必须使用 JSON Lines 格式输出，每行一个完整 JSON 对象，每行以换行符结尾。
2. 禁止输出 Markdown、解释性文字、代码块或任何非 JSON 内容。
3. type 仅允许：summary、match_score、keyword_match、strength_item、gap_item、resume_suggestion、action_item、finish。
4. 输出顺序必须固定为：summary → match_score → keyword_match → strength_item → gap_item → resume_suggestion → action_item → finish。
5. finish 必须是最后一行。

【每个 type 的 JSON 结构】
- {"type":"summary","content":"180字以内概述候选人与岗位的匹配情况"}
- {"type":"match_score","score":0-100整数,"level":"A/A-/B+/B/B-/C+/C/D"}
- {"type":"keyword_match","keyword":"JD关键词","required":true/false,"matched":true/false,"evidence":"简历中的证据，未体现则写未体现"}
- {"type":"strength_item","content":"候选人与岗位匹配的优势"}
- {"type":"gap_item","severity":"high/medium/low","requirement":"JD要求","currentEvidence":"当前简历证据或未体现","suggestion":"补充或优化建议"}
- {"type":"resume_suggestion","moduleType":"personal/education/work/project/skills/awards/summary/certificates/portfolio/languages/custom","title":"建议标题","suggestion":"具体修改建议"}
- {"type":"action_item","content":"下一步可执行动作"}
- {"type":"finish","timestamp":"毫秒级时间戳"}

【分析规则】
1. 只基于给定简历和 JD 分析，不编造候选人没有的经历。
2. 关键词需覆盖 JD 中的核心技能、职责、业务领域、经验年限和软技能要求。
3. 匹配分数必须体现证据充分性：简历未体现的要求不能算匹配。
4. gaps 优先输出高影响缺口，resume_suggestion 必须能指导用户直接修改简历。
5. 若 JD 或简历有效信息不足，必须在 summary 中明确说明，并降低匹配分数。

【目标岗位】
%s

【目标公司】
%s

【岗位 JD】
%s

【简历 JSON】
%s`, strings.TrimSpace(targetTitle), strings.TrimSpace(companyName), strings.TrimSpace(jdText), string(resumeJSON))
}

func buildJDScorePrompt(content map[string]interface{}, jdText, targetTitle, companyName string) string {
	resumeJSON, _ := json.Marshal(sanitizeAIResumeContent(content))
	return fmt.Sprintf(`你是资深招聘需求分析专家，请将目标岗位 JD 解析为结构化 JSON，并给出简历匹配概述。

【隐私保护声明 — 必须遵守】
简历中以 [NAME_N]、[PHONE_N]、[EMAIL_N] 等固定格式出现的内容均为已填写真实信息的隐私脱敏标记，禁止将其判定为无效或缺失。

【强制规则】
1. 只返回一个 JSON 对象，禁止 Markdown、代码块、注释或额外说明。
2. 只基于 JD 和简历已有内容分析，不编造候选人经历。
3. jdParsed.keyPhrases 提取 12-30 个 ATS 会识别的关键词或短语。
4. required 必须区分必备和加分项。
5. improvements 只输出可执行建议，最多 5 条。

【返回格式】
{
  "summary": "180字以内匹配概述",
  "jdParsed": {
    "jobTitle": "岗位名称",
    "company": "公司名称",
    "seniorityLevel": "intern/junior/mid/senior/lead/principal/unknown",
    "employmentType": "full-time/part-time/contract/intern/unknown",
    "hardSkills": [{"name":"Go","required":true,"proficiency":"familiar/proficient/expert/unknown","context":"JD中的语境"}],
    "softSkills": [],
    "tools": [],
    "domains": [],
    "experienceRequirements": [{"field":"后端开发","minYears":3,"required":true,"context":"JD中的语境"}],
    "educationRequirement": {"level":"bachelor/master/phd/any/unknown","majors":["计算机"],"required":false},
    "certifications": [],
    "languages": [],
    "keyPhrases": ["Go", "微服务"],
    "categories": ["backend"]
  },
  "improvements": [{"category":"keyword","potentialGain":8,"action":"在项目经历中补充 Go 和微服务关键词","priority":"high"}]
}

【目标岗位】
%s

【目标公司】
%s

【岗位 JD】
%s

【简历 JSON】
%s`, strings.TrimSpace(targetTitle), strings.TrimSpace(companyName), strings.TrimSpace(jdText), string(resumeJSON))
}

func buildCoverLetterPrompt(content map[string]interface{}, jdText, jobTitle, companyName, tone, language string) string {
	resumeJSON, _ := json.Marshal(sanitizeAIResumeContent(content))
	if strings.TrimSpace(tone) == "" {
		tone = "professional"
	}
	if strings.TrimSpace(language) == "" {
		language = "zh-CN"
	}

	return fmt.Sprintf(`你是资深职业顾问，请基于候选人简历和目标岗位信息生成专业求职信或投递邮件正文。

【隐私保护声明 — 必须遵守】
简历中以 [NAME_N]、[PHONE_N]、[EMAIL_N] 等固定格式出现的内容均为已填写真实信息的隐私脱敏标记。生成的求职信中可以保留这些脱敏标记，禁止将其视为缺失或错误。

【强制规则】
1. 只返回一个 JSON 对象，禁止输出 Markdown、代码块、注释或额外说明。
2. 不编造简历中不存在的经历、公司、奖项或数据。
3. 求职信要自然、具体、适合直接复制使用，避免空泛套话。
4. 如果 JD 为空，基于岗位名称和简历亮点生成通用但专业的版本。
5. language 为 zh-CN 时使用中文；为 en-US 时使用英文。

【返回格式】
{
  "title": "求职信 - 岗位名称",
  "coverLetter": "完整求职信正文",
  "highlightsUsed": ["使用到的简历亮点"],
  "tips": ["投递前建议"]
}

【目标岗位】
%s

【目标公司】
%s

【语气风格】
%s

【语言】
%s

【岗位 JD】
%s

【简历 JSON】
%s`, strings.TrimSpace(jobTitle), strings.TrimSpace(companyName), strings.TrimSpace(tone), strings.TrimSpace(language), strings.TrimSpace(jdText), string(resumeJSON))
}

func buildSuggestPrompt(moduleType, fieldKey, content string) string {
	return fmt.Sprintf(`你是资深简历润色专家，严格遵循以下规则提供修改建议，禁止任何违规输出。

【隐私保护声明 — 必须遵守】
原文中以 [NAME_N]、[PHONE_N]、[EMAIL_N] 等固定格式出现的内容为隐私脱敏标记，润色时必须原样保留这些标记，禁止修改或删除。

【核心规则】
1. 结合模块类型和字段特性给出针对性建议，不同模块润色重点不同：
   - 工作/项目经历：重点关注STAR法则、量化成果、动词开头
   - 个人简介：重点关注岗位匹配度、核心优势提炼
   - 技能模块：重点关注技能熟练度、与岗位的关联度
   - 教育背景：重点关注GPA、荣誉、相关课程（仅应届生）
2. 每条建议必须包含「不足分析」和「改进建议」两部分，表述具体可落地，禁止空泛
3. 若当前内容为空，直接给出该模块/字段的填充方向和示例框架
4. 建议数量控制在3-5条，优先选择最核心的改进点
5. 严格按下方JSON格式返回，禁止输出任何非JSON内容、markdown、注释

【返回格式强制要求】
{
  "suggestions": [
    {	
		"content": "润色后的完整内容",
  		"reason": "原内容的不足分析（简洁、专业、可落地）"
	}
  ]
}

【待润色信息】
模块类型：%s
字段：%s
当前内容：
%s`, moduleType, fieldKey, content)
}

// ============ 响应解析 ============

// parseEvaluateResponse 解析 NDJSON 格式的评估响应
// NDJSON: 每行一个 JSON 对象，通过 type 字段区分类型
func parseEvaluateResponse(text string) (*model.EvaluateResponse, error) {
	resp := &model.EvaluateResponse{
		Dimensions:  []model.EvaluateDimension{},
		Issues:      []model.EvaluateIssue{},
		ActionItems: []string{},
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

		switch obj["type"] {
		case "overall_score":
			if score, ok := obj["score"].(float64); ok {
				resp.OverallScore = int(score)
			}
			if level, ok := obj["level"].(string); ok {
				resp.Level = level
			}
		case "summary":
			if content, ok := obj["content"].(string); ok {
				resp.Summary = content
			}
		case "dimension_score":
			if key, ok := obj["key"].(string); ok {
				dim := model.EvaluateDimension{
					Key:     key,
					Label:   getString(obj["label"]),
					Score:   int(getFloat(obj["score"])),
					Comment: getString(obj["comment"]),
				}
				resp.Dimensions = append(resp.Dimensions, dim)
			}
		case "issue_item":
			if id, ok := obj["id"].(string); ok {
				issue := model.EvaluateIssue{
					ID:          id,
					Severity:    getString(obj["severity"]),
					Title:       getString(obj["title"]),
					Description: getString(obj["description"]),
					Suggestion:  getString(obj["suggestion"]),
				}
				resp.Issues = append(resp.Issues, issue)
			}
		case "action_item":
			if content, ok := obj["content"].(string); ok {
				resp.ActionItems = append(resp.ActionItems, content)
			}
		}
	}

	// 验证必要字段
	if resp.OverallScore == 0 && resp.Summary == "" {
		return nil, fmt.Errorf("failed to parse evaluation response: no valid data found")
	}

	resp.RawText = text
	return resp, nil
}

func getString(v interface{}) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func getFloat(v interface{}) float64 {
	if f, ok := v.(float64); ok {
		return f
	}
	return 0
}

func getBool(v interface{}) bool {
	if b, ok := v.(bool); ok {
		return b
	}
	return false
}

func parseJDMatchResponse(text string) (*model.JDMatchResponse, error) {
	resp := &model.JDMatchResponse{
		KeywordMatches:    []model.JDKeywordMatch{},
		Strengths:         []string{},
		Gaps:              []model.JDGap{},
		ResumeSuggestions: []model.JDResumeSuggestion{},
		ActionItems:       []string{},
		RawText:           text,
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
		case "match_score":
			resp.MatchScore = int(getFloat(obj["score"]))
			if resp.MatchScore == 0 {
				resp.MatchScore = int(getFloat(obj["matchScore"]))
			}
			resp.Level = getString(obj["level"])
		case "keyword_match":
			if keyword := getString(obj["keyword"]); keyword != "" {
				resp.KeywordMatches = append(resp.KeywordMatches, model.JDKeywordMatch{
					Keyword:  keyword,
					Required: getBool(obj["required"]),
					Matched:  getBool(obj["matched"]),
					Evidence: getString(obj["evidence"]),
				})
			}
		case "strength_item":
			if content := getString(obj["content"]); content != "" {
				resp.Strengths = append(resp.Strengths, content)
			}
		case "gap_item":
			if requirement := getString(obj["requirement"]); requirement != "" {
				resp.Gaps = append(resp.Gaps, model.JDGap{
					Severity:        getString(obj["severity"]),
					Requirement:     requirement,
					CurrentEvidence: getString(obj["currentEvidence"]),
					Suggestion:      getString(obj["suggestion"]),
				})
			}
		case "resume_suggestion":
			if suggestion := getString(obj["suggestion"]); suggestion != "" {
				resp.ResumeSuggestions = append(resp.ResumeSuggestions, model.JDResumeSuggestion{
					ModuleType: getString(obj["moduleType"]),
					Title:      getString(obj["title"]),
					Suggestion: suggestion,
				})
			}
		case "action_item":
			if content := getString(obj["content"]); content != "" {
				resp.ActionItems = append(resp.ActionItems, content)
			}
		}
	}

	if resp.Summary == "" && resp.MatchScore == 0 && len(resp.KeywordMatches) == 0 {
		return nil, fmt.Errorf("failed to parse JD match response: no valid data found")
	}

	return resp, nil
}

func parseCoverLetterResponse(text string) (*model.CoverLetterResponse, error) {
	firstBrace := strings.Index(text, "{")
	lastBrace := strings.LastIndex(text, "}")
	if firstBrace == -1 || lastBrace == -1 || lastBrace <= firstBrace {
		return nil, fmt.Errorf("invalid JSON response")
	}
	jsonStr := text[firstBrace : lastBrace+1]

	var resp struct {
		Title          string   `json:"title"`
		CoverLetter    string   `json:"coverLetter"`
		HighlightsUsed []string `json:"highlightsUsed"`
		Tips           []string `json:"tips"`
	}
	if err := json.Unmarshal([]byte(jsonStr), &resp); err != nil {
		return nil, err
	}
	if strings.TrimSpace(resp.CoverLetter) == "" {
		return nil, fmt.Errorf("cover letter is empty")
	}

	return &model.CoverLetterResponse{
		Title:          resp.Title,
		CoverLetter:    resp.CoverLetter,
		HighlightsUsed: resp.HighlightsUsed,
		Tips:           resp.Tips,
		RawText:        text,
	}, nil
}

func parseSuggestResponse(text string) (*model.SuggestResponse, error) {
	firstBrace := strings.Index(text, "{")
	lastBrace := strings.LastIndex(text, "}")
	if firstBrace == -1 || lastBrace == -1 || lastBrace <= firstBrace {
		return nil, fmt.Errorf("invalid JSON response")
	}
	jsonStr := text[firstBrace : lastBrace+1]

	var resp struct {
		Suggestions []struct {
			Content string `json:"content"`
			Reason  string `json:"reason"`
		} `json:"suggestions"`
	}
	if err := json.Unmarshal([]byte(jsonStr), &resp); err != nil {
		return nil, err
	}

	suggestions := make([]model.SuggestItem, len(resp.Suggestions))
	for i, s := range resp.Suggestions {
		suggestions[i] = model.SuggestItem{
			Content: s.Content,
			Reason:  s.Reason,
		}
	}

	return &model.SuggestResponse{
		Suggestions: suggestions,
		RawText:     text,
	}, nil
}

func stringPtr(s string) *string {
	return &s
}

// SaveSuggestRecord 保存润色记录
func (s *service) SaveSuggestRecord(ctx context.Context, userID string, req model.SuggestRequest, originalContent string) error {
	resumeID := req.ResumeID
	if resumeID == "" || resumeID == "local" {
		resumeID = ""
	}
	record := &aiStorage.SuggestRecordDB{
		ID:              uuid.New().String(),
		UserID:          userID,
		ResumeID:        &resumeID,
		ModuleType:      req.ModuleType,
		FieldKey:        req.FieldKey,
		OriginalContent: originalContent,
	}
	return s.suggestRecordRepo.Create(ctx, record)
}

// ListSuggestRecords 获取润色记录列表
func (s *service) ListSuggestRecords(ctx context.Context, userID, resumeID, moduleType, moduleInstanceID string, limit int) (*model.SuggestRecordListResponse, error) {
	var records []model.SuggestRecord
	var err error

	if moduleType != "" && moduleInstanceID != "" {
		records, err = s.suggestRecordRepo.ListByModule(ctx, userID, resumeID, moduleType, moduleInstanceID, limit)
	} else if resumeID != "" {
		records, err = s.suggestRecordRepo.ListByResume(ctx, userID, resumeID, limit)
	} else {
		records = []model.SuggestRecord{}
	}
	if err != nil {
		return nil, err
	}

	return &model.SuggestRecordListResponse{Items: records}, nil
}

// SaveSuggestRecordFull 保存完整的润色记录（原文 + 用户选中的建议内容）
func (s *service) SaveSuggestRecordFull(ctx context.Context, userID string, req model.SaveSuggestRecordRequest) error {
	resumeID := req.ResumeID
	if resumeID == "" || resumeID == "local" {
		resumeID = ""
	}
	convID := req.ConversationID
	if convID == "" {
		convID = ""
	}
	optContent := req.OptimizedContent
	record := &aiStorage.SuggestRecordDB{
		ID:               uuid.New().String(),
		UserID:           userID,
		ResumeID:         &resumeID,
		ConversationID:   &convID,
		ModuleType:       req.ModuleType,
		ModuleInstanceID: req.ModuleInstanceID,
		FieldKey:         req.FieldKey,
		OriginalContent:  req.OriginalContent,
		OptimizedContent: &optContent,
	}
	return s.suggestRecordRepo.Create(ctx, record)
}

// GetParserConfig 获取简历解析 AI 配置
func (s *service) GetParserConfig(ctx context.Context, userID string) (*model.ResumeParserConfig, error) {
	cfg, err := s.parserCfgRepo.GetByUserID(ctx, userID)
	if err != nil {
		if errors.Is(err, aiStorage.ErrParserConfigNotFound) {
			return nil, ErrAIConfigNotFound
		}
		return nil, err
	}

	return &model.ResumeParserConfig{
		ID:        cfg.ID,
		UserID:    &cfg.UserID,
		Provider:  model.AIProvider(cfg.Provider),
		BaseURL:   cfg.BaseURL,
		Model:     cfg.Model,
		HasAPIKey: cfg.APIKeyEncrypted != "",
		Enabled:   cfg.Enabled,
		CreatedAt: cfg.CreatedAt.UnixMilli(),
		UpdatedAt: cfg.UpdatedAt.UnixMilli(),
	}, nil
}

// ResolveParserConfig 获取并解密简历解析配置
func (s *service) ResolveParserConfig(ctx context.Context, userID string) (*aiStorage.ParserConfigRecord, error) {
	cfg, err := s.parserCfgRepo.GetByUserID(ctx, userID)
	if err != nil {
		if errors.Is(err, aiStorage.ErrParserConfigNotFound) {
			return nil, ErrAIConfigNotFound
		}
		return nil, err
	}
	// 解密 API Key
	decrypted, err := s.encryption.Decrypt(cfg.APIKeyEncrypted)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt api key: %w", err)
	}
	cfg.APIKeyEncrypted = decrypted
	return cfg, nil
}

// SaveParserConfig 保存简历解析 AI 配置
func (s *service) SaveParserConfig(ctx context.Context, userID string, req model.ResumeParserConfigRequest) error {
	// 查询已有配置
	var existingCfg *aiStorage.ParserConfigRecord
	if cfg, err := s.parserCfgRepo.GetByUserID(ctx, userID); err == nil && cfg != nil {
		existingCfg = cfg
	}

	// 确定 API Key：新 key 优先，否则复用旧 key，都没有才报错
	var encryptedKey string
	if strings.TrimSpace(req.APIKey) != "" {
		enc, err := s.encryption.Encrypt(req.APIKey)
		if err != nil {
			return fmt.Errorf("failed to encrypt API key: %w", err)
		}
		encryptedKey = enc
	} else if existingCfg != nil && existingCfg.APIKeyEncrypted != "" {
		encryptedKey = existingCfg.APIKeyEncrypted
	} else {
		return ErrAPIKeyRequired
	}

	existingID := uuid.New().String()
	if existingCfg != nil {
		existingID = existingCfg.ID
	}

	cfg := &aiStorage.ParserConfigRecord{
		ID:              existingID,
		UserID:          userID,
		Provider:        string(req.Provider),
		APIKeyEncrypted: encryptedKey,
		BaseURL:         req.BaseURL,
		Model:           req.Model,
		Enabled:         true,
	}

	return s.parserCfgRepo.Upsert(ctx, cfg)
}

// ============ AI 增强（抽取指标 / 补全风控 / 转STAR） ============

// Enhance 基于场景描述执行 AI 增强
func (s *service) Enhance(ctx context.Context, userID string, req model.EnhanceRequest) (*model.EnhanceResponse, error) {
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

	prompt := buildEnhancePrompt(req)

	// 脱敏
	maskedPrompt, san := s.maskPrompt(prompt)
	result, err := s.aiProvider.Complete(ctx, CompleteRequest{
		APIKey:    apiKey,
		BaseURL:   cfg.BaseURL,
		Model:     cfg.DefaultModel,
		Prompt:    maskedPrompt,
		TimeoutMs: cfg.TimeoutMs,
	})
	if err != nil {
		log.Printf("[ai] Enhance(%s) failed: %v", req.Operation, err)
		return nil, ErrAIRequestFailed
	}
	// 还原脱敏
	result.Text = s.unmaskResponse(san, result.Text)

	return &model.EnhanceResponse{Result: strings.TrimSpace(result.Text)}, nil
}

func buildEnhancePrompt(req model.EnhanceRequest) string {
	switch req.Operation {
	case model.EnhanceMetrics:
		return buildMetricsPrompt(req.Scenario)
	case model.EnhanceRisk:
		return buildRiskPrompt(req.Scenario)
	case model.EnhanceStar:
		return buildStarPrompt(req.Scenario)
	default:
		return ""
	}
}

func buildMetricsPrompt(scenario string) string {
	return fmt.Sprintf(`你是一位技术管理专家，擅长从项目描述中提取可量化的效率/质量指标。

请阅读以下场景描述，提取其中已明确量化或隐含可量化的指标，如果原文缺乏具体数据，请根据行业经验给出合理估算值，并注明"（估算）"。

【输出要求】
只输出 3-5 行，每行格式：指标名: 数值
每行不要有多余解释。直接输出结果文本，不要套 JSON、Markdown 或代码块。

场景描述：
%s`, scenario)
}

func buildRiskPrompt(scenario string) string {
	return fmt.Sprintf(`你是一位资深质量保障与风控专家，擅长从技术方案中识别潜在风险并给出对策。

请阅读以下场景描述，在不改变原有内容核心逻辑的前提下，**在其末尾补充 1-2 句关于风险识别与质量保障的内容**。侧重说明如何通过哪些手段（如自动化测试、code review、灰度发布、监控告警等）来降低风险、保障线上质量。

【输出要求】
使用 HTML 格式输出（即将被填充到富文本编辑器中），不要使用 Markdown。
- 输出完整的场景描述（含原文 + 补充内容）
- 关键动作和手段用 <strong>...</strong> 加粗
- 确保原文语义不变，补充内容自然衔接
不要输出任何额外说明，不要包裹在代码块中。

场景描述：
%s`, scenario)
}

func buildStarPrompt(scenario string) string {
	return fmt.Sprintf(`你是一位资深简历撰写顾问，擅长将项目描述重构为 STAR（Situation-Task-Action-Result）工作流格式。

请将以下场景描述改写为 STAR 结构，使内容更具说服力和面试可读性。

【STAR 结构要求】
- S (Situation)：一句话交代背景与面临的挑战
- T (Task)：明确你承担的任务目标
- A (Action)：你采取的具体行动与技术手段
- R (Result)：带来的具体结果，尽可能量化

【输出要求】
使用 HTML 格式输出（即将被填充到富文本编辑器中），不要使用 Markdown。
- 用 <strong>...</strong> 标注关键动词和量化数据
- 每个字母段用 <p><strong>S (Situation)</strong>：...</p> 的格式
- 段落之间自然换行
不要输出任何额外说明，不要包裹在代码块中。

场景描述：
%s`, scenario)
}

// ============ 简历分析 & 需求文档（分享页公开接口） ============

func (s *service) AnalyzeResume(ctx context.Context, resumeSummary string) (*model.AIAnalysisResponse, error) {
	cfg, err := s.cfgRepo.GetGlobalOrAny(ctx)
	if err != nil {
		return nil, ErrAIConfigNotFound
	}
	if !cfg.Enabled {
		return nil, fmt.Errorf("AI not enabled")
	}

	apiKey, err := s.encryption.Decrypt(cfg.APIKeyEncrypted)
	if err != nil {
		return nil, fmt.Errorf("decrypt api key: %w", err)
	}

	prompt := fmt.Sprintf(`你是一位资深简历分析顾问。请分析以下简历内容，给出客观专业的评价。

【输出格式】
严格按以下 JSON 格式输出，不要输出任何其他内容：
{
  "summary": "简历整体概览（2-3句）",
  "strengths": ["优势1", "优势2", "优势3"],
  "weaknesses": ["待改进1", "待改进2"],
  "suggestions": ["优化建议1", "优化建议2", "优化建议3"]
}

简历内容：
%s`, resumeSummary)

	result, err := s.aiProvider.Complete(ctx, CompleteRequest{
		APIKey:    apiKey,
		BaseURL:   cfg.BaseURL,
		Model:     cfg.DefaultModel,
		Prompt:    prompt,
		TimeoutMs: cfg.TimeoutMs,
	})
	if err != nil {
		return nil, fmt.Errorf("ai request: %w", err)
	}

	var analysis model.AIAnalysisResponse
	if err := json.Unmarshal([]byte(result.Text), &analysis); err != nil {
		analysis = model.AIAnalysisResponse{
			Summary:     result.Text,
			Strengths:   []string{},
			Weaknesses:  []string{},
			Suggestions: []string{},
		}
	}

	return &analysis, nil
}

func (s *service) GenerateRequirementDoc(ctx context.Context, resumeSummary string) (string, error) {
	cfg, err := s.cfgRepo.GetGlobalOrAny(ctx)
	if err != nil {
		return "", ErrAIConfigNotFound
	}
	if !cfg.Enabled {
		return "", fmt.Errorf("AI not enabled")
	}

	apiKey, err := s.encryption.Decrypt(cfg.APIKeyEncrypted)
	if err != nil {
		return "", fmt.Errorf("decrypt api key: %w", err)
	}

	prompt := fmt.Sprintf(`你是一位资深技术招聘专家。请根据以下候选人简历，生成一份《岗位需求与候选人匹配分析文档》，帮助面试官快速了解：

1. 候选人核心竞争力
2. 与典型岗位（如高级后端工程师/全栈工程师）的匹配度
3. 面试中应重点考察的技术点和项目经验
4. 建议的面试问题和考察方案

用清晰的结构化文本输出（HTML格式，不要Markdown），包含以下章节：
- 候选人画像
- 核心优势
- 适配岗位分析
- 面试考察重点
- 建议面试题（3-5个）

简历内容：
%s`, resumeSummary)

	result, err := s.aiProvider.Complete(ctx, CompleteRequest{
		APIKey:    apiKey,
		BaseURL:   cfg.BaseURL,
		Model:     cfg.DefaultModel,
		Prompt:    prompt,
		TimeoutMs: cfg.TimeoutMs,
	})
	if err != nil {
		return "", fmt.Errorf("ai request: %w", err)
	}

	return result.Text, nil
}
