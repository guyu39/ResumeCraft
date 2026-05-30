package handler

import (
	"encoding/json"
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

// ListSnapshots 获取版本快照时间轴
// GET /api/resumes/:id/snapshots?limit=20&includeAuto=true
func (h *Handler) ListSnapshots(c *gin.Context) {
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

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	includeAuto := c.DefaultQuery("includeAuto", "true") == "true"

	result, err := h.resumeService.ListSnapshots(c.Request.Context(), resumeID, limit, includeAuto)
	if err != nil {
		log.Printf("[snapshot] ListSnapshots error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "获取快照列表失败")
		return
	}

	_ = userID // 后续可能需要校验 userID 有权访问该 resumeID
	response.JSONSuccess(c, result)
}

// CreateManualSnapshot 创建手动快照
// POST /api/resumes/:id/snapshots
func (h *Handler) CreateManualSnapshot(c *gin.Context) {
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

	var req model.CreateSnapshotRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数格式错误")
		return
	}

	snapshot, err := h.resumeService.CreateManualSnapshot(c.Request.Context(), userID.(string), resumeID, req.Label)
	if err != nil {
		log.Printf("[snapshot] CreateManualSnapshot error: %v", err)
		if errors.Is(err, resume.ErrResumeNotFound) {
			response.JSONError(c, http.StatusNotFound, "RESUME_NOT_FOUND", "简历不存在或无权限")
			return
		}
		if errors.Is(err, resume.ErrDuplicateLabel) {
			response.JSONError(c, http.StatusConflict, "DUPLICATE_LABEL", "同名快照已存在，请更换标签")
			return
		}
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "创建快照失败")
		return
	}

	response.JSONCreated(c, snapshot)
}

// UpdateSnapshotLabel 更新快照标签
// PUT /api/resumes/:id/snapshots/:snapshotId
func (h *Handler) UpdateSnapshotLabel(c *gin.Context) {
	if h.resumeService == nil {
		response.JSONError(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "简历服务未启用")
		return
	}

	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录或登录已过期")
		return
	}

	snapshotID := c.Param("snapshotId")
	if snapshotID == "" {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "快照ID不能为空")
		return
	}

	var req model.UpdateSnapshotRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数格式错误")
		return
	}

	if err := h.resumeService.UpdateSnapshotLabel(c.Request.Context(), snapshotID, userID.(string), req.Label); err != nil {
		log.Printf("[snapshot] UpdateSnapshotLabel error: %v", err)
		if errors.Is(err, resume.ErrResumeNotFound) {
			response.JSONError(c, http.StatusNotFound, "SNAPSHOT_NOT_FOUND", "快照不存在")
			return
		}
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "更新快照标签失败")
		return
	}

	response.JSONSuccess(c, gin.H{"updated": true})
}

// DeleteSnapshot 删除手动快照
// DELETE /api/resumes/:id/snapshots/:snapshotId
func (h *Handler) DeleteSnapshot(c *gin.Context) {
	if h.resumeService == nil {
		response.JSONError(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "简历服务未启用")
		return
	}

	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录或登录已过期")
		return
	}

	snapshotID := c.Param("snapshotId")
	if snapshotID == "" {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "快照ID不能为空")
		return
	}

	if err := h.resumeService.DeleteSnapshot(c.Request.Context(), snapshotID, userID.(string)); err != nil {
		log.Printf("[snapshot] DeleteSnapshot error: %v", err)
		if errors.Is(err, resume.ErrResumeNotFound) {
			response.JSONError(c, http.StatusNotFound, "SNAPSHOT_NOT_FOUND", "快照不存在")
			return
		}
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "删除快照失败")
		return
	}

	response.JSONSuccess(c, gin.H{"deleted": true})
}

// GetSnapshotDetail 获取快照详情内容
// GET /api/resumes/:id/snapshots/:snapshotId
func (h *Handler) GetSnapshotDetail(c *gin.Context) {
	if h.resumeService == nil {
		response.JSONError(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "简历服务未启用")
		return
	}

	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录或登录已过期")
		return
	}

	snapshotID := c.Param("snapshotId")
	if snapshotID == "" {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "快照ID不能为空")
		return
	}

	snapshot, content, err := h.resumeService.GetSnapshotDetail(c.Request.Context(), snapshotID, userID.(string))
	if err != nil {
		log.Printf("[snapshot] GetSnapshotDetail error: %v", err)
		if errors.Is(err, resume.ErrResumeNotFound) {
			response.JSONError(c, http.StatusNotFound, "SNAPSHOT_NOT_FOUND", "快照不存在")
			return
		}
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "获取快照内容失败")
		return
	}

	// 解析 content 为 ResumeDetail 格式
	var detail model.ResumeDetail
	if err := json.Unmarshal(content, &detail); err == nil {
		// 无法解析为完整的 ResumeDetail 时，返回原始快照信息 + content
	}

	response.JSONSuccess(c, gin.H{
		"snapshot": snapshot,
		"content":  json.RawMessage(content),
	})
}

// RestoreFromSnapshot 从快照恢复简历
// POST /api/resumes/:id/snapshots/:snapshotId/restore
func (h *Handler) RestoreFromSnapshot(c *gin.Context) {
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
	snapshotID := c.Param("snapshotId")

	if snapshotID == "" {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "快照ID不能为空")
		return
	}

	result, err := h.resumeService.RestoreVersion(c.Request.Context(), userID.(string), resumeID, snapshotID)
	if err != nil {
		log.Printf("[snapshot] RestoreFromSnapshot error: %v", err)
		if errors.Is(err, resume.ErrResumeNotFound) {
			response.JSONError(c, http.StatusNotFound, "SNAPSHOT_NOT_FOUND", "快照或简历不存在")
			return
		}
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "恢复快照失败")
		return
	}

	response.JSONSuccess(c, result)
}

// DiffSnapshots 对比两个快照
// POST /api/resumes/:id/snapshots/diff
func (h *Handler) DiffSnapshots(c *gin.Context) {
	if h.resumeService == nil {
		response.JSONError(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "简历服务未启用")
		return
	}

	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录或登录已过期")
		return
	}

	var req model.DiffSnapshotsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数格式错误")
		return
	}

	result, err := h.resumeService.DiffSnapshots(c.Request.Context(), userID.(string), req)
	if err != nil {
		log.Printf("[snapshot] DiffSnapshots error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "对比快照失败")
		return
	}

	response.JSONSuccess(c, result)
}
