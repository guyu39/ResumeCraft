package handler

import (
	"log"
	"net/http"
	"strconv"
	"strings"

	"resumecraft-pdf-backend/internal/middleware"
	"resumecraft-pdf-backend/internal/model"
	"resumecraft-pdf-backend/pkg/response"

	"github.com/gin-gonic/gin"
)

// ListJobPostings GET /api/job-postings （公开）
func (h *Handler) ListJobPostings(c *gin.Context) {
	filters := model.JobPostingFilters{
		Industry:        c.Query("industry"),
		RecruitmentType: c.Query("type"),
		Keyword:         c.Query("keyword"),
		Sort:            c.Query("sort"),
	}
	filters.Applied = c.Query("applied")
	if userID, ok := getOptionalUserID(c); ok {
		filters.UserID = userID
	}
	if p, err := strconv.Atoi(c.Query("page")); err == nil {
		filters.Page = p
	}
	if ps, err := strconv.Atoi(c.Query("pageSize")); err == nil {
		filters.PageSize = ps
	}

	result, err := h.jobPostingService.ListJobPostings(c.Request.Context(), filters)
	if err != nil {
		log.Printf("[job_posting] ListJobPostings error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "招聘数据加载失败")
		return
	}
	response.JSONSuccess(c, result)
}

// SetJobPostingMark PUT /api/job-postings/:id/mark （需登录）
// 标记 / 取消标记「已投递」，仅作用于当前登录用户，不影响其他人看到的数据。
func (h *Handler) SetJobPostingMark(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	var req model.SetJobPostingMarkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数格式错误")
		return
	}
	if err := h.jobPostingService.SetMark(c.Request.Context(), userID, c.Param("id"), req.Applied); err != nil {
		log.Printf("[job_posting] SetJobPostingMark error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "标记失败")
		return
	}
	response.JSONSuccess(c, gin.H{"applied": req.Applied})
}

// getOptionalUserID 尝试读取已登录用户 ID；未登录（如公开访问招聘列表）时返回 ok=false，
// 不视为错误，调用方据此决定是否附带个性化标记。
func getOptionalUserID(c *gin.Context) (string, bool) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		return "", false
	}
	id, ok := userID.(string)
	if !ok || id == "" {
		return "", false
	}
	return id, true
}

// GetJobPostingFilters GET /api/job-postings/filters （公开）
func (h *Handler) GetJobPostingFilters(c *gin.Context) {
	filters, err := h.jobPostingService.GetFilters(c.Request.Context())
	if err != nil {
		log.Printf("[job_posting] GetJobPostingFilters error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "筛选条件加载失败")
		return
	}
	response.JSONSuccess(c, filters)
}

// SyncJobPostings POST /api/job-postings/sync （需登录）
// 手动触发一次从腾讯文档的同步。
// 说明：当前认证体系无角色概念，故以「已登录」作为触发门槛（足够个人工具使用）；
// 若后续引入管理员角色，可在此追加角色校验。
func (h *Handler) SyncJobPostings(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	_ = userID

	result, err := h.jobPostingService.SyncFromSmartsheet(c.Request.Context())
	if err != nil {
		log.Printf("[job_posting] SyncJobPostings error: %v", err)
		// 限流（同步过于频繁 / 同步进行中）属于预期行为，返回 429 而非 500
		if strings.Contains(err.Error(), "同步过于频繁") || strings.Contains(err.Error(), "同步任务正在进行中") {
			response.JSONError(c, http.StatusTooManyRequests, "SYNC_RATE_LIMITED", "同步失败："+err.Error())
			return
		}
		response.JSONError(c, http.StatusInternalServerError, "SYNC_FAILED", "同步失败："+err.Error())
		return
	}
	response.JSONSuccess(c, result)
}
