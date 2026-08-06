package home

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	"resumecraft-pdf-backend/internal/model"
	aiservice "resumecraft-pdf-backend/internal/service/ai"
	githubStorage "resumecraft-pdf-backend/internal/storage/github"
	homeStorage "resumecraft-pdf-backend/internal/storage/home"
	newsStorage "resumecraft-pdf-backend/internal/storage/news"
)

// 新闻摘要最大截断长度（字符）
const maxNewsSummaryLen = 500

// 新闻源列表：官方博客 / 权威媒体 RSS（单源失败不影响其他源）
var newsSources = []struct {
	Name string
	URL  string
}{
	{Name: "OpenAI", URL: "https://openai.com/news/rss.xml"},
	{Name: "DeepMind", URL: "https://deepmind.google/blog/rss.xml"},
	{Name: "36氪", URL: "https://36kr.com/feed"},
	{Name: "量子位", URL: "https://www.qbitai.com/feed"},
	{Name: "虎嗅", URL: "https://rss.huxiu.com/"},
}

// Service 首页聚合服务：待办 + AI 新闻 + GitHub 项目 + 日报 + 项目推荐 + 新岗位
type Service interface {
	ListTodos(ctx context.Context, userID string) ([]model.TodoItem, error)
	ListNews(ctx context.Context, days, limit int) ([]model.AiNewsItem, error)
	// ListGithubProjects 返回近 7 天 GitHub 项目（按同步日期分组倒序）
	ListGithubProjects(ctx context.Context, days int) ([]model.GithubGroup, error)
	// GetDailyReports 返回近 days 天日报（按日期倒序）
	GetDailyReports(ctx context.Context, days int) ([]model.AiDailyReport, error)
	// ListProjects 返回近 7 天简历项目推荐（按更新时间日期分组倒序）
	ListProjects(ctx context.Context, days int) ([]model.ProjectGroup, error)
	// ListNewJobs 返回最近 days 天新增岗位
	ListNewJobs(ctx context.Context, days, limit int) ([]model.NewJobItem, error)
	// GenerateDailyReport 聚合最近 24 小时新闻生成当日日报并入库；当日已存在则覆盖
	GenerateDailyReport(ctx context.Context) (*model.AiDailyReport, error)
	// SyncNews 抓取全部新闻源并入库，返回结果统计
	SyncNews(ctx context.Context) (*model.SyncResult, error)
	// SyncGithubProjects 抓取 GitHub 最新 AI 项目并入库
	SyncGithubProjects(ctx context.Context) (*model.SyncResult, error)
}

type service struct {
	todoRepo      homeStorage.TodoRepository
	newsRepo      newsStorage.Repository
	githubRepo    githubStorage.Repository
	reportRepo    homeStorage.ReportRepository
	projectRepo   homeStorage.ProjectRepository
	snapshotRepo  homeStorage.SnapshotRepository
	newJobRepo    homeStorage.NewJobRepository
	client        *http.Client
	githubAPIBase string // GitHub Search API 基地址（测试可覆盖）
	// 系统级 AI 凭证（.env 配置，服务端内置）：用于首页日报/项目推荐一次生成
	aiAPIKey  string
	aiBaseURL string
	aiModel   string
}

func NewService(
	todoRepo homeStorage.TodoRepository,
	newsRepo newsStorage.Repository,
	githubRepo githubStorage.Repository,
	reportRepo homeStorage.ReportRepository,
	projectRepo homeStorage.ProjectRepository,
	snapshotRepo homeStorage.SnapshotRepository,
	newJobRepo homeStorage.NewJobRepository,
	aiAPIKey, aiBaseURL, aiModel string,
) Service {
	return &service{
		todoRepo:      todoRepo,
		newsRepo:      newsRepo,
		githubRepo:    githubRepo,
		reportRepo:    reportRepo,
		projectRepo:   projectRepo,
		snapshotRepo:  snapshotRepo,
		newJobRepo:    newJobRepo,
		client:        &http.Client{Timeout: 20 * time.Second},
		githubAPIBase: "https://api.github.com",
		aiAPIKey:      aiAPIKey,
		aiBaseURL:     aiBaseURL,
		aiModel:       aiModel,
	}
}

