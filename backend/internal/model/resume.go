package model

import "encoding/json"

// ResumeListItem 简历列表项
type ResumeListItem struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Template  string `json:"template"`
	UpdatedAt int64  `json:"updatedAt"`
	CreatedAt int64  `json:"createdAt"`
}

// ResumeContent 简历内容结构
type ResumeContent struct {
	ThemeColor        string                   `json:"themeColor"`
	StyleSettings     ResumeStyleSettings      `json:"styleSettings"`
	Modules           []map[string]interface{} `json:"modules"`
	BasedOnSnapshotID *string                  `json:"basedOnSnapshotId,omitempty"`
}

// ResumeStyleSettings 简历样式设置
type ResumeStyleSettings struct {
	FontFamily               string  `json:"fontFamily"`
	FontSize                 float64 `json:"fontSize"`
	TextColor                string  `json:"textColor"`
	LineHeight               float64 `json:"lineHeight"`
	PagePaddingHorizontal    float64 `json:"pagePaddingHorizontal"`
	PagePaddingVertical      float64 `json:"pagePaddingVertical"`
	ModuleSpacing            float64 `json:"moduleSpacing"`
	ParagraphSpacing         float64 `json:"paragraphSpacing"`
	ModuleTitleLinePosition  string  `json:"moduleTitleLinePosition"`
	ModuleTitleMarkerStyle   string  `json:"moduleTitleMarkerStyle"`
	ModuleTitleMarkerVisible bool    `json:"moduleTitleMarkerVisible"`
}

// ResumeDetail 简历详情
type ResumeDetail struct {
	ID                string                     `json:"id"`
	Title             string                     `json:"title"`
	Locale            string                     `json:"locale"`
	Template          string                     `json:"template"`
	ThemeColor        string                     `json:"themeColor"`
	StyleSettings     ResumeStyleSettings        `json:"styleSettings"`
	Modules           []map[string]interface{}   `json:"modules"`
	LatestVersionID   *string                    `json:"latestVersionId"`
	LatestSnapshotID  *string                    `json:"latestSnapshotId,omitempty"`
	BasedOnSnapshotID *string                    `json:"basedOnSnapshotId,omitempty"`
	SnapshotDrafts    map[string]json.RawMessage `json:"snapshotDrafts,omitempty"`
	UpdatedAt         int64                      `json:"updatedAt"`
	CreatedAt         int64                      `json:"createdAt"`
}

// CreateResumeRequest 创建简历请求
type CreateResumeRequest struct {
	Title         string                   `json:"title" binding:"required,max=255"`
	Locale        string                   `json:"locale" binding:"max=10"`
	Template      string                   `json:"template" binding:"max=50"`
	ThemeColor    string                   `json:"themeColor"`
	StyleSettings *ResumeStyleSettings     `json:"styleSettings"`
	Modules       []map[string]interface{} `json:"modules"`
}

// UpdateResumeRequest 更新简历请求
type UpdateResumeRequest struct {
	Title             string                     `json:"title" binding:"max=255"`
	ThemeColor        string                     `json:"themeColor"`
	StyleSettings     *ResumeStyleSettings       `json:"styleSettings"`
	Modules           []map[string]interface{}   `json:"modules"`
	ClientUpdatedAt   int64                      `json:"clientUpdatedAt"`
	BasedOnSnapshotID *string                    `json:"basedOnSnapshotId,omitempty"`
	SnapshotDrafts    map[string]json.RawMessage `json:"snapshotDrafts,omitempty"`
}

// Pagination 分页信息
type Pagination struct {
	Page       int `json:"page"`
	PageSize   int `json:"pageSize"`
	Total      int `json:"total"`
	TotalPages int `json:"totalPages"`
}

// ResumeListResponse 简历列表响应
type ResumeListResponse struct {
	Items      []ResumeListItem `json:"items"`
	Pagination Pagination       `json:"pagination"`
}

