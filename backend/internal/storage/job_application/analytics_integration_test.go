package job_application

import (
	"context"
	"os"
	"testing"
	"time"

	"resumecraft-pdf-backend/internal/model"

	"github.com/jackc/pgx/v5/pgxpool"
)

// TestNewAnalyticsQueriesAgainstRealDB 连真实 PG 校验新增聚合/日历 SQL 的语法与可执行性。
// 仅当设置 PG_DSN 时运行（本地连 docker/远程库时使用）；用不存在的 userID，
// 只验证 SQL 能跑通、返回空集，不依赖也不改动真实数据。
func TestNewAnalyticsQueriesAgainstRealDB(t *testing.T) {
	dsn := os.Getenv("PG_DSN")
	if dsn == "" {
		t.Skip("PG_DSN not set; skip real-DB integration check")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("connect pg: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("ping pg: %v", err)
	}

	repo := NewRepository(pool, nil)
	const probeUser = "00000000-0000-0000-0000-000000000000"

	t.Run("GetTrendStats week", func(t *testing.T) {
		to := time.Now()
		from := to.AddDate(0, -3, 0)
		points, err := repo.GetTrendStats(ctx, probeUser, model.TrendBucketWeek, from, to)
		if err != nil {
			t.Fatalf("trend week: %v", err)
		}
		// 近 3 个月按周应生成连续桶（约 13-14 个），且无数据用户全为 0
		if len(points) == 0 {
			t.Fatal("expected continuous week buckets, got 0")
		}
		for _, p := range points {
			if p.Submitted != 0 || p.Interview != 0 || p.Offer != 0 {
				t.Fatalf("probe user should have empty counts, got %+v", p)
			}
		}
		t.Logf("week buckets = %d", len(points))
	})

	t.Run("GetTrendStats month", func(t *testing.T) {
		to := time.Now()
		from := to.AddDate(0, -6, 0)
		points, err := repo.GetTrendStats(ctx, probeUser, model.TrendBucketMonth, from, to)
		if err != nil {
			t.Fatalf("trend month: %v", err)
		}
		if len(points) == 0 {
			t.Fatal("expected continuous month buckets, got 0")
		}
		t.Logf("month buckets = %d", len(points))
	})

	t.Run("GetInterviewRoundsStats", func(t *testing.T) {
		avg, median, max, dist, err := repo.GetInterviewRoundsStats(ctx, probeUser)
		if err != nil {
			t.Fatalf("interview rounds: %v", err)
		}
		if avg != 0 || median != 0 || max != 0 || len(dist) != 0 {
			t.Fatalf("probe user should have empty rounds, got avg=%v median=%v max=%v dist=%d", avg, median, max, len(dist))
		}
	})

	t.Run("GetStageDurationStats", func(t *testing.T) {
		stats, err := repo.GetStageDurationStats(ctx, probeUser)
		if err != nil {
			t.Fatalf("stage duration: %v", err)
		}
		if len(stats) != 0 {
			t.Fatalf("probe user should have empty stage stats, got %d", len(stats))
		}
	})

	t.Run("CalendarEvents", func(t *testing.T) {
		to := time.Now().AddDate(0, 1, 0)
		from := time.Now().AddDate(0, -1, 0)
		events, err := repo.CalendarEvents(ctx, probeUser, from, to)
		if err != nil {
			t.Fatalf("calendar events: %v", err)
		}
		if len(events) != 0 {
			t.Fatalf("probe user should have empty calendar, got %d", len(events))
		}
	})

	t.Run("verify scheduled index exists", func(t *testing.T) {
		var count int
		err := pool.QueryRow(ctx, `
			SELECT COUNT(*) FROM pg_indexes
			WHERE tablename = 'job_application_interviews'
			  AND indexname = 'idx_job_application_interviews_scheduled'
		`).Scan(&count)
		if err != nil {
			t.Fatalf("query pg_indexes: %v", err)
		}
		if count == 0 {
			t.Log("WARN: idx_job_application_interviews_scheduled 未创建，迁移可能尚未执行")
		} else {
			t.Log("scheduled index present")
		}
	})
}
