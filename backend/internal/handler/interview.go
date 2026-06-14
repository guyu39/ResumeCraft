package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"resumecraft-pdf-backend/internal/middleware"
	"resumecraft-pdf-backend/internal/model"
	ai "resumecraft-pdf-backend/internal/service/ai"
	"resumecraft-pdf-backend/pkg/response"

	"github.com/gin-gonic/gin"
)

// isLikelyBinary 判断字符串是否为二进制文件内容（如 docx/pdf 被当作文本上传）
// 规则：
//  1. 以已知二进制文件头开头（PK = ZIP/docx, %PDF, \x7fELF, MZ = exe）
//  2. 非法 UTF-8 序列
//  3. 不可打印字符（NUL/控制字符）占比 > 5%
func isLikelyBinary(s string) bool {
	if len(s) == 0 {
		return false
	}
	// 1. 文件头特征
	head := s
	if len(head) > 8 {
		head = head[:8]
	}
	if strings.HasPrefix(head, "PK\x03\x04") || strings.HasPrefix(head, "PK\x05\x06") ||
		strings.HasPrefix(head, "%PDF") || strings.HasPrefix(head, "\x7fELF") ||
		strings.HasPrefix(head, "MZ") || strings.HasPrefix(head, "\xd0\xcf\x11\xe0") {
		return true
	}
	// 2. 非法 UTF-8
	if !utf8.ValidString(s) {
		return true
	}
	// 3. 控制字符占比
	sample := s
	if len(sample) > 4096 {
		sample = sample[:4096]
	}
	ctrl := 0
	total := 0
	for _, r := range sample {
		total++
		if r == 0 || (r < 0x20 && r != '\t' && r != '\n' && r != '\r') || r == 0xFFFD {
			ctrl++
		}
	}
	if total > 0 && float64(ctrl)/float64(total) > 0.05 {
		return true
	}
	return false
}

func (h *Handler) GenerateInterviewQuestions(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	var req model.InterviewGenerateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数错误")
		return
	}
	if len(req.JDText) > 50000 {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "JD 内容不能超过 50000 字符")
		return
	}
	if isLikelyBinary(req.JDText) {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "JD 内容含非文本数据。请粘贴纯文本 JD，不要直接上传 .docx/.pdf 文件")
		return
	}
	if req.QuestionCount < 3 || req.QuestionCount > 30 {
		req.QuestionCount = 8
	}
	if req.InterviewRound == "" {
		req.InterviewRound = "technical_1"
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

	err := h.aiService.GenerateInterviewQuestions(c.Request.Context(), userID.(string), req, func(evt ai.StreamEvent) {
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
			log.Printf("[interview] GenerateInterviewQuestions error: %v", err)
			errData, _ := json.Marshal(map[string]string{"error": "生成面试题失败"})
			c.Writer.Write([]byte("data: " + string(errData) + "\n\n"))
		}
		flusher.Flush()
	}
}

func (h *Handler) EvaluateInterviewAnswers(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	var req model.InterviewEvaluateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数错误")
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

	err := h.aiService.EvaluateInterviewAnswers(c.Request.Context(), userID.(string), req, func(evt ai.StreamEvent) {
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
			log.Printf("[interview] EvaluateInterviewAnswers error: %v", err)
			errData, _ := json.Marshal(map[string]string{"error": "评估面试回答失败"})
			c.Writer.Write([]byte("data: " + string(errData) + "\n\n"))
		}
		flusher.Flush()
	}
}

func (h *Handler) AnalyzeTranscript(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	var req model.AnalyzeTranscriptRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数错误：请确认上传的是纯文本（.txt/.srt 等），暂不支持 .docx/.pdf 等富文本格式")
		return
	}
	if len(req.TranscriptText) == 0 {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "录音转写文本不能为空")
		return
	}
	if len(req.TranscriptText) > 50000 {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "录音转写文本不能超过 50000 字符")
		return
	}
	// 检测乱码/二进制：如果文本中不可打印字符占比过高，说明用户传了二进制文件
	if isLikelyBinary(req.TranscriptText) {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "检测到非文本内容（疑似二进制文件）。请将录音转写另存为纯文本（.txt）后再上传，或直接粘贴文字内容。")
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

	err := h.aiService.AnalyzeTranscript(c.Request.Context(), userID.(string), req, func(evt ai.StreamEvent) {
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
			log.Printf("[interview] AnalyzeTranscript error: %v", err)
			errData, _ := json.Marshal(map[string]string{"error": "分析录音文本失败"})
			c.Writer.Write([]byte("data: " + string(errData) + "\n\n"))
		}
		flusher.Flush()
	}
}

func (h *Handler) SaveInterviewProgress(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	sessionID := c.Param("id")
	if sessionID == "" {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "缺少 session id")
		return
	}

	var req model.SaveInterviewProgressRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数错误")
		return
	}

	if err := h.aiService.SaveInterviewProgress(c.Request.Context(), userID.(string), sessionID, req); err != nil {
		log.Printf("[interview] SaveInterviewProgress error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "保存进度失败")
		return
	}

	response.JSONSuccess(c, gin.H{"ok": true})
}

// ListInterviewSessions 面试历史列表
// GET /api/ai/interview/sessions?limit=20&offset=0
func (h *Handler) ListInterviewSessions(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	limit := 20
	offset := 0
	if v := c.Query("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			limit = n
		}
	}
	if v := c.Query("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			offset = n
		}
	}

	resp, err := h.aiService.ListInterviewSessions(c.Request.Context(), userID.(string), limit, offset)
	if err != nil {
		log.Printf("[interview] ListInterviewSessions error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "查询面试历史失败")
		return
	}

	response.JSONSuccess(c, resp)
}

// GetInterviewSession 面试历史详情
// GET /api/ai/interview/sessions/:id
func (h *Handler) GetInterviewSession(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	sessionID := c.Param("id")
	if sessionID == "" {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "缺少 sessionID")
		return
	}

	session, err := h.aiService.GetInterviewSession(c.Request.Context(), userID.(string), sessionID)
	if err != nil {
		if err == ai.ErrInterviewSessionNotFound {
			response.JSONError(c, http.StatusNotFound, "NOT_FOUND", "面试会话不存在或无权访问")
			return
		}
		log.Printf("[interview] GetInterviewSession error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "查询面试详情失败")
		return
	}

	response.JSONSuccess(c, session)
}

// DeleteInterviewSession 删除面试历史
// DELETE /api/ai/interview/sessions/:id
func (h *Handler) DeleteInterviewSession(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	sessionID := c.Param("id")
	if sessionID == "" {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "缺少 sessionID")
		return
	}

	if err := h.aiService.DeleteInterviewSession(c.Request.Context(), userID.(string), sessionID); err != nil {
		if err == ai.ErrInterviewSessionNotFound {
			response.JSONError(c, http.StatusNotFound, "NOT_FOUND", "面试会话不存在或无权访问")
			return
		}
		log.Printf("[interview] DeleteInterviewSession error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "删除面试会话失败")
		return
	}

	response.JSONSuccess(c, gin.H{"ok": true})
}
