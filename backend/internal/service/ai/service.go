package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"resumecraft-pdf-backend/internal/config"
	"resumecraft-pdf-backend/internal/model"
	aiStorage "resumecraft-pdf-backend/internal/storage/ai"

	"github.com/google/uuid"
)

var (
	ErrConversationNotFound = errors.New("conversation not found")
	ErrAIConfigNotFound     = errors.New("ai config not found")
	ErrAIRequestFailed      = errors.New("ai request failed")
)

type Service interface {
	// 配置管理
	GetConfig(ctx context.Context, userID string) (*model.AIConfig, error)
	SaveConfig(ctx context.Context, userID string, req model.AIConfigRequest) error

	// 对话管理
	ListConversations(ctx context.Context, userID string, conversationType string, page, pageSize int) (*model.ConversationListResponse, error)
	GetConversation(ctx context.Context, userID, conversationID string) (*model.AIConversation, error)
	DeleteConversation(ctx context.Context, userID, conversationID string) error

	// AI 操作
	EvaluateStream(ctx context.Context, userID string, req model.EvaluateRequest, onChunk func(chunk string)) (*model.EvaluateResponse, error)
	StreamEvaluate(ctx context.Context, userID string, req model.EvaluateRequest, onEvent func(StreamEvent)) (*model.EvaluateResponse, error)
	Suggest(ctx context.Context, userID string, req model.SuggestRequest) (*model.SuggestResponse, error)

	// 对话消息
	AddMessage(ctx context.Context, conversationID, role, content string) (*model.AIMessage, error)

	// 润色记录
	ListSuggestRecords(ctx context.Context, userID, resumeID, moduleType, moduleInstanceID string, limit int) (*model.SuggestRecordListResponse, error)
	SaveSuggestRecordFull(ctx context.Context, userID string, req model.SaveSuggestRecordRequest) error
}

type service struct {
	repo              aiStorage.Repository
	cfgRepo           aiStorage.ConfigRepository
	suggestRecordRepo aiStorage.SuggestRecordRepository
	aiProvider        AIProvider
	encryption        *Encryption
}

func NewService(repo aiStorage.Repository, cfgRepo aiStorage.ConfigRepository, suggestRecordRepo aiStorage.SuggestRecordRepository, aiCfg config.AIConfig) Service {
	return &service{
		repo:              repo,
		cfgRepo:           cfgRepo,
		suggestRecordRepo: suggestRecordRepo,
		aiProvider:        newAIProvider(aiCfg),
		encryption:        NewEncryption(aiCfg.EncryptionKey),
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
		Enabled:      cfg.Enabled,
		IsGlobal:     cfg.IsGlobal,
		CreatedAt:    cfg.CreatedAt.UnixMilli(),
		UpdatedAt:    cfg.UpdatedAt.UnixMilli(),
		// 不返回解密后的 API Key，通过单独接口获取
	}, nil
}

