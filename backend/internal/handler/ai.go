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
		APIKey   string `json:"apiKey" binding:"required"`
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

	var req struct {
		ResumeID string                 `json:"resumeId" binding:"required"`
		Content  map[string]interface{} `json:"content" binding:"required"`
	}
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

	result, err := h.aiService.StreamEvaluate(c.Request.Context(), userID.(string), model.EvaluateRequest{
		ResumeID: req.ResumeID,
		Content:  req.Content,
	}, func(evt ai.StreamEvent) {
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
		ResumeID         string   `json:"resumeId" binding:"required"`
		ConversationID  string   `json:"conversationId" binding:"required"`
		ModuleType      string   `json:"moduleType" binding:"required"`
		ModuleInstanceID string   `json:"moduleInstanceId" binding:"required"`
		FieldKey        string   `json:"fieldKey" binding:"required"`
		OriginalContent string   `json:"originalContent" binding:"required"`
		OptimizedContent string  `json:"optimizedContent" binding:"required"`
		Suggestions     []model.SuggestItem `json:"suggestions"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数错误")
		return
	}

	err := h.aiService.SaveSuggestRecordFull(c.Request.Context(), userID.(string), model.SaveSuggestRecordRequest{
		ResumeID:          req.ResumeID,
		ConversationID:    req.ConversationID,
		ModuleType:        req.ModuleType,
		ModuleInstanceID:  req.ModuleInstanceID,
		FieldKey:          req.FieldKey,
		OriginalContent:   req.OriginalContent,
		OptimizedContent:  req.OptimizedContent,
		Suggestions:       req.Suggestions,
	})
	if err != nil {
		log.Printf("[ai] SaveSuggestRecord error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "保存润色记录失败")
		return
	}

	response.JSONSuccess(c, gin.H{"saved": true})
}

// NOTE: 需要在 handler.go 中添加 aiService 字段和相关方法
