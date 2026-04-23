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
	ThemeColor    string                     `json:"themeColor"`
	StyleSettings ResumeStyleSettings        `json:"styleSettings"`
	Modules       []map[string]interface{}   `json:"modules"`
}

// ResumeStyleSettings 简历样式设置
type ResumeStyleSettings struct {
	FontFamily          string  `json:"fontFamily"`
	FontSize            float64 `json:"fontSize"`
	TextColor           string  `json:"textColor"`
	LineHeight          float64 `json:"lineHeight"`
	PagePaddingHorizontal float64 `json:"pagePaddingHorizontal"`
	PagePaddingVertical   float64 `json:"pagePaddingVertical"`
	ModuleSpacing       float64 `json:"moduleSpacing"`
	ParagraphSpacing    float64 `json:"paragraphSpacing"`
}

// ResumeDetail 简历详情（与前端 Resume 类型对齐）
type ResumeDetail struct {
	ID              string                 `json:"id"`
	Title           string                 `json:"title"`
	Locale          string                 `json:"locale"`
	Template        string                 `json:"template"`
	ThemeColor      string                 `json:"themeColor"`
	StyleSettings   ResumeStyleSettings    `json:"styleSettings"`
	Modules         []map[string]interface{} `json:"modules"`
	LatestVersionID *string                `json:"latestVersionId"`
	UpdatedAt       int64                  `json:"updatedAt"` // 前端期望时间戳
	CreatedAt       int64                  `json:"createdAt"` // 前端期望时间戳
}

// CreateResumeRequest 创建简历请求
type CreateResumeRequest struct {
	Title    string `json:"title" binding:"required,max=255"`
	Locale   string `json:"locale" binding:"max=10"`
	Template string `json:"template" binding:"max=50"`
	ThemeColor string `json:"themeColor"`
	StyleSettings *ResumeStyleSettings `json:"styleSettings"`
	Modules  []map[string]interface{} `json:"modules"`
}

// UpdateResumeRequest 更新简历请求
type UpdateResumeRequest struct {
	Title          string                 `json:"title" binding:"max=255"`
	ThemeColor     string                 `json:"themeColor"`
	StyleSettings  *ResumeStyleSettings   `json:"styleSettings"`
	Modules        []map[string]interface{} `json:"modules"`
	ClientUpdatedAt int64                  `json:"clientUpdatedAt"`
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