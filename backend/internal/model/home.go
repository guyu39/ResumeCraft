package model

// ============================================================
// 首页工作台模型：待办（笔面试）+ AI 新闻 + GitHub 开源项目
// ============================================================

// TodoType 待办类型
type TodoType string

const (
	TodoTypeInterview   TodoType = "interview"    // 面试
	TodoTypeWrittenTest TodoType = "written_test" // 笔试
)

// TodoItem 首页待办：聚合投递的笔试（written_test_at）与面试（interviews.scheduled_at）
type TodoItem struct {
	ID             string `json:"id"` // 唯一键：interview-{id} / test-{id}
	Type           string `json:"type"`
	ApplicationID  string `json:"applicationId"`
	CompanyName    string `json:"companyName"`
	TargetTitle    string `json:"targetTitle"`
	Department     string `json:"department,omitempty"`
	Round          string `json:"round,omitempty"`
	ScheduledAt    int64  `json:"scheduledAt"`
	ScheduledEnd   *int64 `json:"scheduledEnd,omitempty"`
	Status         string `json:"status"` // 应用状态（interview / written_test / offer / rejected ...）
	ApplicationURL string `json:"applicationUrl,omitempty"`
}

// AiNewsItem AI 新闻条目
type AiNewsItem struct {
	ID          int64  `json:"id"`
	Title       string `json:"title"`
	URL         string `json:"url"`
	Source      string `json:"source"`
	Summary     string `json:"summary"`
	PublishedAt int64  `json:"publishedAt"` // unix 毫秒
}

// GithubProjectItem GitHub 开源项目
type GithubProjectItem struct {
	ID          int64  `json:"id"`
	FullName    string `json:"fullName"`
	HtmlURL     string `json:"htmlUrl"`
	Description string `json:"description"`
	// SummaryZh AI 中文加工后的一句话简介（未配置系统级 AI 或加工失败时为空，前端回退展示 Description）
	SummaryZh string `json:"summaryZh,omitempty"`
	// HighlightZh AI 生成的中文亮点点评（面向求职者：为什么值得关注/可参考）
	HighlightZh string   `json:"highlightZh,omitempty"`
	Language    string   `json:"language"`
	Stars       int      `json:"stars"`
	Forks       int      `json:"forks"`
	Topics      []string `json:"topics,omitempty"`
	SyncedAt    int64    `json:"syncedAt"` // unix 毫秒
}

// GithubGroup 按同步日期分组的 GitHub 项目
type GithubGroup struct {
	Date  string              `json:"date"` // YYYY-MM-DD
	Items []GithubProjectItem `json:"items"`
}

// ProjectGroup 按更新时间日期分组的简历项目推荐
type ProjectGroup struct {
	Date  string          `json:"date"` // YYYY-MM-DD
	Items []ResumeProject `json:"items"`
}

// AiDailyReportItem 日报中的单条资讯
type AiDailyReportItem struct {
	Rank        int    `json:"rank"`
	Title       string `json:"title"`
	URL         string `json:"url,omitempty"` // 原始链接
	Source      string `json:"source"`
	PublishedAt string `json:"publishedAt"` // 日期字符串（YYYY-MM-DD）
	Rating      int    `json:"rating"`      // 影响力评级 1-5
	Summary     string `json:"summary"`
	Insight     string `json:"insight"` // 对开发者的启示
}

// AiDailyReport 每日 AI 日报（items 为 JSONB，读取时解析）
type AiDailyReport struct {
	ID            int64               `json:"id"`
	ReportDate    string              `json:"reportDate"` // YYYY-MM-DD
	Title         string              `json:"title"`
	Theme         string              `json:"theme"`
	TrendKeywords []string            `json:"trendKeywords"`
	Items         []AiDailyReportItem `json:"items"`
	CreatedAt     int64               `json:"createdAt"`
}

// ResumeProject 简历项目推荐
type ResumeProject struct {
	ID            int64    `json:"id"`
	Name          string   `json:"name"`
	Tagline       string   `json:"tagline"`
	TechStack     []string `json:"techStack"`
	Modules       []string `json:"modules"`
	StarSummary   string   `json:"starSummary"`
	ST            string   `json:"st,omitempty"` // STAR 情境/任务（AI 生成分段）
	A             string   `json:"a,omitempty"`  // 行动
	R             string   `json:"r,omitempty"`  // 结果
	Duration      string   `json:"duration"`
	Difficulty    int      `json:"difficulty"` // 1-5
	TrendRelation string   `json:"trendRelation"`
	SortOrder     int      `json:"sortOrder"`
	UpdatedAt     int64    `json:"updatedAt,omitempty"` // 更新时间（ms）
}

// NewJobItem 首页昨日新增岗位（精简自 job_postings）
type NewJobItem struct {
	ID              string `json:"id"`
	CompanyName     string `json:"companyName"`
	RecruitmentType string `json:"recruitmentType,omitempty"`
	Location        string `json:"location,omitempty"`
	Positions       string `json:"positions,omitempty"`
	OpenDate        *int64 `json:"openDate,omitempty"`
	ApplicationURL  string `json:"applicationUrl,omitempty"`
	Source          string `json:"source,omitempty"`
}
