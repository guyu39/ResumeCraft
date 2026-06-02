package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"resumecraft-pdf-backend/internal/middleware"
	"resumecraft-pdf-backend/internal/model"
	ai "resumecraft-pdf-backend/internal/service/ai"
	"resumecraft-pdf-backend/pkg/response"

	"github.com/gin-gonic/gin"
)

// GetAIConfig 获取 AI 配置
// GET /api/ai/config
func (h *Handler) GetAIConfig(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	cfg, err := h.aiService.GetConfig(c.Request.Context(), userID.(string))
	if err != nil {
		if err == ai.ErrAIConfigNotFound {
			response.JSONError(c, http.StatusNotFound, "NOT_FOUND", "AI 配置不存在")
			return
		}
		log.Printf("[ai] GetConfig error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "获取 AI 配置失败")
		return
	}

	response.JSONSuccess(c, cfg)
}

// SaveAIConfig 保存 AI 配置
// POST /api/ai/config
func (h *Handler) SaveAIConfig(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	var req struct {
		Provider string `json:"provider" binding:"required"`
		Model    string `json:"model" binding:"required"`
		APIKey   string `json:"apiKey"`
		BaseURL  string `json:"baseUrl"`
		Enabled  *bool  `json:"enabled"`
		IsGlobal *bool  `json:"isGlobal"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数错误")
		return
	}

	// Derive BaseURL from provider if not provided
	baseURL := req.BaseURL
	if baseURL == "" {
		if defaultURL, ok := model.DefaultBaseURLs[model.AIProvider(req.Provider)]; ok {
			baseURL = defaultURL
		}
	}

	err := h.aiService.SaveConfig(c.Request.Context(), userID.(string), model.AIConfigRequest{
		Provider:     model.AIProvider(req.Provider),
		APIKey:       req.APIKey,
		BaseURL:      baseURL,
		DefaultModel: req.Model,
		Enabled:      req.Enabled,
		IsGlobal:     req.IsGlobal,
	})
	if err != nil {
		if err == ai.ErrAPIKeyRequired {
			response.JSONError(c, http.StatusBadRequest, "API_KEY_REQUIRED", "首次配置必须提供 API Key")
			return
		}
		log.Printf("[ai] SaveConfig error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "保存 AI 配置失败")
		return
	}

	response.JSONSuccess(c, gin.H{"saved": true})
}

// ListAIConversations 获取 AI 对话列表
// GET /api/ai/conversations?type=evaluate&page=1&pageSize=20
func (h *Handler) ListAIConversations(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	page := 1
	pageSize := 5
	if p := c.Query("page"); p != "" {
		if _, err := fmt.Sscanf(p, "%d", &page); err != nil {
			page = 1
		}
	}
	if ps := c.Query("pageSize"); ps != "" {
		if _, err := fmt.Sscanf(ps, "%d", &pageSize); err != nil {
			pageSize = 20
		}
	}
	conversationType := c.Query("type")
	resumeID := c.Query("resumeId")

	result, err := h.aiService.ListConversations(c.Request.Context(), userID.(string), conversationType, resumeID, page, pageSize)
	if err != nil {
		log.Printf("[ai] ListConversations error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "获取对话列表失败")
		return
	}

	response.JSONSuccess(c, result)
}

// GetAIConversation 获取对话详情
// GET /api/ai/conversations/:id
func (h *Handler) GetAIConversation(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	conversationID := c.Param("id")
	if conversationID == "" {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "对话 ID 不能为空")
		return
	}

	conv, err := h.aiService.GetConversation(c.Request.Context(), userID.(string), conversationID)
	if err != nil {
		if err == ai.ErrConversationNotFound {
			response.JSONError(c, http.StatusNotFound, "NOT_FOUND", "对话不存在")
			return
		}
		log.Printf("[ai] GetConversation error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "获取对话失败")
		return
	}

	response.JSONSuccess(c, conv)
}

// DeleteAIConversation 删除对话
// DELETE /api/ai/conversations/:id
func (h *Handler) DeleteAIConversation(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	conversationID := c.Param("id")
	if conversationID == "" {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "对话 ID 不能为空")
		return
	}

	err := h.aiService.DeleteConversation(c.Request.Context(), userID.(string), conversationID)
	if err != nil {
		if err == ai.ErrConversationNotFound {
			response.JSONError(c, http.StatusNotFound, "NOT_FOUND", "对话不存在")
			return
		}
		log.Printf("[ai] DeleteConversation error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "删除对话失败")
		return
	}

	response.JSONSuccess(c, gin.H{"deleted": true})
}

// EvaluateResumeStream 流式评估简历
// POST /api/ai/evaluate/stream
func (h *Handler) EvaluateResumeStream(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	var req model.EvaluateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数错误")
		return
	}

	// 设置 SSE headers
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("X-Accel-Buffering", "no")

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming not supported"})
		return
	}

	result, err := h.aiService.StreamEvaluate(c.Request.Context(), userID.(string), req, func(evt ai.StreamEvent) {
		if evt.Type == "" {
			return
		}
		// 所有事件都包含 type 字段，供前端路由判断
		data, _ := json.Marshal(evt)
		c.Writer.Write([]byte("data: " + string(data) + "\n\n"))
		flusher.Flush()
	})
	if err != nil {
		if err == ai.ErrAIConfigNotFound {
			c.Writer.Write([]byte("event: error\ndata: 请先配置 AI 服务\n\n"))
		} else {
			log.Printf("[ai] EvaluateStream error: %v", err)
			c.Writer.Write([]byte("event: error\ndata: 评估失败\n\n"))
		}
		flusher.Flush()
		return
	}

	// 流结束，发送最终结构化结果
	resultJSON, _ := json.Marshal(result)
	c.Writer.Write([]byte("event: done\ndata: " + string(resultJSON) + "\n\n"))
	flusher.Flush()
}

// JDMatchStream 流式分析简历与 JD 的匹配度
// POST /api/ai/jd-match/stream
func (h *Handler) JDMatchStream(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	var req model.JDMatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数错误")
		return
	}
	if len(req.JDText) > 30000 {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "JD 内容不能超过 30000 字符")
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("X-Accel-Buffering", "no")

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming not supported"})
		return
	}

	result, err := h.aiService.StreamJDMatch(c.Request.Context(), userID.(string), req, func(evt ai.StreamEvent) {
		if evt.Type == "" {
			return
		}
		data, _ := json.Marshal(evt)
		c.Writer.Write([]byte("data: " + string(data) + "\n\n"))
		flusher.Flush()
	})
	if err != nil {
		if err == ai.ErrAIConfigNotFound {
			c.Writer.Write([]byte("event: error\ndata: 请先配置 AI 服务\n\n"))
		} else {
			log.Printf("[ai] JDMatchStream error: %v", err)
			c.Writer.Write([]byte("event: error\ndata: JD 匹配分析失败\n\n"))
		}
		flusher.Flush()
		return
	}

	resultJSON, _ := json.Marshal(result)
	c.Writer.Write([]byte("event: done\ndata: " + string(resultJSON) + "\n\n"))
	flusher.Flush()
}

// ScoreResumeForJD 基于 JD 对简历做深度评分
// POST /api/ai/score
func (h *Handler) ScoreResumeForJD(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	var req model.JDScoreRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数错误")
		return
	}
	if len(req.JDText) > 30000 {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "JD 内容不能超过 30000 字符")
		return
	}

	result, err := h.aiService.ScoreResumeForJD(c.Request.Context(), userID.(string), req)
	if err != nil {
		if err == ai.ErrAIConfigNotFound {
			response.JSONError(c, http.StatusNotFound, "NOT_FOUND", "请先配置 AI 服务")
			return
		}
		log.Printf("[ai] ScoreResumeForJD error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "JD 深度评分失败")
		return
	}

	response.JSONSuccess(c, result)
}

// RewriteBullet 重写 Bullet Point
// POST /api/ai/rewrite/bullet
func (h *Handler) RewriteBullet(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	var req model.BulletRewriteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数错误")
		return
	}
	if len(req.JDText) > 30000 {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "JD 内容不能超过 30000 字符")
		return
	}

	result, err := h.aiService.RewriteBullet(c.Request.Context(), userID.(string), req)
	if err != nil {
		if err == ai.ErrAIConfigNotFound {
			response.JSONError(c, http.StatusNotFound, "NOT_FOUND", "请先配置 AI 服务")
			return
		}
		log.Printf("[ai] RewriteBullet error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Bullet 重写失败")
		return
	}

	response.JSONSuccess(c, result)
}

// GenerateCoverLetter 生成求职信
// POST /api/ai/cover-letter
func (h *Handler) GenerateCoverLetter(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	var req model.CoverLetterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数错误")
		return
	}
	if len(req.JDText) > 30000 {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "JD 内容不能超过 30000 字符")
		return
	}

	result, err := h.aiService.GenerateCoverLetter(c.Request.Context(), userID.(string), req)
	if err != nil {
		if err == ai.ErrAIConfigNotFound {
			response.JSONError(c, http.StatusNotFound, "NOT_FOUND", "请先配置 AI 服务")
			return
		}
		log.Printf("[ai] GenerateCoverLetter error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "生成求职信失败")
		return
	}

	response.JSONSuccess(c, result)
}

// SuggestContent 内容润色建议
// POST /api/ai/suggest
func (h *Handler) SuggestContent(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	var req struct {
		ResumeID         string `json:"resumeId" binding:"required"`
		ModuleType       string `json:"moduleType" binding:"required"`
		ModuleInstanceID string `json:"moduleInstanceId" binding:"required"`
		FieldKey         string `json:"fieldKey" binding:"required"`
		Content          string `json:"content" binding:"required"`
		ContentHash      string `json:"contentHash"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数错误")
		return
	}

	result, err := h.aiService.Suggest(c.Request.Context(), userID.(string), model.SuggestRequest{
		ResumeID:         req.ResumeID,
		ModuleType:       req.ModuleType,
		ModuleInstanceID: req.ModuleInstanceID,
		FieldKey:         req.FieldKey,
		Content:          req.Content,
		ContentHash:      req.ContentHash,
	})
	if err != nil {
		if err == ai.ErrAIConfigNotFound {
			response.JSONError(c, http.StatusBadRequest, "CONFIG_NOT_FOUND", "请先配置 AI 服务")
			return
		}
		log.Printf("[ai] Suggest error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "获取建议失败")
		return
	}

	response.JSONSuccess(c, result)
}

// ListSuggestRecords 获取润色记录列表
// GET /api/ai/suggest-records?resumeId=xxx&moduleType=xxx&fieldKey=xxx&limit=5
func (h *Handler) ListSuggestRecords(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	resumeID := c.Query("resumeId")
	moduleType := c.Query("moduleType")
	moduleInstanceID := c.Query("moduleInstanceId")
	limit := 5
	if l := c.Query("limit"); l != "" {
		if _, err := fmt.Sscanf(l, "%d", &limit); err != nil {
			limit = 5
		}
	}

	result, err := h.aiService.ListSuggestRecords(c.Request.Context(), userID.(string), resumeID, moduleType, moduleInstanceID, limit)
	if err != nil {
		log.Printf("[ai] ListSuggestRecords error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "获取润色记录失败")
		return
	}

	response.JSONSuccess(c, result)
}

// SaveSuggestRecord 保存润色记录（用户采纳建议时）
// POST /api/ai/suggest-records
func (h *Handler) SaveSuggestRecord(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	var req struct {
		ResumeID         string              `json:"resumeId" binding:"required"`
		ConversationID   string              `json:"conversationId" binding:"required"`
		ModuleType       string              `json:"moduleType" binding:"required"`
		ModuleInstanceID string              `json:"moduleInstanceId" binding:"required"`
		FieldKey         string              `json:"fieldKey" binding:"required"`
		OriginalContent  string              `json:"originalContent" binding:"required"`
		OptimizedContent string              `json:"optimizedContent" binding:"required"`
		Suggestions      []model.SuggestItem `json:"suggestions"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数错误")
		return
	}

	err := h.aiService.SaveSuggestRecordFull(c.Request.Context(), userID.(string), model.SaveSuggestRecordRequest{
		ResumeID:         req.ResumeID,
		ConversationID:   req.ConversationID,
		ModuleType:       req.ModuleType,
		ModuleInstanceID: req.ModuleInstanceID,
		FieldKey:         req.FieldKey,
		OriginalContent:  req.OriginalContent,
		OptimizedContent: req.OptimizedContent,
		Suggestions:      req.Suggestions,
	})
	if err != nil {
		log.Printf("[ai] SaveSuggestRecord error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "保存润色记录失败")
		return
	}

	response.JSONSuccess(c, gin.H{"saved": true})
}

// GetResumeParserConfig 获取简历解析 AI 配置
// GET /api/ai/parser-config
func (h *Handler) GetResumeParserConfig(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	cfg, err := h.aiService.GetParserConfig(c.Request.Context(), userID.(string))
	if err != nil {
		if err == ai.ErrAIConfigNotFound {
			response.JSONError(c, http.StatusNotFound, "NOT_FOUND", "简历解析配置不存在")
			return
		}
		log.Printf("[ai] GetParserConfig error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "获取解析配置失败")
		return
	}

	response.JSONSuccess(c, cfg)
}

// SaveResumeParserConfig 保存简历解析 AI 配置
// POST /api/ai/parser-config
func (h *Handler) SaveResumeParserConfig(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	var req struct {
		Provider string `json:"provider" binding:"required"`
		Model    string `json:"model" binding:"required"`
		APIKey   string `json:"apiKey"`
		BaseURL  string `json:"baseUrl"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数错误")
		return
	}

	baseURL := req.BaseURL
	if baseURL == "" {
		if defaultURL, ok := model.DefaultBaseURLs[model.AIProvider(req.Provider)]; ok {
			baseURL = defaultURL
		}
	}

	err := h.aiService.SaveParserConfig(c.Request.Context(), userID.(string), model.ResumeParserConfigRequest{
		Provider: model.AIProvider(req.Provider),
		APIKey:   req.APIKey,
		BaseURL:  baseURL,
		Model:    req.Model,
	})
	if err != nil {
		if err == ai.ErrAPIKeyRequired {
			response.JSONError(c, http.StatusBadRequest, "API_KEY_REQUIRED", "首次配置必须提供 API Key")
			return
		}
		log.Printf("[ai] SaveParserConfig error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "保存解析配置失败")
		return
	}

	response.JSONSuccess(c, gin.H{"saved": true})
}

// TranslateResume 翻译简历
// POST /api/ai/translate
func (h *Handler) TranslateResume(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	var req model.TranslateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数错误")
		return
	}

	// handler 层获取源简历，将内容传入 service
	resumeDetail, err := h.resumeService.GetByID(c.Request.Context(), userID.(string), req.ResumeID)
	if err != nil {
		response.JSONError(c, http.StatusNotFound, "NOT_FOUND", "源简历不存在")
		return
	}

	// 构建翻译请求的简历内容
	content := map[string]interface{}{
		"title":         resumeDetail.Title,
		"locale":        resumeDetail.Locale,
		"modules":       resumeDetail.Modules,
		"styleSettings": resumeDetail.StyleSettings,
	}

	// 默认 fontFallback = true
	if !req.Options.FontFallback {
		req.Options.FontFallback = true
	}

	result, err := h.aiService.Translate(c.Request.Context(), userID.(string), req, content)
	if err != nil {
		if err == ai.ErrAIConfigNotFound {
			response.JSONError(c, http.StatusNotFound, "NOT_FOUND", "请先配置 AI 服务")
			return
		}
		log.Printf("[ai] TranslateResume error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "翻译失败")
		return
	}

	response.JSONSuccess(c, result)
}

// EnhanceContent AI 增强场景描述（抽取指标 / 补全风控 / 转STAR）
// POST /api/ai/enhance
func (h *Handler) EnhanceContent(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	var req model.EnhanceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数错误")
		return
	}

	result, err := h.aiService.Enhance(c.Request.Context(), userID.(string), req)
	if err != nil {
		if err == ai.ErrAIConfigNotFound {
			response.JSONError(c, http.StatusNotFound, "NOT_FOUND", "请先配置 AI 服务")
			return
		}
		log.Printf("[ai] EnhanceContent(%s) error: %v", req.Operation, err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "AI 增强失败")
		return
	}

	response.JSONSuccess(c, result)
}