func (s *service) ListTodos(ctx context.Context, userID string) ([]model.TodoItem, error) {
	return s.todoRepo.ListTodos(ctx, userID)
}

func (s *service) ListNews(ctx context.Context, days, limit int) ([]model.AiNewsItem, error) {
	return s.newsRepo.ListRecent(ctx, days, limit)
}

func (s *service) ListGithubProjects(ctx context.Context, days int) ([]model.GithubGroup, error) {
	if days <= 0 {
		days = 7
	}
	snapshots, err := s.snapshotRepo.ListRecent(ctx, "github_sync_snapshots", days)
	if err != nil {
		// 快照缺失时回退主表近 7 天
		log.Printf("[home] github snapshots unavailable, fallback to main table: %v", err)
		items, err := s.githubRepo.ListRecent(ctx, days, 30)
		if err != nil {
			return nil, err
		}
		if len(items) == 0 {
			return []model.GithubGroup{}, nil
		}
		date := time.UnixMilli(items[0].SyncedAt).Format("2006-01-02")
		return []model.GithubGroup{{Date: date, Items: items}}, nil
	}

	groups := make([]model.GithubGroup, 0, len(snapshots))
	for _, snap := range snapshots {
		var items []model.GithubProjectItem
		if err := json.Unmarshal(snap.Data, &items); err != nil {
			log.Printf("[home] unmarshal github snapshot %s: %v", snap.Date, err)
			continue
		}
		groups = append(groups, model.GithubGroup{Date: snap.Date, Items: items})
	}
	if groups == nil {
		groups = []model.GithubGroup{}
	}
	return groups, nil
}

func (s *service) GetDailyReports(ctx context.Context, days int) ([]model.AiDailyReport, error) {
	if days <= 0 {
		days = 7
	}
	return s.reportRepo.ListRecent(ctx, days)
}

func (s *service) ListProjects(ctx context.Context, days int) ([]model.ProjectGroup, error) {
	if days <= 0 {
		days = 7
	}
	snapshots, err := s.snapshotRepo.ListRecent(ctx, "resume_project_snapshots", days)
	if err != nil {
		log.Printf("[home] project snapshots unavailable, fallback to main table: %v", err)
		items, err := s.projectRepo.ListActive(ctx)
		if err != nil {
			return nil, err
		}
		grouped := groupProjectsByDate(items)
		return grouped, nil
	}

	groups := make([]model.ProjectGroup, 0, len(snapshots))
	for _, snap := range snapshots {
		var items []model.ResumeProject
		if err := json.Unmarshal(snap.Data, &items); err != nil {
			log.Printf("[home] unmarshal project snapshot %s: %v", snap.Date, err)
			continue
		}
		groups = append(groups, model.ProjectGroup{Date: snap.Date, Items: items})
	}
	if groups == nil {
		groups = []model.ProjectGroup{}
	}
	return groups, nil
}

// groupProjectsByDate 将项目按更新时间归入日期分组（倒序）
func groupProjectsByDate(items []model.ResumeProject) []model.ProjectGroup {
	byDate := make(map[string][]model.ResumeProject)
	order := make([]string, 0, 8)
	for _, p := range items {
		var date string
		if p.UpdatedAt > 0 {
			date = time.UnixMilli(p.UpdatedAt).Format("2006-01-02")
		} else {
			date = time.Now().Format("2006-01-02")
		}
		if _, ok := byDate[date]; !ok {
			order = append(order, date)
		}
		byDate[date] = append(byDate[date], p)
	}
	// 日期倒序
	sort.Sort(sort.Reverse(sort.StringSlice(order)))
	groups := make([]model.ProjectGroup, 0, len(order))
	for _, d := range order {
		groups = append(groups, model.ProjectGroup{Date: d, Items: byDate[d]})
	}
	return groups
}

