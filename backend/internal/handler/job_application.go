package handler

import (
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"resumecraft-pdf-backend/internal/middleware"
	"resumecraft-pdf-backend/internal/model"
	ai "resumecraft-pdf-backend/internal/service/ai"
	jobapplication "resumecraft-pdf-backend/internal/service/job_application"
	"resumecraft-pdf-backend/pkg/response"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ListApplications 获取投递记录列表
// GET /api/applications
func (h *Handler) ListApplications(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	result, err := h.applicationService.List(c.Request.Context(), userID, parseApplicationFilters(c))
	if err != nil {
		handleApplicationError(c, "ListApplications", err)
		return
	}
	response.JSONSuccess(c, result)
}

// GetApplicationStats 求职漏斗 + 简历版本 A/B 对比
// GET /api/applications/stats
func (h *Handler) GetApplicationStats(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	result, err := h.applicationService.GetFunnelStats(c.Request.Context(), userID)
	if err != nil {
		log.Printf("[application] GetApplicationStats error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "统计加载失败")
		return
	}
	response.JSONSuccess(c, result)
}

// GetApplicationTrend 漏斗趋势（按周/月分桶）
// GET /api/applications/stats/trend?bucket=week|month&from=<ms>&to=<ms>
func (h *Handler) GetApplicationTrend(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	bucket := model.TrendBucket(c.Query("bucket"))
	from := parseTimeMillis(c.Query("from"))
	to := parseTimeMillis(c.Query("to"))
	result, err := h.applicationService.GetTrendStats(c.Request.Context(), userID, bucket, from, to)
	if err != nil {
		log.Printf("[application] GetApplicationTrend error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "趋势加载失败")
		return
	}
	response.JSONSuccess(c, result)
}

// GetApplicationInterviewRounds 面试轮次分布 + 阶段停留时长
// GET /api/applications/stats/interview-rounds
func (h *Handler) GetApplicationInterviewRounds(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	result, err := h.applicationService.GetInterviewRoundsStats(c.Request.Context(), userID)
	if err != nil {
		log.Printf("[application] GetApplicationInterviewRounds error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "面试轮次统计失败")
		return
	}
	response.JSONSuccess(c, result)
}

// parseTimeMillis 解析毫秒时间戳字符串；缺省或非法返回零值，由 service 层兜底
func parseTimeMillis(raw string) time.Time {
	if raw == "" {
		return time.Time{}
	}
	ms, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || ms <= 0 {
		return time.Time{}
	}
	return time.UnixMilli(ms)
}

// GetApplicationCalendar 日程视图：区间内笔试/面试事件 + 冲突标记
// GET /api/applications/calendar?from=<ms>&to=<ms>
func (h *Handler) GetApplicationCalendar(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	from := parseTimeMillis(c.Query("from"))
	to := parseTimeMillis(c.Query("to"))
	result, err := h.applicationService.GetCalendar(c.Request.Context(), userID, from, to)
	if err != nil {
		log.Printf("[application] GetApplicationCalendar error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "日程加载失败")
		return
	}
	response.JSONSuccess(c, result)
}

// GetApplication 获取投递记录详情
// GET /api/applications/:id
func (h *Handler) GetApplication(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	app, err := h.applicationService.GetByID(c.Request.Context(), userID, c.Param("id"))
	if err != nil {
		handleApplicationError(c, "GetApplication", err)
		return
	}
	response.JSONSuccess(c, app)
}

// CreateApplication 创建投递记录
// POST /api/applications
func (h *Handler) CreateApplication(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	var req model.CreateJobApplicationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数格式错误")
		return
	}
	app, err := h.applicationService.Create(c.Request.Context(), userID, req)
	if err != nil {
		handleApplicationError(c, "CreateApplication", err)
		return
	}
	response.JSONCreated(c, app)
}

// UpdateApplication 更新投递记录
// PUT /api/applications/:id
func (h *Handler) UpdateApplication(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	var req model.UpdateJobApplicationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数格式错误")
		return
	}
	app, err := h.applicationService.Update(c.Request.Context(), userID, c.Param("id"), req)
	if err != nil {
		handleApplicationError(c, "UpdateApplication", err)
		return
	}
	response.JSONSuccess(c, app)
}

// DeleteApplication 删除投递记录
// DELETE /api/applications/:id
func (h *Handler) DeleteApplication(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	if err := h.applicationService.Delete(c.Request.Context(), userID, c.Param("id")); err != nil {
		handleApplicationError(c, "DeleteApplication", err)
		return
	}
	response.JSONSuccess(c, gin.H{"deleted": true})
}

// CheckApplicationDuplicates 检查重复投递记录
// POST /api/applications/duplicates
func (h *Handler) CheckApplicationDuplicates(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	var req model.DuplicateJobApplicationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数格式错误")
		return
	}
	result, err := h.applicationService.CheckDuplicates(c.Request.Context(), userID, req)
	if err != nil {
		handleApplicationError(c, "CheckApplicationDuplicates", err)
		return
	}
	response.JSONSuccess(c, result)
}

// UpdateApplicationStatus 更新投递状态
// PUT /api/applications/:id/status
func (h *Handler) UpdateApplicationStatus(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	var req model.UpdateJobApplicationStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数格式错误")
		return
	}
	event, err := h.applicationService.UpdateStatus(c.Request.Context(), userID, c.Param("id"), req)
	if err != nil {
		handleApplicationError(c, "UpdateApplicationStatus", err)
		return
	}
	response.JSONSuccess(c, event)
}

// CreateApplicationChecklistItem 新增检查清单项
// POST /api/applications/:id/checklist
func (h *Handler) CreateApplicationChecklistItem(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	var req model.CreateChecklistItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数格式错误")
		return
	}
	item, err := h.applicationService.CreateChecklistItem(c.Request.Context(), userID, c.Param("id"), req)
	if err != nil {
		handleApplicationError(c, "CreateApplicationChecklistItem", err)
		return
	}
	response.JSONCreated(c, item)
}

