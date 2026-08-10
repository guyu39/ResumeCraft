package cron

import (
	"context"
	"log"
	"time"

	homeservice "resumecraft-pdf-backend/internal/service/home"
)

// AI HOT 同步节奏（对齐官方 s-maxage：items 60s / hot-topics 300s，留足余量）
const (
	AihotItemsSyncInterval  = 5 * time.Minute  // 快讯
	AihotHotTopicsInterval  = 10 * time.Minute // 热点榜
	AihotDailyCheckInterval = 5 * time.Minute  // 日报跨天检查
	AihotDailyPublishHour   = 8                // 日报 08:00（北京时间）发布，08:05 后同步
	AihotDailyPublishMinute = 5
)

// AihotSyncScheduler AI HOT 数据定时同步：
// 快讯每 5 分钟、热点每 10 分钟、日报每天 08:05（北京时间）各由独立 goroutine 驱动。
type AihotSyncScheduler struct {
	service homeservice.Service
	stop    chan struct{}
}

// NewAihotSyncScheduler 构造 AI HOT 同步调度器
func NewAihotSyncScheduler(service homeservice.Service) *AihotSyncScheduler {
	return &AihotSyncScheduler{
		service: service,
		stop:    make(chan struct{}),
	}
}

// Start 启动三个独立同步循环（非阻塞启动，内部 goroutine 各自管理）
func (s *AihotSyncScheduler) Start() {
	log.Printf("[cron] aihot sync scheduler started (items=%s hot=%s daily=08:05 Asia/Shanghai)",
		AihotItemsSyncInterval, AihotHotTopicsInterval)
	go s.loopItems()
	go s.loopHotTopics()
	go s.loopDaily()
}

// Stop 停止全部同步循环
func (s *AihotSyncScheduler) Stop() {
	select {
	case <-s.stop:
	default:
		close(s.stop)
	}
	log.Println("[cron] aihot sync scheduler stopped")
}

func (s *AihotSyncScheduler) stopped() bool {
	select {
	case <-s.stop:
		return true
	default:
		return false
	}
}

func (s *AihotSyncScheduler) loopItems() {
	s.runItems()
	ticker := time.NewTicker(AihotItemsSyncInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			s.runItems()
		case <-s.stop:
			return
		}
	}
}

func (s *AihotSyncScheduler) loopHotTopics() {
	s.runHotTopics()
	ticker := time.NewTicker(AihotHotTopicsInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			s.runHotTopics()
		case <-s.stop:
			return
		}
	}
}

func (s *AihotSyncScheduler) loopDaily() {
	// 启动时立即尝试同步一次（补拉当日日报）；随后每 5 分钟检查跨天 + 过发布时间
	s.runDaily()
	lastDate := time.Now().Format("2006-01-02")
	ticker := time.NewTicker(AihotDailyCheckInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			now := time.Now()
			date := now.Format("2006-01-02")
			if date != lastDate && now.Hour()*60+now.Minute() >= AihotDailyPublishHour*60+AihotDailyPublishMinute {
				lastDate = date
				s.runDaily()
			}
		case <-s.stop:
			return
		}
	}
}

func (s *AihotSyncScheduler) runItems() {
	if s.stopped() {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	result, err := s.service.SyncAihotItems(ctx)
	if err != nil {
		log.Printf("[cron] aihot items sync failed: %v", err)
		return
	}
	log.Printf("[cron] aihot items sync done: total=%d inserted=%d skipped=%d errors=%d duration=%dms",
		result.Total, result.Inserted, result.Skipped, result.Errors, result.DurationMs)
}

func (s *AihotSyncScheduler) runHotTopics() {
	if s.stopped() {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	result, err := s.service.SyncAihotHotTopics(ctx)
	if err != nil {
		log.Printf("[cron] aihot hot-topics sync failed: %v", err)
		return
	}
	log.Printf("[cron] aihot hot-topics sync done: total=%d skipped=%d errors=%d duration=%dms",
		result.Total, result.Skipped, result.Errors, result.DurationMs)
}

func (s *AihotSyncScheduler) runDaily() {
	if s.stopped() {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	result, err := s.service.SyncAihotDaily(ctx)
	if err != nil {
		log.Printf("[cron] aihot daily sync failed: %v", err)
		return
	}
	log.Printf("[cron] aihot daily sync done: total=%d skipped=%d errors=%d duration=%dms",
		result.Total, result.Skipped, result.Errors, result.DurationMs)
}