// SaveConfig 保存用户 AI 配置
func (s *service) SaveConfig(ctx context.Context, userID string, req model.AIConfigRequest) error {
	// 加密 API Key
	encryptedKey, err := s.encryption.Encrypt(req.APIKey)
	if err != nil {
		return fmt.Errorf("failed to encrypt API key: %w", err)
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	isGlobal := false
	if req.IsGlobal != nil {
		isGlobal = *req.IsGlobal
	}

	// 先查询已有配置的 ID（用于 upsert）
	existingID := uuid.New().String()
	if existingCfg, err := s.cfgRepo.GetByUserID(ctx, userID); err == nil && existingCfg != nil {
		existingID = existingCfg.ID
	}

	cfg := &aiStorage.AIConfigRecord{
		ID:              existingID,
		UserID:          userID,
		Provider:        string(req.Provider),
		APIKeyEncrypted: encryptedKey,
		BaseURL:         req.BaseURL,
		DefaultModel:    req.DefaultModel,
		TimeoutMs:       900000, // Default timeout 2min
		Enabled:         enabled,
		IsGlobal:        isGlobal,
	}

	return s.cfgRepo.Upsert(ctx, cfg)
}

// ListConversations 获取对话列表
func (s *service) ListConversations(ctx context.Context, userID string, conversationType string, page, pageSize int) (*model.ConversationListResponse, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	items, total, err := s.repo.List(ctx, userID, conversationType, page, pageSize)
	if err != nil {
		return nil, err
	}

	totalPages := total / pageSize
	if total%pageSize > 0 {
		totalPages++
	}

	return &model.ConversationListResponse{
		Items: items,
		Pagination: model.Pagination{
			Page:       page,
			PageSize:   pageSize,
			Total:      total,
			TotalPages: totalPages,
		},
	}, nil
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
	return s.repo.Delete(ctx, userID, conversationID)
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
		Prompt:    prompt,
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
	fullText := accumulated.String()
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
		ID:       convID,
		UserID:   userID,
		ResumeID: &req.ResumeID,
		Type:     string(model.ConversationTypeEvaluate),
		Title:    stringPtr("简历评估"),
		Context:  contextJSON,
	}
	if err := s.repo.Create(ctx, conversation); err != nil {
		log.Printf("[ai] Failed to create conversation: %v", err)
	}

	// 保存用户消息
	s.repo.AddMessage(ctx, &aiStorage.MessageRecord{
		ID:             uuid.New().String(),
		ConversationID: convID,
		Role:           "user",
		Content:        prompt,
		Model:          &evaluateModel,
	})

	evalResp.ConversationID = convID

	// 保存 AI 响应
	s.repo.AddMessage(ctx, &aiStorage.MessageRecord{
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
		accumulated.WriteString(line + "\n")

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
		Prompt:    prompt,
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

	fullText := accumulated.String()

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
		ID:       convID,
		UserID:   userID,
		ResumeID: &req.ResumeID,
		Type:     string(model.ConversationTypeEvaluate),
		Title:    stringPtr("简历评估"),
		Context:  contextJSON,
	}
	if err := s.repo.Create(ctx, conversation); err != nil {
		log.Printf("[ai] Failed to create conversation: %v", err)
	}

	s.repo.AddMessage(ctx, &aiStorage.MessageRecord{
		ID:             uuid.New().String(),
		ConversationID: convID,
		Role:           "user",
		Content:        prompt,
		Model:          &evaluateModel,
	})
	evalResp.ConversationID = convID

	s.repo.AddMessage(ctx, &aiStorage.MessageRecord{
		ID:             uuid.New().String(),
		ConversationID: convID,
		Role:           "assistant",
		Content:        fullText,
		Model:          &evaluateModel,
	})

	return evalResp, nil
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
	Type         string                    `json:"type"` // "model" | "summary" | "overall_score" | "dimension_score" | "issue_item" | "action_item" | "finish"
	Model        string                    `json:"model,omitempty"`
	Summary      string                    `json:"summary,omitempty"`
	OverallScore *int                      `json:"overallScore,omitempty"`
	Level        string                    `json:"level,omitempty"`
	Dimensions   []model.EvaluateDimension `json:"dimensions,omitempty"`
	Issues       []model.EvaluateIssue     `json:"issues,omitempty"`
	ActionItems  []string                  `json:"actionItems,omitempty"`
	RawText      string                    `json:"rawText,omitempty"` // 用于 debug 的原始行文本
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

	// 调用 AI
	result, err := s.aiProvider.Complete(ctx, CompleteRequest{
		APIKey:    apiKey,
		BaseURL:   cfg.BaseURL,
		Model:     cfg.DefaultModel,
		Prompt:    prompt,
		TimeoutMs: cfg.TimeoutMs,
	})
	if err != nil {
		log.Printf("[ai] Suggest failed: %v", err)
		return nil, ErrAIRequestFailed
	}

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
		"moduleType":        req.ModuleType,
		"moduleInstanceId": req.ModuleInstanceID,
		"fieldKey":          req.FieldKey,
		"contentHash":      req.ContentHash,
		"suggestions":       suggestResp.Suggestions,
	}
	contextJSON, _ := json.Marshal(contextData)
	conversation := &aiStorage.ConversationRecord{
		ID:                convID,
		UserID:            userID,
		ResumeID:          &req.ResumeID,
		Type:              string(model.ConversationTypeSuggest),
		Title:             stringPtr(fmt.Sprintf("润色 - %s", req.ModuleType)),
		Context:           contextJSON,
		ModuleType:        req.ModuleType,
		ModuleInstanceID:  req.ModuleInstanceID,
	}
	if err := s.repo.Create(ctx, conversation); err != nil {
		log.Printf("[ai] Failed to create conversation: %v", err)
	}

	// 保存用户消息
	s.repo.AddMessage(ctx, &aiStorage.MessageRecord{
		ID:             uuid.New().String(),
		ConversationID: convID,
		Role:           "user",
		Content:        prompt,
		Model:          &cfg.DefaultModel,
	})

	suggestResp.ConversationID = convID

	// 保存 AI 响应
	s.repo.AddMessage(ctx, &aiStorage.MessageRecord{
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

func buildEvaluatePrompt(content map[string]interface{}) string {
	var sb strings.Builder
	sb.WriteString("你是资深简历评估顾问，严格遵守以下所有规则，禁止任何违规输出，禁止对空内容/无有效信息的简历给出任何形式的高分。\n")
	sb.WriteString("【基础定义强制规则】\n")
	sb.WriteString("1. 有效内容定义：仅指能支撑求职画像的、非空的、有具体信息的内容，包括但不限于完整的个人求职信息、教育经历、工作经历、项目经历、技能成果等；空白字段、仅占位无实质信息的内容、无意义字符，均不属于有效内容。\n")
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
	data, _ := json.Marshal(content)
	sb.WriteString(string(data))
	return sb.String()
}

func buildSuggestPrompt(moduleType, fieldKey, content string) string {
	return fmt.Sprintf(`你是资深简历润色专家，严格遵循以下规则提供修改建议，禁止任何违规输出。

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
		OriginalContent:   req.OriginalContent,
		OptimizedContent: &optContent,
	}
	return s.suggestRecordRepo.Create(ctx, record)
}
