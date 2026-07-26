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
}

// JobPostingFilters 列表查询筛选条件
type JobPostingFilters struct {
	Industry        string
	RecruitmentType string
	Keyword         string
	Sort            string // "open_date_desc"(默认) | "open_date_asc"
	Page            int
	PageSize        int
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
