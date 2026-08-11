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
	SnapshotVersionID *string                       `json:"snapshotVersionId"`
	SnapshotLabel     string                        `json:"snapshotLabel,omitempty"`
	SnapshotType      string                        `json:"snapshotType,omitempty"`
	CompanyName       string                        `json:"companyName"`
	Department        string                        `json:"department,omitempty"`
	TargetTitle       string                        `json:"targetTitle"`
	JDText            string                        `json:"jdText"`
	JDHash            string                        `json:"jdHash"`
	PreferredCity     string                        `json:"preferredCity,omitempty"`
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
	ID                string                         `json:"id"`
	ResumeID          string                         `json:"resumeId"`
	ResumeTitle       string                         `json:"resumeTitle,omitempty"`
	SnapshotVersionID *string                        `json:"snapshotVersionId"`
	SnapshotLabel     string                         `json:"snapshotLabel,omitempty"`
	CompanyName       string                         `json:"companyName"`
	Department        string                         `json:"department,omitempty"`
	TargetTitle       string                         `json:"targetTitle"`
	PreferredCity     string                         `json:"preferredCity,omitempty"`
	ApplicationURL    string                         `json:"applicationUrl,omitempty"`
	Status            JobApplicationStatus           `json:"status"`
	MatchScore        *int                           `json:"matchScore,omitempty"`
	JDScore           *int                           `json:"jdScore,omitempty"`
	ChecklistDone     int                            `json:"checklistDone"`
	ChecklistTotal    int                            `json:"checklistTotal"`
	NextAction        string                         `json:"nextAction,omitempty"`
	SubmittedAt       *int64                         `json:"submittedAt,omitempty"`
	WrittenTestAt     *int64                         `json:"writtenTestAt,omitempty"`
	UpdatedAt         int64                          `json:"updatedAt"`
	CreatedAt         int64                          `json:"createdAt"`
	Interviews        []JobApplicationInterviewBrief `json:"interviews,omitempty"`
}

// JobApplicationInterviewBrief 列表页展示用的面试轮次精简信息
type JobApplicationInterviewBrief struct {
	Round        string `json:"round"`
	ScheduledAt  *int64 `json:"scheduledAt,omitempty"`
	ScheduledEnd *int64 `json:"scheduledEnd,omitempty"`
	Result       string `json:"result,omitempty"`
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
	ID                  string                    `json:"id"`
	ApplicationID       string                    `json:"applicationId"`
	Round               string                    `json:"round"`
	ScheduledAt         *int64                    `json:"scheduledAt,omitempty"`
	ScheduledEnd        *int64                    `json:"scheduledEnd,omitempty"`
	Format              string                    `json:"format"`
	Interviewer         string                    `json:"interviewer"`
	Questions           string                    `json:"questions,omitempty"`
	Notes               string                    `json:"notes,omitempty"`
	Result              string                    `json:"result,omitempty"`
	NextAction          string                    `json:"nextAction,omitempty"`
	RecordingAttachment *JobApplicationAttachment `json:"recordingAttachment,omitempty"`
	CreatedAt           int64                     `json:"createdAt"`
	UpdatedAt           int64                     `json:"updatedAt"`
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
	SnapshotVersionID *string                            `json:"snapshotVersionId"`
	CompanyName       string                             `json:"companyName"`
	Department        string                             `json:"department"`
	TargetTitle       string                             `json:"targetTitle" binding:"required,max=200"`
	JDText            string                             `json:"jdText"`
	PreferredCity     string                             `json:"preferredCity"`
	ApplicationURL    string                             `json:"applicationUrl"`
	NextAction        string                             `json:"nextAction"`
	MatchResult       *JDMatchResponse                   `json:"matchResult,omitempty"`
	ScoreResult       *JDScoreResponse                   `json:"scoreResult,omitempty"`
	AIRuns            []CreateJobApplicationAIRunRequest `json:"aiRuns,omitempty"`
}

