package cron

import (
	"context"
	"log"
	"time"

	homeservice "resumecraft-pdf-backend/internal/service/home"
)

// DefaultNewsSyncInterval AI 新闻默认同步周期（1 小时）
const DefaultNewsSyncInterval = time.Hour

// DefaultGithubSyncInterval GitHub 项目默认同步周期（6 小时，受 Search API 限速约束）
const DefaultGithubSyncInterval = 6 * time.Hour

// NewsSyncScheduler 定时同步 AI 新闻
type NewsSyncScheduler struct {
	service  homeservice.Service
	interval time.Duration
	stop     chan struct{}
}

// NewNewsSyncScheduler 构造新闻调度器。interval<=0 时使用默认一小时。
func NewNewsSyncScheduler(service homeservice.Service, interval time.Duration) *NewsSyncScheduler {
	if interval <= 0 {
		interval = DefaultNewsSyncInterval
	}
	return &NewsSyncScheduler{
		service:  service,
		interval: interval,
		stop:     make(chan struct{}),
	}
}

// Start 阻塞式启动：先立即执行一次，随后按 interval 周期执行。
func (s *NewsSyncScheduler) Start() {
	log.Printf("[cron] ai-news sync scheduler started, interval=%s", s.interval)
	s.runOnce()
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			s.runOnce()
		case <-s.stop:
			log.Println("[cron] ai-news sync scheduler stopped")
			return
		}
	}
}

// Stop 优雅停止调度器
func (s *NewsSyncScheduler) Stop() {
	select {
	case <-s.stop:
	default:
		close(s.stop)
	}
}

func (s *NewsSyncScheduler) runOnce() {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	result, err := s.service.SyncNews(ctx)
	if err != nil {
		log.Printf("[cron] ai-news sync failed: %v", err)
		return
	}
	log.Printf("[cron] ai-news sync done: total=%d inserted=%d errors=%d duration=%dms",
		result.Total, result.Inserted, result.Errors, result.DurationMs)
}

// GithubSyncScheduler 定时同步 GitHub 最新 AI 项目
type GithubSyncScheduler struct {
	service  homeservice.Service
	interval time.Duration
	stop     chan struct{}
}

// NewGithubSyncScheduler 构造 GitHub 调度器。interval<=0 时使用默认 6 小时。
func NewGithubSyncScheduler(service homeservice.Service, interval time.Duration) *GithubSyncScheduler {
	if interval <= 0 {
		interval = DefaultGithubSyncInterval
	}
	return &GithubSyncScheduler{
		service:  service,
		interval: interval,
		stop:     make(chan struct{}),
	}
}

// Start 阻塞式启动：先立即执行一次，随后按 interval 周期执行。
func (s *GithubSyncScheduler) Start() {
	log.Printf("[cron] github-projects sync scheduler started, interval=%s", s.interval)
	s.runOnce()
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			s.runOnce()
		case <-s.stop:
			log.Println("[cron] github-projects sync scheduler stopped")
			return
		}
	}
}

// Stop 优雅停止调度器
func (s *GithubSyncScheduler) Stop() {
	select {
	case <-s.stop:
	default:
		close(s.stop)
	}
}

func (s *GithubSyncScheduler) runOnce() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	result, err := s.service.SyncGithubProjects(ctx)
	if err != nil {
		log.Printf("[cron] github-projects sync failed: %v", err)
		return
	}
	log.Printf("[cron] github-projects sync done: total=%d inserted=%d updated=%d errors=%d duration=%dms",
		result.Total, result.Inserted, result.Updated, result.Errors, result.DurationMs)
}

// DailyReportScheduler 每日定时生成 AI 日报（默认每天 0 点）。
// 采用「固定间隔 ticker + 只在跨天时执行」的策略：
// 定时器每 5 分钟检查一次，当本地日期发生变化且当日日报尚未生成时触发。
type DailyReportScheduler struct {
	service  homeservice.Service
	lastDate string
	stop     chan struct{}
}

// NewDailyReportScheduler 构造日报调度器。
func NewDailyReportScheduler(service homeservice.Service) *DailyReportScheduler {
	return &DailyReportScheduler{
		service:  service,
		lastDate: time.Now().Format("2006-01-02"),
		stop:     make(chan struct{}),
	}
}

// Start 阻塞式启动：每 5 分钟检查跨天，跨天时生成当日日报。
func (s *DailyReportScheduler) Start() {
	log.Println("[cron] daily-report scheduler started (generates at ~00:00 local)")
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			date := time.Now().Format("2006-01-02")
			if date != s.lastDate {
				s.lastDate = date
				s.generate(date)
			}
		case <-s.stop:
			log.Println("[cron] daily-report scheduler stopped")
			return
		}
	}
}

// Stop 优雅停止调度器
func (s *DailyReportScheduler) Stop() {
	select {
	case <-s.stop:
	default:
		close(s.stop)
	}
}

func (s *DailyReportScheduler) generate(date string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	report, err := s.service.GenerateDailyReport(ctx)
	if err != nil {
		log.Printf("[cron] daily-report generate failed for %s: %v", date, err)
		return
	}
	log.Printf("[cron] daily-report generated for %s: %d items", date, len(report.Items))
}
