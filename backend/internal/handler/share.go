package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"resumecraft-pdf-backend/internal/middleware"
	"resumecraft-pdf-backend/internal/model"
	"resumecraft-pdf-backend/pkg/response"

	"github.com/gin-gonic/gin"
)

// ============ 分享链接（需认证） ============

// CreateShareLink 创建分享链接
// POST /api/resumes/:id/share
func (h *Handler) CreateShareLink(c *gin.Context) {
	userID, _ := c.Get(middleware.ContextUserIDKey)
	resumeID := c.Param("id")

	var req model.CreateShareRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数错误")
		return
	}
	req.ResumeID = resumeID

	share, err := h.resumeService.CreateShareLink(c.Request.Context(), userID.(string), req)
	if err != nil {
		log.Printf("[share] CreateShareLink error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "创建分享链接失败")
		return
	}

	origin := c.Request.Header.Get("Origin")
	if origin == "" {
		origin = "http://localhost:5173"
	}
	share.ShareURL = origin + "/share/" + share.Token

	response.JSONCreated(c, share)
}

// ListShareLinks 获取简历的分享链接列表
// GET /api/resumes/:id/shares
func (h *Handler) ListShareLinks(c *gin.Context) {
	userID, _ := c.Get(middleware.ContextUserIDKey)
	resumeID := c.Param("id")

	links, err := h.resumeService.ListShareLinks(c.Request.Context(), userID.(string), resumeID)
	if err != nil {
		log.Printf("[share] ListShareLinks error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "获取分享链接失败")
		return
	}

	origin := c.Request.Header.Get("Origin")
	if origin == "" {
		origin = "http://localhost:5173"
	}
	for i := range links {
		links[i].ShareURL = origin + "/share/" + links[i].Token
	}

	response.JSONSuccess(c, gin.H{"items": links})
}

// DeactivateShareLink 停用分享链接
// DELETE /api/resumes/:id/shares/:shareId
func (h *Handler) DeactivateShareLink(c *gin.Context) {
	userID, _ := c.Get(middleware.ContextUserIDKey)
	shareID := c.Param("shareId")

	if err := h.resumeService.DeactivateShareLink(c.Request.Context(), userID.(string), shareID); err != nil {
		log.Printf("[share] DeactivateShareLink error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "停用分享链接失败")
		return
	}

	response.JSONSuccess(c, gin.H{"deactivated": true})
}

// ============ 公开访问（无需认证） ============

// ViewSharedResume 查看分享的简历
// GET /api/share/:token
func (h *Handler) ViewSharedResume(c *gin.Context) {
	token := c.Param("token")

	view, err := h.resumeService.GetShareResumeView(c.Request.Context(), token)
	if err != nil {
		log.Printf("[share] ViewSharedResume error: %v", err)
		response.JSONError(c, http.StatusNotFound, "NOT_FOUND", "分享链接无效或已过期")
		return
	}

	response.JSONSuccess(c, view)
}

// AddComment 添加评论
// POST /api/share/:token/comments
func (h *Handler) AddComment(c *gin.Context) {
	token := c.Param("token")

	var req model.AddCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数错误")
		return
	}

	comment, err := h.resumeService.AddComment(c.Request.Context(), token, req.AuthorName, req.Content, req.ModuleID, req.ItemIndex)
	if err != nil {
		log.Printf("[share] AddComment error: %v", err)
		response.JSONError(c, http.StatusNotFound, "NOT_FOUND", "添加评论失败")
		return
	}

	response.JSONCreated(c, comment)
}

// ListComments 获取评论列表
// GET /api/share/:token/comments
func (h *Handler) ListComments(c *gin.Context) {
	token := c.Param("token")

	comments, err := h.resumeService.ListComments(c.Request.Context(), token)
	if err != nil {
		log.Printf("[share] ListComments error: %v", err)
		response.JSONSuccess(c, gin.H{"items": []model.ShareComment{}})
		return
	}

	response.JSONSuccess(c, gin.H{"items": comments})
}

// AnalyzeSharedResume AI 分析分享的简历
// POST /api/share/:token/analyze
func (h *Handler) AnalyzeSharedResume(c *gin.Context) {
	token := c.Param("token")

	view, err := h.resumeService.GetShareResumeView(c.Request.Context(), token)
	if err != nil {
		response.JSONError(c, http.StatusNotFound, "NOT_FOUND", "分享链接无效或已过期")
		return
	}

	if h.aiService == nil {
		response.JSONError(c, http.StatusServiceUnavailable, "AI_NOT_AVAILABLE", "AI 服务未启用")
		return
	}

	// Build a resume summary for AI analysis
	resumeSummary := buildResumeSummary(view)

	result, err := h.aiService.AnalyzeResume(c.Request.Context(), resumeSummary)
	if err != nil {
		log.Printf("[share] AnalyzeResume error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "AI 分析失败")
		return
	}

	response.JSONSuccess(c, result)
}

// GenerateRequirementDoc 生成需求文档
// POST /api/share/:token/requirement-doc
func (h *Handler) GenerateRequirementDoc(c *gin.Context) {
	token := c.Param("token")

	view, err := h.resumeService.GetShareResumeView(c.Request.Context(), token)
	if err != nil {
		response.JSONError(c, http.StatusNotFound, "NOT_FOUND", "分享链接无效或已过期")
		return
	}

	if h.aiService == nil {
		response.JSONError(c, http.StatusServiceUnavailable, "AI_NOT_AVAILABLE", "AI 服务未启用")
		return
	}

	resumeSummary := buildResumeSummary(view)

	doc, err := h.aiService.GenerateRequirementDoc(c.Request.Context(), resumeSummary)
	if err != nil {
		log.Printf("[share] GenerateRequirementDoc error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "需求文档生成失败")
		return
	}

	response.JSONSuccess(c, gin.H{"document": doc})
}

// ExportSharePDF 分享页 PDF 下载（公开，需先验证 token）
// POST /api/share/:token/pdf
func (h *Handler) ExportSharePDF(c *gin.Context) {
	token := c.Param("token")

	// 验证分享链接有效性
	_, err := h.resumeService.GetShareResumeView(c.Request.Context(), token)
	if err != nil {
		response.JSONError(c, http.StatusNotFound, "NOT_FOUND", "分享链接无效或已过期")
		return
	}

	var req model.ExportPDFRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "请求参数不合法")
		return
	}

	pdfBytes, err := h.pdfService.RenderHTML(req.HTML)
	if err != nil {
		log.Printf("[share] ExportSharePDF failed: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "EXPORT_FAILED", "PDF 生成失败")
		return
	}

	filename := h.pdfService.NormalizeFilename(req.Filename)
	c.Header("Content-Type", "application/pdf")
	c.Header("Content-Disposition", "attachment; filename=\""+filename+".pdf\"")
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}

func buildResumeSummary(view *model.ShareResumeView) string {
	var text string
	for _, mod := range view.Modules {
		if modType, ok := mod["type"].(string); ok {
			text += "[" + modType + "] "
		}
		if data, ok := mod["data"]; ok {
			if dataBytes, err := json.Marshal(data); err == nil {
				text += string(dataBytes) + "\n"
			}
		}
	}
	return text
}
