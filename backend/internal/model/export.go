package model

// ExportStatus 导出任务状态
type ExportStatus string

const (
	ExportStatusQueued     ExportStatus = "QUEUED"
	ExportStatusProcessing ExportStatus = "PROCESSING"
	ExportStatusSuccess    ExportStatus = "SUCCESS"
	ExportStatusFailed     ExportStatus = "FAILED"
)

// CreateExportRequest 创建导出任务请求
type CreateExportRequest struct {
	VersionID   string `json:"versionId" binding:"required"`
	Format      string `json:"format" binding:"required,oneof=pdf"`
	Paper       string `json:"paper" binding:"required,oneof=A4 Letter"`
	Orientation string `json:"orientation" binding:"required,oneof=portrait landscape"`
}

// ExportTask 导出任务
type ExportTask struct {
	TaskID       string       `json:"taskId"`
	Status       ExportStatus `json:"status"`
	Progress     int          `json:"progress,omitempty"`
	ErrorCode    string       `json:"errorCode,omitempty"`
	ErrorMessage string       `json:"errorMessage,omitempty"`
	FileID       string       `json:"fileId,omitempty"`
	DownloadURL  string       `json:"downloadUrl,omitempty"`
	ExpiresAt    int64        `json:"expiresAt,omitempty"` // 时间戳
	CreatedAt    int64        `json:"createdAt"`           // 前端期望时间戳
	FinishedAt   int64        `json:"finishedAt,omitempty"` // 时间戳
}