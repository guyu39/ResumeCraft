package model

import "encoding/json"

// JobApplicationStatus 投递状态
type JobApplicationStatus string

const (
	JobApplicationStatusPendingAdaptation JobApplicationStatus = "pending_adaptation"
	JobApplicationStatusAdapted           JobApplicationStatus = "adapted"
	JobApplicationStatusSubmitted         JobApplicationStatus = "submitted"
	JobApplicationStatusWrittenTest       JobApplicationStatus = "written_test"
	JobApplicationStatusInterview         JobApplicationStatus = "interview"
	JobApplicationStatusOffer             JobApplicationStatus = "offer"
	JobApplicationStatusRejected          JobApplicationStatus = "rejected"
	JobApplicationStatusWithdrawn         JobApplicationStatus = "withdrawn"
)

// JobApplication 投递记录详情
type JobApplication struct {
	ID                string                        `json:"id"`
	UserID            string                        `json:"userId"`
	ResumeID          string                        `json:"resumeId"`
	ResumeTitle       string                        `json:"resumeTitle,omitempty"`
	SnapshotVersionID string                        `json:"snapshotVersionId"`
	SnapshotLabel     string                        `json:"snapshotLabel,omitempty"`
	SnapshotType      string                        `json:"snapshotType,omitempty"`
	CompanyName       string                        `json:"companyName"`
	Department        string                        `json:"department,omitempty"`
	TargetTitle       string                        `json:"targetTitle"`
	JDText            string                        `json:"jdText"`
	JDHash            string                        `json:"jdHash"`
	Source            string                        `json:"source"`
	ApplicationURL    string                        `json:"applicationUrl,omitempty"`
	Status            JobApplicationStatus          `json:"status"`
	MatchScore        *int                          `json:"matchScore,omitempty"`
	JDScore           *int                          `json:"jdScore,omitempty"`
	ChecklistDone     int                           `json:"checklistDone"`
	ChecklistTotal    int                           `json:"checklistTotal"`
	NextAction        string                        `json:"nextAction,omitempty"`
	SubmittedAt       *int64                        `json:"submittedAt,omitempty"`
	WrittenTestAt     *int64                        `json:"writtenTestAt,omitempty"`
	CreatedAt         int64                         `json:"createdAt"`
	UpdatedAt         int64                         `json:"updatedAt"`
	StatusEvents      []JobApplicationStatusEvent   `json:"statusEvents,omitempty"`
	ChecklistItems    []JobApplicationChecklistItem `json:"checklistItems,omitempty"`
	AIRuns            []JobApplicationAIRun         `json:"aiRuns,omitempty"`
	Interviews        []JobApplicationInterview     `json:"interviews,omitempty"`
}

// JobApplicationListItem 投递列表项
type JobApplicationListItem struct {
	ID                string               `json:"id"`
	ResumeID          string               `json:"resumeId"`
	ResumeTitle       string               `json:"resumeTitle,omitempty"`
	SnapshotVersionID string               `json:"snapshotVersionId"`
	SnapshotLabel     string               `json:"snapshotLabel,omitempty"`
	CompanyName       string               `json:"companyName"`
	Department        string               `json:"department,omitempty"`
	TargetTitle       string               `json:"targetTitle"`
	Source            string               `json:"source"`
	ApplicationURL    string               `json:"applicationUrl,omitempty"`
	Status            JobApplicationStatus `json:"status"`
	MatchScore        *int                 `json:"matchScore,omitempty"`
	JDScore           *int                 `json:"jdScore,omitempty"`
	ChecklistDone     int                  `json:"checklistDone"`
	ChecklistTotal    int                  `json:"checklistTotal"`
	NextAction        string               `json:"nextAction,omitempty"`
	SubmittedAt       *int64               `json:"submittedAt,omitempty"`
	WrittenTestAt     *int64               `json:"writtenTestAt,omitempty"`
	UpdatedAt         int64                `json:"updatedAt"`
	CreatedAt         int64                `json:"createdAt"`
}

// JobApplicationStatusEvent 状态历史
type JobApplicationStatusEvent struct {
	ID            string                `json:"id"`
	ApplicationID string                `json:"applicationId"`
	FromStatus    *JobApplicationStatus `json:"fromStatus,omitempty"`
	ToStatus      JobApplicationStatus  `json:"toStatus"`
	Note          string                `json:"note,omitempty"`
	CreatedAt     int64                 `json:"createdAt"`
}

// JobApplicationChecklistItem 投递前检查清单项
type JobApplicationChecklistItem struct {
	ID                      string `json:"id"`
	ApplicationID           string `json:"applicationId"`
	Source                  string `json:"source"`
	SourceSnapshotVersionID string `json:"sourceSnapshotVersionId,omitempty"`
	Category                string `json:"category"`
	Title                   string `json:"title"`
	Detail                  string `json:"detail,omitempty"`
	Checked                 bool   `json:"checked"`
	SortOrder               int    `json:"sortOrder"`
	CreatedAt               int64  `json:"createdAt"`
	UpdatedAt               int64  `json:"updatedAt"`
}

// JobApplicationAIRun AI 结果摘要
type JobApplicationAIRun struct {
	ID                      string          `json:"id"`
	ApplicationID           string          `json:"applicationId"`
	ResumeID                string          `json:"resumeId,omitempty"`
	SourceSnapshotVersionID string          `json:"sourceSnapshotVersionId,omitempty"`
	ResultType              string          `json:"resultType"`
	Summary                 json.RawMessage `json:"summary"`
	Model                   string          `json:"model,omitempty"`
	ConversationID          string          `json:"conversationId,omitempty"`
	OptimizedSnapshotID     string          `json:"optimizedSnapshotId,omitempty"`
	CreatedAt               int64           `json:"createdAt"`
}

