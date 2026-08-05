package model

import "time"

// JobPosting 招聘数据聚合表（来自腾讯文档智能表格）
type JobPosting struct {
	ID                  string     `json:"id"`
	Source              string     `json:"source"`
	SourceID            string     `json:"sourceId,omitempty"`
	CompanyName         string     `json:"companyName"`
	Industry            string     `json:"industry,omitempty"`
	IndustryCategory    string     `json:"industryCategory,omitempty"` // 归一化行业大类（筛选用）
	RecruitmentType     string     `json:"recruitmentType,omitempty"`
	RecruitmentCategory string     `json:"recruitmentCategory,omitempty"` // 归一化招聘类型大类（筛选用）
	OpenDate            *time.Time `json:"openDate,omitempty"`
	Location            string     `json:"location,omitempty"`
	Positions           string     `json:"positions,omitempty"`
	ApplicationURL      string     `json:"applicationUrl,omitempty"`
	ReferralCode        string     `json:"referralCode,omitempty"`
	Notes               string     `json:"notes,omitempty"`
	IsActive            bool       `json:"isActive"`
	CreatedAt           time.Time  `json:"createdAt"`
	UpdatedAt           time.Time  `json:"updatedAt"`
	ScrapedAt           time.Time  `json:"scrapedAt"`
	Applied             bool       `json:"applied"` // 当前用户是否已标记「已投递」；未登录时始终为 false
}

// JobPostingFilters 列表查询筛选条件
type JobPostingFilters struct {
	Industry        string
	RecruitmentType string
	Keyword         string
	Applied         string // ""(不筛选) | "true"(已投递) | "false"(未投递)
	Sort            string // "open_date_desc"(默认) | "open_date_asc"
	Page            int
	PageSize        int
	UserID          string // 当前登录用户 ID，用于关联/筛选投递标记；未登录为空
}

// JobPostingListResponse 列表响应
type JobPostingListResponse struct {
	Items      []JobPosting `json:"items"`
	Pagination Pagination   `json:"pagination"`
}

// JobPostingFiltersResponse 公开筛选枚举值
type JobPostingFiltersResponse struct {
	Industries []string `json:"industries"`
	Types      []string `json:"types"`
}

// SetJobPostingMarkRequest 标记 / 取消标记「已投递」请求体
type SetJobPostingMarkRequest struct {
	Applied bool `json:"applied"`
}

// SyncResult 一次同步的统计结果
type SyncResult struct {
	Total       int    `json:"total"`
	Inserted    int    `json:"inserted"`
	Updated     int    `json:"updated"`
	Deactivated int    `json:"deactivated"`
	Errors      int    `json:"errors"`
	Source      string `json:"source,omitempty"`
	StartedAt   string `json:"startedAt"`
	FinishedAt  string `json:"finishedAt"`
	DurationMs  int64  `json:"durationMs"`
}

// UpsertJobPostingsResult UpsertJobPostings 的返回结果：计数 + 本次真正新插入的岗位明细
// （InsertedItems 用于上层将新增岗位追加到 Redis「最近新增」列表，仅统计新插入，更新的不重复推送）
type UpsertJobPostingsResult struct {
	Total         int
	Inserted      int
	Updated       int
	InsertedItems []NewJobItem
}