// ListNewJobs 首页「最近新增岗位」：优先读取 Redis 最近列表（LPUSH 头插，读取最多 10 条），
// Redis 未启用或列表为空时回退到 job_postings 主表按 days/limit 查询。
func (s *service) ListNewJobs(ctx context.Context, days, limit int) ([]model.NewJobItem, error) {
	items, err := s.newJobRepo.ListRecent(ctx)
	if err != nil {
		log.Printf("[home] read recent new jobs from redis failed, fallback to db: %v", err)
	} else if len(items) > 0 {
		return items, nil
	}
	return s.newJobRepo.ListAddedRecently(ctx, days, limit)
}

// 日报资讯数量上限
const dailyReportMaxItems = 8

// GenerateDailyReport 生成当日日报并入库（当日已存在则覆盖）。
// 优先使用系统级（.env）AI 凭证一次调用生成日报 + 项目推荐；
// 未配置或调用失败时回退为规则聚合最近 24h 新闻。
func (s *service) GenerateDailyReport(ctx context.Context) (*model.AiDailyReport, error) {
	if strings.TrimSpace(s.aiAPIKey) != "" && strings.TrimSpace(s.aiBaseURL) != "" && strings.TrimSpace(s.aiModel) != "" {
		if report, err := s.generateWithAI(ctx); err == nil && report != nil {
			return report, nil
		} else if err != nil {
			log.Printf("[home] AI daily report generation failed, fallback to rule-based: %v", err)
		}
	}
	return s.generateRuleBased(ctx)
}

// generateWithAI 调用系统级 AI 一次生成日报与项目推荐并分别入库。
func (s *service) generateWithAI(ctx context.Context) (*model.AiDailyReport, error) {
	content, err := aiservice.GenerateHomeContent(ctx, s.aiAPIKey, s.aiBaseURL, s.aiModel)
	if err != nil {
		return nil, err
	}
	if content == nil || content.Report == nil {
		return nil, fmt.Errorf("empty AI home content")
	}

	// 项目推荐入库（按 name 幂等覆盖）
	if len(content.Project) > 0 {
		projects := make([]model.ResumeProject, 0, len(content.Project))
		for i, p := range content.Project {
			projects = append(projects, model.ResumeProject{
				Name:          p.Name,
				Tagline:       p.Tagline,
				TechStack:     p.TechStack,
				Modules:       p.Modules,
				ST:            p.ST,
				A:             p.A,
				R:             p.R,
				Duration:      p.Duration,
				Difficulty:    p.Difficulty,
				TrendRelation: p.TrendRelation,
				SortOrder:     i,
			})
		}
		if _, err := s.projectRepo.UpsertAll(ctx, projects); err != nil {
			log.Printf("[home] AI projects upsert failed: %v", err)
		}
		// 写入当日项目快照（按日期覆盖，支撑近 7 天展示）：
		// 用主表当天更新的完整数据（含 id/updatedAt），保证前端能显示更新时间与稳定 key
		today := time.Now().Format("2006-01-02")
		if updated, err := s.projectRepo.ListUpdatedOn(ctx, today); err == nil && len(updated) > 0 {
			if raw, err := json.Marshal(updated); err == nil {
				if err := s.snapshotRepo.UpsertDaily(ctx, "resume_project_snapshots", today, raw); err != nil {
					log.Printf("[home] project snapshot upsert failed: %v", err)
				}
			} else {
				log.Printf("[home] project snapshot marshal failed: %v", err)
			}
		} else if err != nil {
			log.Printf("[home] list updated projects failed: %v", err)
		}
	}

	// 日报入库
	report := &model.AiDailyReport{
		ReportDate:    time.Now().Format("2006-01-02"),
		Title:         content.Report.Title,
		Theme:         content.Report.Theme,
		TrendKeywords: content.Report.TrendKeywords,
		Items:         make([]model.AiDailyReportItem, 0, len(content.Report.Items)),
	}
	for _, it := range content.Report.Items {
		report.Items = append(report.Items, model.AiDailyReportItem{
			Rank:        it.Rank,
			Title:       it.Title,
			URL:         it.URL,
			Source:      it.Source,
			PublishedAt: it.PublishedAt,
			Rating:      it.Rating,
			Summary:     it.Summary,
			Insight:     it.Insight,
		})
	}
	if _, err := s.reportRepo.Upsert(ctx, *report); err != nil {
		return nil, err
	}
	return report, nil
}

