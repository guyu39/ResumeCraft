package handler

import (
	"errors"
	"log"
	"net/http"
	"strconv"

	"resumecraft-pdf-backend/internal/middleware"
	"resumecraft-pdf-backend/internal/model"
	"resumecraft-pdf-backend/internal/service/resume"
	"resumecraft-pdf-backend/pkg/response"

	"github.com/gin-gonic/gin"
)

// ListResumes 获取简历列表
// GET /api/resumes?page=1&pageSize=20&keyword=前端
func (h *Handler) ListResumes(c *gin.Context) {
	log.Printf("[resume] ListResumes called, resumeService is nil: %v", h.resumeService == nil)
	if h.resumeService == nil {
		response.JSONError(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "简历服务未启用")
		return
	}

	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录或登录已过期")
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	keyword := c.Query("keyword")

	log.Printf("[resume] ListResumes userID: %s, page: %d, pageSize: %d, keyword: %s", userID, page, pageSize, keyword)
	result, err := h.resumeService.List(c.Request.Context(), userID.(string), page, pageSize, keyword)
	if err != nil {
		log.Printf("[resume] ListResumes error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "获取简历列表失败")
		return
	}

	log.Printf("[resume] ListResumes success, count: %d", len(result.Items))
	response.JSONSuccess(c, result)
}

// CreateResume 创建简历
// POST /api/resumes
func (h *Handler) CreateResume(c *gin.Context) {
	log.Printf("[resume] CreateResume called, resumeService is nil: %v", h.resumeService == nil)
	if h.resumeService == nil {
		response.JSONError(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "简历服务未启用")
		return
	}

	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录或登录已过期")
		return
	}

	var req model.CreateResumeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("[resume] CreateResume parse error: %v", err)
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数格式错误")
		return
	}

	log.Printf("[resume] CreateResume userID: %s, title: %s", userID, req.Title)
	item, err := h.resumeService.Create(c.Request.Context(), userID.(string), req)
	if err != nil {
		if errors.Is(err, resume.ErrDuplicateTitle) {
			response.JSONError(c, http.StatusConflict, "DUPLICATE_TITLE", "简历名称已存在")
			return
		}
		log.Printf("[resume] CreateResume error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "创建简历失败")
		return
	}

	log.Printf("[resume] CreateResume success: %s", item.ID)
	response.JSONCreated(c, item)
}

// GetResume 获取简历详情
// GET /api/resumes/:id
func (h *Handler) GetResume(c *gin.Context) {
	log.Printf("[resume] GetResume called, resumeService is nil: %v", h.resumeService == nil)
	if h.resumeService == nil {
		response.JSONError(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "简历服务未启用")
		return
	}

	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录或登录已过期")
		return
	}

	resumeID := c.Param("id")
	if resumeID == "" {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "简历ID不能为空")
		return
	}

	log.Printf("[resume] GetResume userID: %s, resumeID: %s", userID, resumeID)
	detail, err := h.resumeService.GetByID(c.Request.Context(), userID.(string), resumeID)
	if err != nil {
		log.Printf("[resume] GetResume error: %v", err)
		if errors.Is(err, resume.ErrResumeNotFound) {
			response.JSONError(c, http.StatusNotFound, "RESUME_NOT_FOUND", "简历不存在或无权限访问")
			return
		}
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "获取简历详情失败")
		return
	}

	log.Printf("[resume] GetResume success: %s", detail.ID)
	response.JSONSuccess(c, detail)
}

// UpdateResume 更新简历
// PUT /api/resumes/:id
func (h *Handler) UpdateResume(c *gin.Context) {
	log.Printf("[resume] UpdateResume called, resumeService is nil: %v", h.resumeService == nil)
	if h.resumeService == nil {
		response.JSONError(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "简历服务未启用")
		return
	}

	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录或登录已过期")
		return
	}

	resumeID := c.Param("id")
	if resumeID == "" {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "简历ID不能为空")
		return
	}

	var req model.UpdateResumeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("[resume] UpdateResume parse error: %v", err)
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数格式错误")
		return
	}

	log.Printf("[resume] UpdateResume userID: %s, resumeID: %s", userID, resumeID)
	resp, err := h.resumeService.Update(c.Request.Context(), userID.(string), resumeID, req)
	if err != nil {
		log.Printf("[resume] UpdateResume error: %v", err)
		if errors.Is(err, resume.ErrResumeNotFound) {
			response.JSONError(c, http.StatusNotFound, "RESUME_NOT_FOUND", "简历不存在或无权限访问")
			return
		}
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "更新简历失败")
		return
	}

	log.Printf("[resume] UpdateResume success: %s", resp.ID)
	response.JSONSuccess(c, resp)
}

// DeleteResume 删除简历
// DELETE /api/resumes/:id
func (h *Handler) DeleteResume(c *gin.Context) {
	log.Printf("[resume] DeleteResume called, resumeService is nil: %v", h.resumeService == nil)
	if h.resumeService == nil {
		response.JSONError(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "简历服务未启用")
		return
	}

	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录或登录已过期")
		return
	}

	resumeID := c.Param("id")
	if resumeID == "" {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "简历ID不能为空")
		return
	}

	log.Printf("[resume] DeleteResume userID: %s, resumeID: %s", userID, resumeID)
	err := h.resumeService.Delete(c.Request.Context(), userID.(string), resumeID)
	if err != nil {
		log.Printf("[resume] DeleteResume error: %v", err)
		if errors.Is(err, resume.ErrResumeNotFound) {
			response.JSONError(c, http.StatusNotFound, "RESUME_NOT_FOUND", "简历不存在或无权限访问")
			return
		}
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "删除简历失败")
		return
	}

	log.Printf("[resume] DeleteResume success")
	response.JSONSuccess(c, gin.H{"deleted": true})
}