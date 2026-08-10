package home

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"resumecraft-pdf-backend/internal/model"
	aiservice "resumecraft-pdf-backend/internal/service/ai"
	aihotStorage "resumecraft-pdf-backend/internal/storage/aihot"
	githubStorage "resumecraft-pdf-backend/internal/storage/github"
	homeStorage "resumecraft-pdf-backend/internal/storage/home"
	newsStorage "resumecraft-pdf-backend/internal/storage/news"
)

// 新闻摘要最大截断长度（字符）
const maxNewsSummaryLen = 500

// Service 首页聚合服务：待办 + AI 新闻 + GitHub 项目 + 日报 + 项目推荐 + 新岗位 + AI HOT
type Service interface {
	ListTodos(ctx context.Context, userID string) ([]model.TodoItem, error)
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
	// SyncGithubProjects 抓取 GitHub 最新 AI 项目并入库
	SyncGithubProjects(ctx context.Context) (*model.SyncResult, error)

	// ---- AI HOT (https://aihot.virxact.com) ----
	// SyncAihotItems 同步最近 24h 精选快讯到本地缓存（ETag 条件请求，304 跳过）
	SyncAihotItems(ctx context.Context) (*model.SyncResult, error)
	// SyncAihotHotTopics 同步当前热点榜到本地缓存
	SyncAihotHotTopics(ctx context.Context) (*model.SyncResult, error)
	// SyncAihotDaily 同步最新日报到本地缓存（每天 08:00 北京时间发布）
	SyncAihotDaily(ctx context.Context) (*model.SyncResult, error)
	// ListAihotItems 快讯流：window=24h|7d，可按 category / 关键词 q 过滤
	ListAihotItems(ctx context.Context, window, category, q string, limit int) ([]model.AihotItem, error)
	// GetAihotDaily 日报：date 为空返回最新；同时返回可切换的日期列表
	GetAihotDaily(ctx context.Context, date string) (*model.AihotDaily, []string, error)
	// ListAihotHotTopics 热点榜（≤10）
	ListAihotHotTopics(ctx context.Context) ([]model.AihotHotTopic, error)
	// GetAihotStory 事件详情（本地缓存 1 小时内直接返回，过期回源拉取）
	GetAihotStory(ctx context.Context, publicID string) (*model.AihotStory, error)
}

type service struct {
	todoRepo      homeStorage.TodoRepository
	newsRepo      newsStorage.Repository
	githubRepo    githubStorage.Repository
	reportRepo    homeStorage.ReportRepository
	projectRepo   homeStorage.ProjectRepository
	snapshotRepo  homeStorage.SnapshotRepository
	newJobRepo    homeStorage.NewJobRepository
	aihotRepo     aihotStorage.Repository
	client        *http.Client
	githubAPIBase string // GitHub Search API 基地址（测试可覆盖）
	// 系统级 AI 凭证（.env 配置，服务端内置）：用于首页日报/项目推荐一次生成
	aiAPIKey  string
	aiBaseURL string
	aiModel   string
	// AI HOT ETag 缓存（进程内，304 条件请求用；重启后失效仅导致一次全量拉取）
	aihotETags map[string]string
	aihotMu    sync.Mutex
}

func NewService(
	todoRepo homeStorage.TodoRepository,
	newsRepo newsStorage.Repository,
	githubRepo githubStorage.Repository,
	reportRepo homeStorage.ReportRepository,
	projectRepo homeStorage.ProjectRepository,
	snapshotRepo homeStorage.SnapshotRepository,
	newJobRepo homeStorage.NewJobRepository,
	aihotRepo aihotStorage.Repository,
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
		aihotRepo:     aihotRepo,
		client:        &http.Client{Timeout: 20 * time.Second},
		githubAPIBase: "https://api.github.com",
		aiAPIKey:      aiAPIKey,
		aiBaseURL:     aiBaseURL,
		aiModel:       aiModel,
		aihotETags:    map[string]string{},
	}
}

func (s *service) ListTodos(ctx context.Context, userID string) ([]model.TodoItem, error) {
	return s.todoRepo.ListTodos(ctx, userID)
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
// 素材取最近 24 小时入库的真实 AI 新闻，避免 AI 凭训练知识编造过时内容。
func (s *service) generateWithAI(ctx context.Context) (*model.AiDailyReport, error) {
	// 抓取最近 24h 真实新闻作为素材（失败不阻塞，可空素材继续生成）
	newsLines := []string{}
	if items, err := s.newsRepo.ListSince(ctx, time.Now().Add(-24*time.Hour), 50); err == nil {
		for _, n := range items {
			newsLines = append(newsLines,
				fmt.Sprintf("%s | %s | %s", n.Title, n.Source, time.UnixMilli(n.PublishedAt).Format("2006-01-02")))
		}
	} else {
		log.Printf("[home] load news for AI report failed: %v", err)
	}
	today := time.Now().Format("2006-01-02")
	content, err := aiservice.GenerateHomeContent(ctx, s.aiAPIKey, s.aiBaseURL, s.aiModel, today, newsLines)
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
	// 按发布时间倒序排序（素材已按时间倒序传入，AI 可能自行重排，这里兜底保证入库即倒序）
	sort.SliceStable(report.Items, func(i, j int) bool {
		return report.Items[i].PublishedAt > report.Items[j].PublishedAt
	})
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
	// 按发布时间倒序排序（ListSince 已倒序，防御性兜底）
	sort.SliceStable(report.Items, func(i, j int) bool {
		return report.Items[i].PublishedAt > report.Items[j].PublishedAt
	})

	if _, err := s.reportRepo.Upsert(ctx, *report); err != nil {
		return nil, err
	}
	return report, nil
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

// truncate 按 rune 截断字符串，超出部分以省略号结尾
func truncate(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n]) + "…"
}