// UpdateApplicationChecklistItem 更新检查清单项
// PUT /api/applications/:id/checklist/:itemId
func (h *Handler) UpdateApplicationChecklistItem(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	var req model.UpdateChecklistItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数格式错误")
		return
	}
	item, err := h.applicationService.UpdateChecklistItem(c.Request.Context(), userID, c.Param("id"), c.Param("itemId"), req)
	if err != nil {
		handleApplicationError(c, "UpdateApplicationChecklistItem", err)
		return
	}
	response.JSONSuccess(c, item)
}

// DeleteApplicationChecklistItem 删除检查清单项
// DELETE /api/applications/:id/checklist/:itemId
func (h *Handler) DeleteApplicationChecklistItem(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	if err := h.applicationService.DeleteChecklistItem(c.Request.Context(), userID, c.Param("id"), c.Param("itemId")); err != nil {
		handleApplicationError(c, "DeleteApplicationChecklistItem", err)
		return
	}
	response.JSONSuccess(c, gin.H{"deleted": true})
}

// RegenerateApplicationChecklist 重新生成检查清单
// POST /api/applications/:id/checklist/regenerate
func (h *Handler) RegenerateApplicationChecklist(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	items, err := h.applicationService.RegenerateChecklist(c.Request.Context(), userID, c.Param("id"))
	if err != nil {
		handleApplicationError(c, "RegenerateApplicationChecklist", err)
		return
	}
	response.JSONSuccess(c, gin.H{"items": items})
}

// CreateApplicationAIRun 保存 AI 结果摘要
// POST /api/applications/:id/ai-runs
func (h *Handler) CreateApplicationAIRun(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	var req model.CreateJobApplicationAIRunRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数格式错误")
		return
	}
	run, err := h.applicationService.CreateAIRun(c.Request.Context(), userID, c.Param("id"), req)
	if err != nil {
		handleApplicationError(c, "CreateApplicationAIRun", err)
		return
	}
	response.JSONCreated(c, run)
}

