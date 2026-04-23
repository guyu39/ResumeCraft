package handler

import (
	"errors"
	"net/http"

	"resumecraft-pdf-backend/internal/middleware"
	"resumecraft-pdf-backend/internal/model"
	"resumecraft-pdf-backend/internal/service/export"
	"resumecraft-pdf-backend/pkg/response"

	"github.com/gin-gonic/gin"
)

// CreateExport 创建导出任务
// POST /api/resumes/:id/exports
func (h *Handler) CreateExport(c *gin.Context) {
	if h.exportService == nil {
		response.JSONError(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "导出服务未启用")
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

	var req model.CreateExportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数格式错误")
		return
	}

	task, err := h.exportService.CreateTask(c.Request.Context(), userID.(string), resumeID, req)
	if err != nil {
		if errors.Is(err, export.ErrTaskNotFound) {
			response.JSONError(c, http.StatusNotFound, "RESUME_NOT_FOUND", "简历不存在或无权限访问")
			return
		}
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "创建导出任务失败")
		return
	}

	response.JSONCreated(c, task)
}

// GetExportTask 查询导出任务状态
// GET /api/exports/:taskId
func (h *Handler) GetExportTask(c *gin.Context) {
	if h.exportService == nil {
		response.JSONError(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "导出服务未启用")
		return
	}

	taskID := c.Param("taskId")
	if taskID == "" {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "任务ID不能为空")
		return
	}

	task, err := h.exportService.GetTask(c.Request.Context(), taskID)
	if err != nil {
		if errors.Is(err, export.ErrTaskNotFound) {
			response.JSONError(c, http.StatusNotFound, "EXPORT_TASK_NOT_FOUND", "导出任务不存在")
			return
		}
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "获取任务状态失败")
		return
	}

	response.JSONSuccess(c, task)
}