// generateRuleBased 回退方案：聚合最近 24 小时入库的新闻生成当日日报。
func (s *service) generateRuleBased(ctx context.Context) (*model.AiDailyReport, error) {
	since := time.Now().Add(-24 * time.Hour)
	newsItems, err := s.newsRepo.ListSince(ctx, since, dailyReportMaxItems)
	if err != nil {
		return nil, fmt.Errorf("list news for report: %w", err)
	}

	now := time.Now()
	report := &model.AiDailyReport{
		ReportDate:    now.Format("2006-01-02"),
		Title:         fmt.Sprintf("AI 日报 · %s", now.Format("2006-01-02")),
		Theme:         "每日精选 · 自动聚合",
		TrendKeywords: []string{},
		Items:         make([]model.AiDailyReportItem, 0, len(newsItems)),
	}
	for i, n := range newsItems {
		report.Items = append(report.Items, model.AiDailyReportItem{
			Rank:        i + 1,
			Title:       n.Title,
			URL:         n.URL,
			Source:      n.Source,
			PublishedAt: time.UnixMilli(n.PublishedAt).Format("2006-01-02"),
			Rating:      3, // 自动聚合时中性评级，人工精选的种子数据带更细评级
			Summary:     n.Summary,
			Insight:     "",
		})
	}

	if _, err := s.reportRepo.Upsert(ctx, *report); err != nil {
		return nil, err
	}
	return report, nil
}

// ============================================================
// AI 新闻同步
// ============================================================

func (s *service) SyncNews(ctx context.Context) (*model.SyncResult, error) {
	started := time.Now()
	result := &model.SyncResult{Source: "ai_news", StartedAt: started.Format(time.RFC3339)}

	for _, source := range newsSources {
		items, err := s.fetchFeed(ctx, source.Name, source.URL)
		if err != nil {
			result.Errors++
			log.Printf("[news] fetch %s failed: %v", source.URL, err)
			continue
		}
		if len(items) == 0 {
			continue
		}
		inserted, err := s.newsRepo.Upsert(ctx, items)
		if err != nil {
			result.Errors++
			log.Printf("[news] upsert %s failed: %v", source.Name, err)
			continue
		}
		result.Total += len(items)
		result.Inserted += inserted
	}

	result.FinishedAt = time.Now().Format(time.RFC3339)
	result.DurationMs = time.Since(started).Milliseconds()
	return result, nil
}

// RSS 2.0 与 Atom 1.0 兼容结构
type rssFeed struct {
	Channel struct {
		Title string    `xml:"title"`
		Items []rssItem `xml:"item"`
	} `xml:"channel"`
}
type rssItem struct {
	Title       string `xml:"title"`
	Link        string `xml:"link"`
	PubDate     string `xml:"pubDate"`
	Description string `xml:"description"`
}

type atomFeed struct {
	Title   string      `xml:"title"`
	Entries []atomEntry `xml:"entry"`
}
type atomEntry struct {
	Title     string     `xml:"title"`
	Links     []atomLink `xml:"link"`
	Updated   string     `xml:"updated"`
	Published string     `xml:"published"`
	Summary   string     `xml:"summary"`
}
type atomLink struct {
	Href string `xml:"href,attr"`
}