// CreateApplicationInterview 新增面试记录
// POST /api/applications/:id/interviews
func (h *Handler) CreateApplicationInterview(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	var req model.CreateInterviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数格式错误")
		return
	}
	item, err := h.applicationService.CreateInterview(c.Request.Context(), userID, c.Param("id"), req)
	if err != nil {
		handleApplicationError(c, "CreateApplicationInterview", err)
		return
	}
	response.JSONCreated(c, item)
}

// UpdateApplicationInterview 更新面试记录
// PUT /api/applications/:id/interviews/:interviewId
func (h *Handler) UpdateApplicationInterview(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	var req model.UpdateInterviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数格式错误")
		return
	}
	item, err := h.applicationService.UpdateInterview(c.Request.Context(), userID, c.Param("id"), c.Param("interviewId"), req)
	if err != nil {
		handleApplicationError(c, "UpdateApplicationInterview", err)
		return
	}
	response.JSONSuccess(c, item)
}

// DeleteApplicationInterview 删除面试记录
// DELETE /api/applications/:id/interviews/:interviewId
func (h *Handler) DeleteApplicationInterview(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	if err := h.applicationService.DeleteInterview(c.Request.Context(), userID, c.Param("id"), c.Param("interviewId")); err != nil {
		handleApplicationError(c, "DeleteApplicationInterview", err)
		return
	}
	response.JSONSuccess(c, gin.H{"deleted": true})
}

const maxInterviewFileSize = 2 << 20 // 2MB，纯文本面试记录不应超过此大小

// AnalyzeInterviewFile 上传面试记录文本文件，AI 生成总结（不落库，仅返回摘要供前端确认后保存）
// POST /api/applications/:id/interviews/analyze-file
func (h *Handler) AnalyzeInterviewFile(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	if h.aiService == nil {
		response.JSONError(c, http.StatusServiceUnavailable, "AI_UNAVAILABLE", "AI 服务未启用")
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "请选择文件")
		return
	}
	defer file.Close()

	if header.Size > maxInterviewFileSize {
		response.JSONError(c, http.StatusBadRequest, "FILE_TOO_LARGE", "文件大小不能超过 2MB")
		return
	}

	data, err := io.ReadAll(io.LimitReader(file, maxInterviewFileSize+1))
	if err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "读取文件失败")
		return
	}
	if int64(len(data)) > maxInterviewFileSize {
		response.JSONError(c, http.StatusBadRequest, "FILE_TOO_LARGE", "文件大小不能超过 2MB")
		return
	}

	text := string(data)
	if strings.TrimSpace(text) == "" {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "文件内容为空")
		return
	}
	if isLikelyBinary(text) {
		response.JSONError(c, http.StatusBadRequest, "INVALID_FILE_TYPE", "仅支持纯文本文件（.txt），检测到非文本内容")
		return
	}

	summary, err := h.aiService.SummarizeInterviewNotes(c.Request.Context(), userID, text)
	if err != nil {
		if errors.Is(err, ai.ErrAIConfigNotFound) {
			response.JSONError(c, http.StatusNotFound, "NOT_FOUND", "请先配置 AI 服务")
			return
		}
		log.Printf("[applications] AnalyzeInterviewFile error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "分析面试记录失败")
		return
	}

	response.JSONSuccess(c, model.AnalyzeInterviewFileResponse{Summary: summary})
}

