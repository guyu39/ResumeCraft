package handler

import (
	"log"
	"net/http"
	"strconv"
	"strings"

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