func (s *service) fetchFeed(ctx context.Context, sourceName, url string) ([]model.AiNewsItem, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "ResumeCraft-Home/1.0")
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20)) // 4MB 上限
	if err != nil {
		return nil, err
	}

	items := make([]model.AiNewsItem, 0, 30)
	// 先按 RSS 2.0 解析，失败或空则按 Atom
	var rss rssFeed
	if err := xml.Unmarshal(body, &rss); err == nil && len(rss.Channel.Items) > 0 {
		for _, it := range rss.Channel.Items {
			publishedAt, ok := parseFeedTime(it.PubDate)
			if !ok {
				continue
			}
			items = append(items, model.AiNewsItem{
				Title:       strings.TrimSpace(it.Title),
				URL:         strings.TrimSpace(it.Link),
				Source:      sourceName,
				Summary:     truncate(stripHTML(it.Description), maxNewsSummaryLen),
				PublishedAt: publishedAt.UnixMilli(),
			})
		}
		return items, nil
	}

	var atom atomFeed
	if err := xml.Unmarshal(body, &atom); err != nil || len(atom.Entries) == 0 {
		return nil, fmt.Errorf("unrecognized feed format")
	}
	for _, e := range atom.Entries {
		link := ""
		for _, l := range e.Links {
			if l.Href != "" {
				link = l.Href
				break
			}
		}
		ts := e.Published
		if ts == "" {
			ts = e.Updated
		}
		publishedAt, ok := parseFeedTime(ts)
		if !ok {
			continue
		}
		items = append(items, model.AiNewsItem{
			Title:       strings.TrimSpace(e.Title),
			URL:         strings.TrimSpace(link),
			Source:      sourceName,
			Summary:     truncate(stripHTML(e.Summary), maxNewsSummaryLen),
			PublishedAt: publishedAt.UnixMilli(),
		})
	}
	return items, nil
}

// parseFeedTime 兼容 RSS（RFC1123Z）与 Atom（RFC3339）时间格式
func parseFeedTime(raw string) (time.Time, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{time.RFC1123Z, time.RFC1123, time.RFC3339, "2006-01-02T15:04:05-07:00", "2006-01-02 15:04:05"} {
		if t, err := time.Parse(layout, raw); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

// stripHTML 去除摘要中的 HTML 标签
func stripHTML(raw string) string {
	var sb strings.Builder
	inTag := false
	for _, r := range raw {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
		case !inTag:
			sb.WriteRune(r)
		}
	}
	return strings.TrimSpace(sb.String())
}

func truncate(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n]) + "…"
}

// ============================================================
// GitHub 项目同步
// ============================================================

// githubSearchResponse GitHub Search API 响应子集
type githubSearchResponse struct {
	Items []struct {
		FullName        string   `json:"full_name"`
		HtmlURL         string   `json:"html_url"`
		Description     string   `json:"description"`
		Language        string   `json:"language"`
		StargazersCount int      `json:"stargazers_count"`
		ForksCount      int      `json:"forks_count"`
		Topics          []string `json:"topics"`
	} `json:"items"`
}

