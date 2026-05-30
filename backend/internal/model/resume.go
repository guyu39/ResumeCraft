package model

// ResumeListItem 简历列表项
type ResumeListItem struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Template  string `json:"template"`
	UpdatedAt int64  `json:"updatedAt"` // 前端期望时间戳
	CreatedAt int64  `json:"createdAt"` // 前端期望时间戳
}

// ResumeContent 简历内容结构（内部使用）
type ResumeContent struct {
	ThemeColor    string                   `json:"themeColor"`
	StyleSettings ResumeStyleSettings      `json:"styleSettings"`
	Modules       []map[string]interface{} `json:"modules"`
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

// ResumeDetail 简历详情（与前端 Resume 类型对齐）
type ResumeDetail struct {
	ID              string                   `json:"id"`
	Title           string                   `json:"title"`
	Locale          string                   `json:"locale"`
	Template        string                   `json:"template"`
	ThemeColor      string                   `json:"themeColor"`
	StyleSettings   ResumeStyleSettings      `json:"styleSettings"`
	Modules         []map[string]interface{} `json:"modules"`
	LatestVersionID *string                  `json:"latestVersionId"`
	UpdatedAt       int64                    `json:"updatedAt"` // 前端期望时间戳
	CreatedAt       int64                    `json:"createdAt"` // 前端期望时间戳
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
	Title           string                   `json:"title" binding:"max=255"`
	ThemeColor      string                   `json:"themeColor"`
	StyleSettings   *ResumeStyleSettings     `json:"styleSettings"`
	Modules         []map[string]interface{} `json:"modules"`
	ClientUpdatedAt int64                    `json:"clientUpdatedAt"`
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
	ID              string  `json:"id"`
	UpdatedAt       int64   `json:"updatedAt"`
	LatestVersionID *string `json:"latestVersionId"`
}

// ---------- 版本快照相关类型 ----------

// SnapshotType 快照类型
type SnapshotType string

const (
	SnapshotTypeAuto   SnapshotType = "auto"
	SnapshotTypeManual SnapshotType = "manual"
)

// VersionSnapshot 版本快照（列表视图）
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

// SnapshotListItem 快照列表项（简化版，时间轴用）
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
	SnapshotAID string `json:"snapshotAId" binding:"required"`
	SnapshotBID string `json:"snapshotBId" binding:"required"`
}