// UploadInterviewRecording 上传面试录音文件（txt/docx）并关联到面试记录
// POST /api/applications/:id/interviews/:interviewId/recording
func (h *Handler) UploadInterviewRecording(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	applicationID := c.Param("id")
	interviewID := c.Param("interviewId")

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "请选择文件")
		return
	}
	defer file.Close()

	if header.Size > maxInterviewFileSize {
		response.JSONError(c, http.StatusBadRequest, "FILE_TOO_LARGE", "文件大小不能超过 2MB")
		return
	}

	data, err := io.ReadAll(io.LimitReader(file, maxInterviewFileSize+1))
	if err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "读取文件失败")
		return
	}
	if int64(len(data)) > maxInterviewFileSize {
		response.JSONError(c, http.StatusBadRequest, "FILE_TOO_LARGE", "文件大小不能超过 2MB")
		return
	}

	fileName := header.Filename
	ext := strings.ToLower(filepath.Ext(fileName))
	if ext != ".txt" && ext != ".docx" {
		response.JSONError(c, http.StatusBadRequest, "INVALID_FILE_TYPE", "仅支持 .txt 或 .docx 格式")
		return
	}

	fileType := ext[1:]
	contentType := mime.TypeByExtension(ext)
	if contentType == "" {
		if ext == ".txt" {
			contentType = "text/plain; charset=utf-8"
		} else {
			contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
		}
	}

	key := fmt.Sprintf("applications/%s/interviews/%s/recording-%s%s", applicationID, interviewID, uuid.New().String(), ext)
	if _, err := h.objectStorage.Upload(c.Request.Context(), key, strings.NewReader(string(data)), int64(len(data)), contentType); err != nil {
		log.Printf("[applications] UploadInterviewRecording storage upload failed: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "UPLOAD_FAILED", "文件上传失败")
		return
	}

	attachment, err := h.applicationService.UploadInterviewRecording(c.Request.Context(), userID, applicationID, jobapplication.UploadInterviewRecordingParams{
		InterviewID: interviewID,
		FileName:    fileName,
		FileType:    fileType,
		FileSize:    int64(len(data)),
		StorageKey:  key,
	})
	if err != nil {
		log.Printf("[applications] UploadInterviewRecording save attachment failed: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "SAVE_FAILED", "文件记录保存失败")
		return
	}

	response.JSONSuccess(c, model.UploadInterviewRecordingResponse{Attachment: *attachment})
}

// GetInterviewRecording 获取面试录音文件内容
// GET /api/applications/:id/interviews/:interviewId/recording
func (h *Handler) GetInterviewRecording(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	applicationID := c.Param("id")
	interviewID := c.Param("interviewId")

	attachment, err := h.applicationService.GetInterviewRecording(c.Request.Context(), userID, applicationID, interviewID)
	if err != nil {
		handleApplicationError(c, "GetInterviewRecording", err)
		return
	}
	if attachment == nil {
		response.JSONSuccess(c, model.GetInterviewRecordingResponse{})
		return
	}

	reader, size, _, err := h.objectStorage.Download(c.Request.Context(), attachment.StorageKey)
	if err != nil {
		log.Printf("[applications] GetInterviewRecording download failed: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "DOWNLOAD_FAILED", "文件读取失败")
		return
	}
	defer reader.Close()

	if size > maxInterviewFileSize {
		response.JSONError(c, http.StatusBadRequest, "FILE_TOO_LARGE", "文件大小超过限制")
		return
	}

	data, err := io.ReadAll(io.LimitReader(reader, maxInterviewFileSize+1))
	if err != nil {
		response.JSONError(c, http.StatusInternalServerError, "DOWNLOAD_FAILED", "文件读取失败")
		return
	}

	response.JSONSuccess(c, model.GetInterviewRecordingResponse{
		Attachment: attachment,
		Content:    base64.StdEncoding.EncodeToString(data),
	})
}

// ExportApplications 导出当前筛选投递表格
// GET /api/applications/export
func (h *Handler) ExportApplications(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	data, err := h.applicationService.ExportExcel(c.Request.Context(), userID, parseApplicationFilters(c))
	if err != nil {
		handleApplicationError(c, "ExportApplications", err)
		return
	}
	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Header("Content-Disposition", `attachment; filename="job-applications.xlsx"`)
	c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", data)
}

func getUserID(c *gin.Context) (string, bool) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return "", false
	}
	id, ok := userID.(string)
	if !ok || id == "" {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return "", false
	}
	return id, true
}