type UpdateJobApplicationRequest struct {
	ResumeID          string  `json:"resumeId"`
	SnapshotVersionID *string `json:"snapshotVersionId"`
	CompanyName       string  `json:"companyName"`
	Department        string  `json:"department"`
	TargetTitle       string  `json:"targetTitle"`
	// JDText 用指针区分「未传」（nil，不更新）与「传了空串」（清空 JD）
	JDText *string `json:"jdText"`
	// PreferredCity 用指针区分「未传」（nil，不更新）与「传了空串」（清空城市）
	PreferredCity  *string              `json:"preferredCity"`
	ApplicationURL string               `json:"applicationUrl"`
	NextAction     string               `json:"nextAction"`
	SubmittedAt    *int64               `json:"submittedAt"`
	WrittenTestAt  *int64               `json:"writtenTestAt"`
	Status         JobApplicationStatus `json:"status"`
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
	Round        string `json:"round"`
	ScheduledAt  *int64 `json:"scheduledAt"`
	ScheduledEnd *int64 `json:"scheduledEnd"`
	Format       string `json:"format"`
	Interviewer  string `json:"interviewer"`
	Questions    string `json:"questions"`
	Notes        string `json:"notes"`
	Result       string `json:"result"`
	NextAction   string `json:"nextAction"`
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

// AnalyzeInterviewFileResponse 上传面试记录文件 AI 总结的响应
type AnalyzeInterviewFileResponse struct {
	Summary string `json:"summary"`
}

// UploadInterviewRecordingResponse 上传面试录音文件后的响应
type UploadInterviewRecordingResponse struct {
	Attachment JobApplicationAttachment `json:"attachment"`
}

// GetInterviewRecordingResponse 获取面试录音文件内容
type GetInterviewRecordingResponse struct {
	Attachment *JobApplicationAttachment `json:"attachment,omitempty"`
	Content    string                    `json:"content,omitempty"`
}

// FunnelStats 求职漏斗各阶段计数
type FunnelStats struct {
	Submitted   int `json:"submitted"`   // 已投递（submitted_at 非空）
	WrittenTest int `json:"writtenTest"` // 笔试（written_test_at 非空）
	Interview   int `json:"interview"`   // 面试（有面试记录）
	Offer       int `json:"offer"`       // Offer（status=offer）
	Total       int `json:"total"`       // 全部投递记录数（参考）
}

// SnapshotConversion 单个简历版本的转化数据（A/B 对比用）
type SnapshotConversion struct {
	SnapshotVersionID *string `json:"snapshotVersionId"`
	SnapshotLabel     string  `json:"snapshotLabel"`
	ResumeID          string  `json:"resumeId"`
	ResumeTitle       string  `json:"resumeTitle"`
	Submitted         int     `json:"submitted"`
	Interview         int     `json:"interview"`
	Offer             int     `json:"offer"`
	ReplyRate         float64 `json:"replyRate"` // 面试/投递
}

// FunnelStatsResponse 漏斗分析 + 版本对比响应
type FunnelStatsResponse struct {
	Funnel     FunnelStats          `json:"funnel"`
	BySnapshot []SnapshotConversion `json:"bySnapshot"`
}

// TrendBucket 趋势分桶粒度
type TrendBucket string

const (
	TrendBucketWeek  TrendBucket = "week"
	TrendBucketMonth TrendBucket = "month"
)

// TrendPoint 单个时间桶的漏斗指标
// ReplyRate/OfferRate 以 0-1 小数返回，展示层负责转百分比
type TrendPoint struct {
	BucketStart int64   `json:"bucketStart"`
	Submitted   int     `json:"submitted"`
	Interview   int     `json:"interview"`
	Offer       int     `json:"offer"`
	ReplyRate   float64 `json:"replyRate"`
	OfferRate   float64 `json:"offerRate"`
}

// TrendStatsResponse 漏斗趋势响应
type TrendStatsResponse struct {
	Bucket TrendBucket  `json:"bucket"`
	From   int64        `json:"from"`
	To     int64        `json:"to"`
	Points []TrendPoint `json:"points"`
}

// RoundBucket 面试轮次分布桶（Round=4 表示「4 轮及以上」）
type RoundBucket struct {
	Round int `json:"round"`
	Count int `json:"count"`
}

// StageDurationStat 相邻状态转换的停留时长（天）
type StageDurationStat struct {
	Transition string  `json:"transition"`
	MedianDays float64 `json:"medianDays"`
	MaxDays    float64 `json:"maxDays"`
	Samples    int     `json:"samples"`
}

// InterviewRoundsResponse 面试轮次分布 + 阶段停留时长
type InterviewRoundsResponse struct {
	Avg            float64             `json:"avg"`
	Median         float64             `json:"median"`
	Max            int                 `json:"max"`
	Distribution   []RoundBucket       `json:"distribution"`
	StageDurations []StageDurationStat `json:"stageDurations"`
}

// CalendarEventType 日程事件类型
type CalendarEventType string

const (
	CalendarEventWrittenTest CalendarEventType = "writtenTest"
	CalendarEventInterview   CalendarEventType = "interview"
)

// CalendarEvent 日程事件（笔试或面试）
// ConflictGroupID > 0 表示该事件与同组其他事件时间重叠；0 表示无冲突
type CalendarEvent struct {
	ID              string            `json:"id"`
	ApplicationID   string            `json:"applicationId"`
	CompanyName     string            `json:"companyName"`
	TargetTitle     string            `json:"targetTitle"`
	EventType       CalendarEventType `json:"eventType"`
	Round           string            `json:"round,omitempty"`
	ScheduledAt     int64             `json:"scheduledAt"`
	ScheduledEnd    int64             `json:"scheduledEnd"`
	ConflictGroupID int               `json:"conflictGroupId"`
}

// CalendarResponse 日程视图响应
type CalendarResponse struct {
	Events    []CalendarEvent `json:"events"`
	Conflicts int             `json:"conflicts"`
}
