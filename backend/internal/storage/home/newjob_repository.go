package home

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"resumecraft-pdf-backend/internal/model"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// newJobRecentRedisKey Redis 中「最近新增岗位」列表的 key（LPUSH 头插 + LTRIM 保留最近 N 条）
const newJobRecentRedisKey = "home:new_jobs:recent"

// newJobRecentMaxLen Redis 列表最多保留的条数（前端固定读取最近 10 条）
const newJobRecentMaxLen = 10

// NewJobRepository 首页新增岗位存储层：Redis「最近新增」列表为主，job_postings 表为兜底
type NewJobRepository interface {
	// ListAddedRecently 返回最近 days 天新增（created_at 落在 [今天-days+1, 今天) 区间）的岗位，
	// 按开放时间倒序，最多 limit 条；用于 Redis 未启用/为空时的兜底查询
	ListAddedRecently(ctx context.Context, days, limit int) ([]model.NewJobItem, error)
	// PushRecent 将一条新增岗位追加到 Redis「最近新增」列表头部，并裁剪至 newJobRecentMaxLen 条；
	// 未启用 Redis（client 为 nil）时静默跳过，不影响主同步流程
	PushRecent(ctx context.Context, item model.NewJobItem) error
	// ListRecent 从 Redis 读取「最近新增」列表（最多 newJobRecentMaxLen 条，按新增时间倒序）；
	// 未启用 Redis 或列表为空时返回空切片，由上层回退到 ListAddedRecently
	ListRecent(ctx context.Context) ([]model.NewJobItem, error)
}

type newJobRepository struct {
	pool  *pgxpool.Pool
	redis *redis.Client // 可为 nil：REDIS_ENABLED=false 时不写入/不读取「最近新增」列表
}

func NewNewJobRepository(pool *pgxpool.Pool, redisClient *redis.Client) NewJobRepository {
	return &newJobRepository{pool: pool, redis: redisClient}
}

func (r *newJobRepository) ListAddedRecently(ctx context.Context, days, limit int) ([]model.NewJobItem, error) {
	if days <= 0 {
		days = 1
	}
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, company_name, COALESCE(recruitment_type, ''), COALESCE(location, ''),
		       COALESCE(positions, ''), open_date, COALESCE(application_url, ''), COALESCE(source, '')
		FROM job_postings
		WHERE is_active = TRUE
		  AND created_at >= date_trunc('day', NOW() - make_interval(days => $1))
		  AND created_at <  date_trunc('day', NOW())
		ORDER BY open_date DESC NULLS LAST, created_at DESC
		LIMIT $2
	`, days, limit)
	if err != nil {
		return nil, fmt.Errorf("list new jobs added recently: %w", err)
	}
	defer rows.Close()

	items := make([]model.NewJobItem, 0, limit)
	for rows.Next() {
		var (
			item     model.NewJobItem
			openDate sql.NullTime
		)
		if err := rows.Scan(&item.ID, &item.CompanyName, &item.RecruitmentType, &item.Location,
			&item.Positions, &openDate, &item.ApplicationURL, &item.Source); err != nil {
			return nil, fmt.Errorf("scan new job: %w", err)
		}
		if openDate.Valid {
			ms := openDate.Time.UnixMilli()
			item.OpenDate = &ms
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// PushRecent 头插一条记录并裁剪列表长度；Redis 未启用或写入失败仅记录错误，不阻塞调用方主流程。
func (r *newJobRepository) PushRecent(ctx context.Context, item model.NewJobItem) error {
	if r.redis == nil {
		return nil
	}
	raw, err := json.Marshal(item)
	if err != nil {
		return fmt.Errorf("marshal new job for redis: %w", err)
	}
	pipe := r.redis.TxPipeline()
	pipe.LPush(ctx, newJobRecentRedisKey, raw)
	pipe.LTrim(ctx, newJobRecentRedisKey, 0, newJobRecentMaxLen-1)
	if _, err := pipe.Exec(ctx); err != nil {
		return fmt.Errorf("push recent new job to redis: %w", err)
	}
	return nil
}

// ListRecent 读取 Redis 列表（LPUSH 头插，索引 0 即最新一条，天然按新增时间倒序）。
func (r *newJobRepository) ListRecent(ctx context.Context) ([]model.NewJobItem, error) {
	if r.redis == nil {
		return []model.NewJobItem{}, nil
	}
	raws, err := r.redis.LRange(ctx, newJobRecentRedisKey, 0, newJobRecentMaxLen-1).Result()
	if err != nil {
		return nil, fmt.Errorf("read recent new jobs from redis: %w", err)
	}
	items := make([]model.NewJobItem, 0, len(raws))
	for _, raw := range raws {
		var item model.NewJobItem
		if err := json.Unmarshal([]byte(raw), &item); err != nil {
			continue
		}
		items = append(items, item)
	}
	return items, nil
}