// ResumeUpdateResponse 更新简历响应
type ResumeUpdateResponse struct {
	ID               string  `json:"id"`
	UpdatedAt        int64   `json:"updatedAt"`
	LatestVersionID  *string `json:"latestVersionId"`
	LatestSnapshotID *string `json:"latestSnapshotId,omitempty"`
}

// ---------- 版本快照相关类型 ----------

// SnapshotType 快照类型
type SnapshotType string

const (
	SnapshotTypeAuto    SnapshotType = "auto"
	SnapshotTypeManual  SnapshotType = "manual"
	SnapshotTypeDefault SnapshotType = "default"
)

// VersionSnapshot 版本快照
type VersionSnapshot struct {
	ID           string       `json:"id"`
	ResumeID     string       `json:"resumeId"`
	UserID       string       `json:"userId"`
	VersionNo    int          `json:"versionNo"`
	SnapshotType SnapshotType `json:"snapshotType"`
	Label        *string      `json:"label,omitempty"`
	JDContextID  *string      `json:"jdContextId,omitempty"`
	CreatedAt    int64        `json:"createdAt"`
	IsCurrent    bool         `json:"isCurrent"`
}

// SnapshotListItem 快照列表项
type SnapshotListItem struct {
	ID           string       `json:"id"`
	VersionNo    int          `json:"versionNo"`
	SnapshotType SnapshotType `json:"snapshotType"`
	Label        *string      `json:"label,omitempty"`
	CreatedAt    int64        `json:"createdAt"`
	IsCurrent    bool         `json:"isCurrent"`
}

// CreateSnapshotRequest 创建手动快照
type CreateSnapshotRequest struct {
	Label string `json:"label" binding:"required,max=100"`
}

// UpdateSnapshotRequest 更新快照标签
type UpdateSnapshotRequest struct {
	Label string `json:"label" binding:"required,max=100"`
}

// SnapshotListResponse 快照列表响应
type SnapshotListResponse struct {
	Items   []SnapshotListItem `json:"items"`
	Total   int                `json:"total"`
	HasMore bool               `json:"hasMore"`
}

// DiffResult 快照对比结果
type DiffResult struct {
	SnapshotA SnapshotBrief `json:"snapshotA"`
	SnapshotB SnapshotBrief `json:"snapshotB"`
	Diffs     []FieldDiff   `json:"diffs"`
	Stats     DiffStats     `json:"stats"`
}

// SnapshotBrief 快照简要信息
type SnapshotBrief struct {
	ID        string  `json:"id"`
	VersionNo int     `json:"versionNo"`
	Label     *string `json:"label,omitempty"`
	CreatedAt int64   `json:"createdAt"`
}

// FieldDiff 字段级差异
type FieldDiff struct {
	ModuleType       string `json:"moduleType"`
	ModuleInstanceID string `json:"moduleInstanceId"`
	Field            string `json:"field"`
	Before           string `json:"before"`
	After            string `json:"after"`
}

// DiffStats 对比统计
type DiffStats struct {
	ModulesAdded    int `json:"modulesAdded"`
	ModulesRemoved  int `json:"modulesRemoved"`
	ModulesModified int `json:"modulesModified"`
	FieldsChanged   int `json:"fieldsChanged"`
}

// DiffSnapshotsRequest 对比请求
type DiffSnapshotsRequest struct {
	SnapshotAID       string                   `json:"snapshotAId" binding:"required"`
	SnapshotBID       string                   `json:"snapshotBId" binding:"required"`
	CurrentModules    []map[string]interface{} `json:"currentModules,omitempty"`
	ComparisonModules []map[string]interface{} `json:"comparisonModules,omitempty"`
}

// ============ 分享链接 ============

// ShareLink 分享链接
type ShareLink struct {
	ID         string  `json:"id"`
	ResumeID   string  `json:"resumeId"`
	Token      string  `json:"token"`
	CreatedBy  string  `json:"createdBy"`
	SnapshotID *string `json:"snapshotId,omitempty"`
	ExpiresAt  *int64  `json:"expiresAt,omitempty"`
	ViewCount  int     `json:"viewCount"`
	IsActive   bool    `json:"isActive"`
	CreatedAt  int64   `json:"createdAt"`
	ShareURL   string  `json:"shareUrl,omitempty"`
}