func (s *service) SyncGithubProjects(ctx context.Context) (*model.SyncResult, error) {
	started := time.Now()
	result := &model.SyncResult{Source: "github_projects", StartedAt: started.Format(time.RFC3339)}

	// 最近 7 天创建的 AI 相关仓库，按 star 排序
	since := time.Now().AddDate(0, 0, -7).Format("2006-01-02")
	url := fmt.Sprintf("%s/search/repositories?q=ai+created:>%s&sort=stars&order=desc&per_page=30", s.githubAPIBase, since)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		result.Errors = 1
		result.FinishedAt = time.Now().Format(time.RFC3339)
		result.DurationMs = time.Since(started).Milliseconds()
		return result, err
	}
	req.Header.Set("User-Agent", "ResumeCraft-Home/1.0")
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := s.client.Do(req)
	if err != nil {
		result.Errors = 1
		result.FinishedAt = time.Now().Format(time.RFC3339)
		result.DurationMs = time.Since(started).Milliseconds()
		return result, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		result.Errors = 1
		result.FinishedAt = time.Now().Format(time.RFC3339)
		result.DurationMs = time.Since(started).Milliseconds()
		return result, fmt.Errorf("github api status %d", resp.StatusCode)
	}

	var payload githubSearchResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&payload); err != nil {
		result.Errors = 1
		result.FinishedAt = time.Now().Format(time.RFC3339)
		result.DurationMs = time.Since(started).Milliseconds()
		return result, err
	}

	items := make([]model.GithubProjectItem, 0, len(payload.Items))
	for _, it := range payload.Items {
		items = append(items, model.GithubProjectItem{
			FullName:    it.FullName,
			HtmlURL:     it.HtmlURL,
			Description: truncate(it.Description, maxNewsSummaryLen),
			Language:    it.Language,
			Stars:       it.StargazersCount,
			Forks:       it.ForksCount,
			Topics:      it.Topics,
		})
	}

	inserted, updated, err := s.githubRepo.Upsert(ctx, items)
	if err != nil {
		result.Errors = 1
		result.FinishedAt = time.Now().Format(time.RFC3339)
		result.DurationMs = time.Since(started).Milliseconds()
		return result, err
	}

	// 中文加工：系统级 AI 一次批量调用，把英文项目简介转为中文一句话简介 + 求职视角亮点点评。
	// 未配置 AI 或调用失败仅记录日志，不影响本次同步已完成的入库结果。
	s.translateGithubProjectsZh(ctx, items)

	// 写入当日同步快照（按日期覆盖，支撑近 7 天分组展示）
	if raw, err := json.Marshal(items); err == nil {
		if err := s.snapshotRepo.UpsertDaily(ctx, "github_sync_snapshots", time.Now().Format("2006-01-02"), raw); err != nil {
			log.Printf("[home] github snapshot upsert failed: %v", err)
		}
	} else {
		log.Printf("[home] github snapshot marshal failed: %v", err)
	}

	result.Total = len(items)
	result.Inserted = inserted
	result.Updated = updated
	result.FinishedAt = time.Now().Format(time.RFC3339)
	result.DurationMs = time.Since(started).Milliseconds()
	return result, nil
}

// translateGithubProjectsZh 批量调用系统级 AI 将本次同步的项目简介加工为中文，
// 成功后回写数据库（供后续 ListTop/ListRecent 直接读出中文字段）。
// 未配置 AI 凭证或调用失败时仅记录日志并返回，不向上抛错（同步主流程已完成）。
func (s *service) translateGithubProjectsZh(ctx context.Context, items []model.GithubProjectItem) {
	if strings.TrimSpace(s.aiAPIKey) == "" || strings.TrimSpace(s.aiBaseURL) == "" || strings.TrimSpace(s.aiModel) == "" {
		return
	}
	if len(items) == 0 {
		return
	}
	inputs := make([]aiservice.GithubProjectZhInput, 0, len(items))
	for _, it := range items {
		inputs = append(inputs, aiservice.GithubProjectZhInput{
			FullName:    it.FullName,
			Description: it.Description,
			Language:    it.Language,
			Topics:      it.Topics,
		})
	}
	results, err := aiservice.TranslateGithubProjects(ctx, s.aiAPIKey, s.aiBaseURL, s.aiModel, inputs)
	if err != nil {
		log.Printf("[home] github projects zh translate failed: %v", err)
		return
	}
	for _, r := range results {
		if err := s.githubRepo.UpdateZhContent(ctx, r.FullName, r.SummaryZh, r.HighlightZh); err != nil {
			log.Printf("[home] github project %s zh content update failed: %v", r.FullName, err)
		}
	}
}
