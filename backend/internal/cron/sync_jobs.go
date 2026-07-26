package cron

import (
	"context"
	"log"
	"time"

	jobposting "resumecraft-pdf-backend/internal/service/job_posting"
)

// JobSyncScheduler 定时同步招聘数据（默认每 6 小时一次）
type JobSyncScheduler struct {
	service  jobposting.Service
	interval time.Duration
	stop     chan struct{}
}

// NewJobSyncScheduler 构造调度器。interval<=0 时使用默认 6 小时。
func NewJobSyncScheduler(service jobposting.Service, interval time.Duration) *JobSyncScheduler {
	if interval <= 0 {
		interval = 6 * time.Hour
	}
	return &JobSyncScheduler{
		service:  service,
		interval: interval,
		stop:     make(chan struct{}),
	}
}

// Start 阻塞式启动：先立即执行一次，随后按 interval 周期执行。
// 调用方通常应在独立 goroutine 中运行。
func (s *JobSyncScheduler) Start() {
	log.Printf("[cron] job-postings sync scheduler started, interval=%s", s.interval)
	s.runOnce()
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			s.runOnce()
		case <-s.stop:
			log.Println("[cron] job-postings sync scheduler stopped")
			return
		}
	}
}

// Stop 优雅停止调度器
func (s *JobSyncScheduler) Stop() {
	select {
	case <-s.stop:
		// 已停止，避免重复 close
	default:
		close(s.stop)
	}
}

func (s *JobSyncScheduler) runOnce() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	result, err := s.service.SyncFromSmartsheet(ctx)
	if err != nil {
		log.Printf("[cron] job-postings sync failed: %v", err)
		return
	}
	log.Printf("[cron] job-postings sync done: total=%d inserted=%d updated=%d deactivated=%d errors=%d duration=%dms",
		result.Total, result.Inserted, result.Updated, result.Deactivated, result.Errors, result.DurationMs)
}
