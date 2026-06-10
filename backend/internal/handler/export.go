package handler

import (
	"errors"
	"net/http"
	"time"

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
		if errors.Is(err, export.ErrUnsupportedFormat) {
			response.JSONError(c, http.StatusBadRequest, "UNSUPPORTED_FORMAT", "不支持的导出格式")
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

// DownloadExport 下载导出文件
// GET /api/exports/:taskId/download
func (h *Handler) DownloadExport(c *gin.Context) {
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
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "获取任务失败")
		return
	}

	if task.Status != model.ExportStatusSuccess {
		response.JSONError(c, http.StatusBadRequest, "TASK_NOT_COMPLETED", "导出尚未完成")
		return
	}

	fullTask, err := h.exportService.GetRepo().GetByID(c.Request.Context(), taskID)
	if err != nil {
		response.JSONError(c, http.StatusNotFound, "EXPORT_TASK_NOT_FOUND", "导出任务不存在")
		return
	}

	// 如果有 FileData（noop 降级），直接返回
	if len(fullTask.FileData) > 0 {
		c.Data(http.StatusOK, formatContentType(fullTask.Format), fullTask.FileData)
		return
	}

	// 如果有 FileURL（对象存储），生成预签名 URL 并重定向
	if fullTask.FileURL != "" {
		if h.objectStorage != nil {
			presignedURL, err := h.objectStorage.PresignedGetURL(c.Request.Context(), fullTask.FileKey, 15*time.Minute)
			if err == nil {
				c.Redirect(http.StatusFound, presignedURL)
				return
			}
		}
		// 降级：直接重定向到对象存储 URL
		c.Redirect(http.StatusFound, fullTask.FileURL)
		return
	}

	response.JSONError(c, http.StatusNotFound, "FILE_NOT_FOUND", "导出文件不存在")
}

func formatContentType(format string) string {
	switch format {
	case "pdf":
		return "application/pdf"
	case "markdown":
		return "text/markdown; charset=utf-8"
	case "json":
		return "application/json; charset=utf-8"
	case "resume":
		return "application/json; charset=utf-8"
	default:
		return "application/octet-stream"
	}
}