// JobApplicationInterview 面试记录
type JobApplicationInterview struct {
	ID            string `json:"id"`
	ApplicationID string `json:"applicationId"`
	Round         string `json:"round"`
	ScheduledAt   *int64 `json:"scheduledAt,omitempty"`
	Format        string `json:"format"`
	Interviewer   string `json:"interviewer"`
	Questions     string `json:"questions,omitempty"`
	Notes         string `json:"notes,omitempty"`
	Result        string `json:"result,omitempty"`
	NextAction    string `json:"nextAction,omitempty"`
	CreatedAt     int64  `json:"createdAt"`
	UpdatedAt     int64  `json:"updatedAt"`
}

// JobApplicationAttachment 预留附件元数据
type JobApplicationAttachment struct {
	ID            string          `json:"id"`
	ApplicationID string          `json:"applicationId"`
	InterviewID   string          `json:"interviewId,omitempty"`
	FileName      string          `json:"fileName"`
	FileType      string          `json:"fileType"`
	FileSize      int64           `json:"fileSize"`
	StorageKey    string          `json:"storageKey"`
	Metadata      json.RawMessage `json:"metadata,omitempty"`
	CreatedAt     int64           `json:"createdAt"`
}

// JobApplicationFilters 列表/导出筛选
type JobApplicationFilters struct {
	Page     int
	PageSize int
	Keyword  string
	Company  string
	ResumeID string
	Statuses []JobApplicationStatus
}

type JobApplicationListResponse struct {
	Items      []JobApplicationListItem `json:"items"`
	Pagination Pagination               `json:"pagination"`
}

type CreateJobApplicationRequest struct {
	ResumeID          string                             `json:"resumeId" binding:"required"`
	SnapshotVersionID string                             `json:"snapshotVersionId" binding:"required"`
	CompanyName       string                             `json:"companyName"`
	Department        string                             `json:"department"`
	TargetTitle       string                             `json:"targetTitle" binding:"required,max=200"`
	JDText            string                             `json:"jdText" binding:"required"`
	Source            string                             `json:"source"`
	ApplicationURL    string                             `json:"applicationUrl"`
	NextAction        string                             `json:"nextAction"`
	MatchResult       *JDMatchResponse                   `json:"matchResult,omitempty"`
	ScoreResult       *JDScoreResponse                   `json:"scoreResult,omitempty"`
	AIRuns            []CreateJobApplicationAIRunRequest `json:"aiRuns,omitempty"`
}

type UpdateJobApplicationRequest struct {
	ResumeID          string               `json:"resumeId"`
	SnapshotVersionID string               `json:"snapshotVersionId"`
	CompanyName       string               `json:"companyName"`
	Department        string               `json:"department"`
	TargetTitle       string               `json:"targetTitle"`
	JDText            string               `json:"jdText"`
	Source            string               `json:"source"`
	ApplicationURL    string               `json:"applicationUrl"`
	NextAction        string               `json:"nextAction"`
	SubmittedAt       *int64               `json:"submittedAt"`
	WrittenTestAt     *int64               `json:"writtenTestAt"`
	Status            JobApplicationStatus `json:"status"`
}

type UpdateJobApplicationStatusRequest struct {
	Status JobApplicationStatus `json:"status" binding:"required"`
	Note   string               `json:"note"`
}

type CreateChecklistItemRequest struct {
	Source                  string `json:"source"`
	SourceSnapshotVersionID string `json:"sourceSnapshotVersionId"`
	Category                string `json:"category"`
	Title                   string `json:"title" binding:"required"`
	Detail                  string `json:"detail"`
	Checked                 bool   `json:"checked"`
	SortOrder               int    `json:"sortOrder"`
}

type UpdateChecklistItemRequest struct {
	Source                  string `json:"source"`
	SourceSnapshotVersionID string `json:"sourceSnapshotVersionId"`
	Category                string `json:"category"`
	Title                   string `json:"title"`
	Detail                  string `json:"detail"`
	Checked                 *bool  `json:"checked"`
	SortOrder               *int   `json:"sortOrder"`
}

type CreateJobApplicationAIRunRequest struct {
	ResumeID                string          `json:"resumeId"`
	SourceSnapshotVersionID string          `json:"sourceSnapshotVersionId"`
	ResultType              string          `json:"resultType" binding:"required"`
	Summary                 json.RawMessage `json:"summary"`
	Model                   string          `json:"model"`
	ConversationID          string          `json:"conversationId"`
	OptimizedSnapshotID     string          `json:"optimizedSnapshotId"`
}

type CreateInterviewRequest struct {
	Round       string `json:"round"`
	ScheduledAt *int64 `json:"scheduledAt"`
	Format      string `json:"format"`
	Interviewer string `json:"interviewer"`
	Questions   string `json:"questions"`
	Notes       string `json:"notes"`
	Result      string `json:"result"`
	NextAction  string `json:"nextAction"`
}

type UpdateInterviewRequest = CreateInterviewRequest

type DuplicateJobApplicationRequest struct {
	CompanyName string `json:"companyName"`
	TargetTitle string `json:"targetTitle"`
	JDText      string `json:"jdText"`
}

type DuplicateJobApplicationResponse struct {
	Items []JobApplicationListItem `json:"items"`
}