func parseApplicationFilters(c *gin.Context) model.JobApplicationFilters {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	statuses := []model.JobApplicationStatus{}
	rawStatuses := c.Query("statuses")
	if rawStatuses == "" {
		rawStatuses = c.Query("status")
	}
	for _, raw := range strings.Split(rawStatuses, ",") {
		raw = strings.TrimSpace(raw)
		if raw != "" {
			statuses = append(statuses, model.JobApplicationStatus(raw))
		}
	}
	return model.JobApplicationFilters{
		Page:     page,
		PageSize: pageSize,
		Keyword:  c.Query("keyword"),
		Company:  c.Query("company"),
		ResumeID: c.Query("resumeId"),
		Statuses: statuses,
	}
}

func handleApplicationError(c *gin.Context, op string, err error) {
	if errors.Is(err, jobapplication.ErrApplicationNotFound) {
		response.JSONError(c, http.StatusNotFound, "APPLICATION_NOT_FOUND", "投递记录不存在或无权限访问")
		return
	}
	if errors.Is(err, jobapplication.ErrInvalidAssociation) {
		response.JSONError(c, http.StatusBadRequest, "INVALID_ASSOCIATION", "简历或快照关联无效")
		return
	}
	if errors.Is(err, jobapplication.ErrInvalidStatus) {
		response.JSONError(c, http.StatusBadRequest, "INVALID_STATUS", "投递状态无效")
		return
	}
	if errors.Is(err, jobapplication.ErrInvalidPayload) {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数格式错误")
		return
	}
	if errors.Is(err, jobapplication.ErrInterviewRoundInvalid) {
		response.JSONError(c, http.StatusBadRequest, "INTERVIEW_ROUND_INVALID", "面试阶段无效，请选择一面/二面/三面/主管面/HR面")
		return
	}
	if errors.Is(err, jobapplication.ErrInterviewRoundDuplicated) {
		msg := err.Error()
		if msg == "" {
			msg = "该岗位已存在该阶段面试记录，不可重复添加"
		}
		response.JSONError(c, http.StatusBadRequest, "INTERVIEW_ROUND_DUPLICATED", msg)
		return
	}
	if errors.Is(err, jobapplication.ErrInterviewNoPrerequisite) {
		msg := err.Error()
		if msg == "" {
			msg = "新增该面试阶段需至少存在一轮更早面试"
		}
		response.JSONError(c, http.StatusBadRequest, "INTERVIEW_NO_PREREQUISITE", msg)
		return
	}
	if errors.Is(err, jobapplication.ErrInterviewDateTooEarly) {
		msg := err.Error()
		if msg == "" {
			msg = "面试日期必须晚于所有更早面试日期"
		}
		response.JSONError(c, http.StatusBadRequest, "INTERVIEW_DATE_TOO_EARLY", msg)
		return
	}
	if errors.Is(err, jobapplication.ErrInterviewDateConflict) {
		msg := err.Error()
		if msg == "" {
			msg = "面试日期与相邻阶段冲突，必须晚于更早面试且早于后续面试"
		}
		response.JSONError(c, http.StatusBadRequest, "INTERVIEW_DATE_CONFLICT", msg)
		return
	}
	if errors.Is(err, jobapplication.ErrInterviewNotDeletable) {
		response.JSONError(c, http.StatusBadRequest, "INTERVIEW_NOT_DELETABLE", "仅可删除日期最新的那一条面试记录")
		return
	}
	if errors.Is(err, jobapplication.ErrApplicationFinalized) {
		response.JSONError(c, http.StatusBadRequest, "APPLICATION_FINALIZED", "投递已终止或已 offer，不可再添加面试")
		return
	}
	log.Printf("[applications] %s error: %v", op, err)
	response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", fmt.Sprintf("%s失败", applicationOperationLabel(op)))
}

func applicationOperationLabel(op string) string {
	switch op {
	case "ListApplications":
		return "获取投递列表"
	case "GetApplication":
		return "获取投递详情"
	case "CreateApplication":
		return "创建投递记录"
	case "UpdateApplication":
		return "更新投递记录"
	case "DeleteApplication":
		return "删除投递记录"
	case "ExportApplications":
		return "导出投递记录"
	default:
		return "处理投递记录"
	}
}