// ShareComment 分享评论
type ShareComment struct {
	ID         string  `json:"id"`
	ShareID    string  `json:"shareId"`
	SnapshotID *string `json:"snapshotId,omitempty"`
	VisitorID  string  `json:"-"`
	AuthorName string  `json:"authorName"`
	Content    string  `json:"content"`
	ModuleID   string  `json:"moduleId"`
	ItemIndex  int     `json:"itemIndex"`
	CreatedAt  int64   `json:"createdAt"`
}

// CreateShareRequest 创建分享请求
type CreateShareRequest struct {
	ResumeID   string `json:"resumeId" binding:"required"`
	SnapshotID string `json:"snapshotId,omitempty"`
	ExpiresIn  int    `json:"expiresIn"`
}

// AddCommentRequest 添加评论请求
type AddCommentRequest struct {
	AuthorName string  `json:"authorName"`
	Content    string  `json:"content" binding:"required"`
	ModuleID   string  `json:"moduleId"`
	ItemIndex  int     `json:"itemIndex"`
	VisitorID  string  `json:"visitorId"`
	SnapshotID *string `json:"snapshotId,omitempty"`
}

// ShareResumeView 分享页简历数据
type ShareResumeView struct {
	Title            string                   `json:"title"`
	Locale           string                   `json:"locale"`
	ThemeColor       string                   `json:"themeColor"`
	Modules          []map[string]interface{} `json:"modules"`
	LatestSnapshotID *string                  `json:"latestSnapshotId,omitempty"`
	ShareInfo        *ShareLink               `json:"shareInfo"`
	Comments         []ShareComment           `json:"comments"`
}

// AIAnalysisRequest AI 分析请求
type AIAnalysisRequest struct {
	Token string `json:"token" binding:"required"`
}

// AIAnalysisResponse AI 分析响应
type AIAnalysisResponse struct {
	Summary     string   `json:"summary"`
	Strengths   []string `json:"strengths"`
	Weaknesses  []string `json:"weaknesses"`
	Suggestions []string `json:"suggestions"`
}

// RequirementDocRequest 需求文档生成请求
type RequirementDocRequest struct {
	Token string `json:"token" binding:"required"`
}

// ============ 管理员评论视图 ============

// AdminCommentItem 管理员视角的单条评论
type AdminCommentItem struct {
	ID            string  `json:"id"`
	ShareToken    string  `json:"shareToken"`
	VisitorID     string  `json:"visitorId"`
	AuthorName    string  `json:"authorName"`
	Content       string  `json:"content"`
	ModuleID      string  `json:"moduleId"`
	ModuleTitle   string  `json:"moduleTitle"`
	ItemIndex     int     `json:"itemIndex"`
	ItemLabel     string  `json:"itemLabel"`
	SnapshotID    *string `json:"snapshotId,omitempty"`
	SnapshotLabel *string `json:"snapshotLabel,omitempty"`
	CreatedAt     int64   `json:"createdAt"`
}

// ModuleCommentSummary 模块评论汇总
type ModuleCommentSummary struct {
	ModuleID     string `json:"moduleId"`
	ModuleTitle  string `json:"moduleTitle"`
	CommentCount int    `json:"commentCount"`
	VisitorCount int    `json:"visitorCount"`
}

// AdminCommentsSummary 统计信息
type AdminCommentsSummary struct {
	TotalComments   int                    `json:"totalComments"`
	TotalVisitors   int                    `json:"totalVisitors"`
	ModuleBreakdown []ModuleCommentSummary `json:"moduleBreakdown"`
}

// AdminCommentsResponse 管理员评论总览响应
type AdminCommentsResponse struct {
	Items   []AdminCommentItem   `json:"items"`
	Summary AdminCommentsSummary `json:"summary"`
}
