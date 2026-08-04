package news

import (
	"context"
	"fmt"
	"time"

	"resumecraft-pdf-backend/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository AI 新闻存储层
type Repository interface {
	// Upsert 批量幂等写入（url 冲突时跳过），返回写入条数
	Upsert(ctx context.Context, items []model.AiNewsItem) (int, error)
	// ListRecent 按发布时间倒序返回近 days 天的新闻，最多 limit 条
	ListRecent(ctx context.Context, days, limit int) ([]model.AiNewsItem, error)
	// ListSince 返回发布时间晚于 since 的新闻，按发布时间倒序，最多 limit 条（日报聚合用）
	ListSince(ctx context.Context, since time.Time, limit int) ([]model.AiNewsItem, error)
}

type repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) Repository {
	return &repository{pool: pool}
}

const upsertSQL = `
INSERT INTO ai_news (title, url, source, summary, published_at)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (url) DO NOTHING
RETURNING id
`

func (r *repository) Upsert(ctx context.Context, items []model.AiNewsItem) (int, error) {
	if len(items) == 0 {
		return 0, nil
	}
	batch := &pgx.Batch{}
	for _, item := range items {
		batch.Queue(upsertSQL, item.Title, item.URL, item.Source, item.Summary,
			time.UnixMilli(item.PublishedAt))
	}
	br := r.pool.SendBatch(ctx, batch)
	defer br.Close()

	inserted := 0
	for range items {
		rows, err := br.Query()
		if err != nil {
			return 0, fmt.Errorf("upsert news row: %w", err)
		}
		if rows.Next() {
			inserted++
		}
		rows.Close()
	}
	if err := br.Close(); err != nil {
		return 0, fmt.Errorf("news batch close: %w", err)
	}
	return inserted, nil
}

func (r *repository) ListRecent(ctx context.Context, days, limit int) ([]model.AiNewsItem, error) {
	if days <= 0 {
		days = 30
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, title, url, source, summary, published_at
		FROM ai_news
		WHERE published_at >= NOW() - make_interval(days => $1)
		ORDER BY published_at DESC
		LIMIT $2
	`, days, limit)
	if err != nil {
		return nil, fmt.Errorf("list recent news: %w", err)
	}
	defer rows.Close()

	items := make([]model.AiNewsItem, 0, limit)
	for rows.Next() {
		var item model.AiNewsItem
		var publishedAt time.Time
		if err := rows.Scan(&item.ID, &item.Title, &item.URL, &item.Source, &item.Summary, &publishedAt); err != nil {
			return nil, fmt.Errorf("scan news: %w", err)
		}
		item.PublishedAt = publishedAt.UnixMilli()
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *repository) ListSince(ctx context.Context, since time.Time, limit int) ([]model.AiNewsItem, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, title, url, source, summary, published_at
		FROM ai_news
		WHERE published_at >= $1
		ORDER BY published_at DESC
		LIMIT $2
	`, since, limit)
	if err != nil {
		return nil, fmt.Errorf("list news since: %w", err)
	}
	defer rows.Close()

	items := make([]model.AiNewsItem, 0, limit)
	for rows.Next() {
		var item model.AiNewsItem
		var publishedAt time.Time
		if err := rows.Scan(&item.ID, &item.Title, &item.URL, &item.Source, &item.Summary, &publishedAt); err != nil {
			return nil, fmt.Errorf("scan news: %w", err)
		}
		item.PublishedAt = publishedAt.UnixMilli()
		items = append(items, item)
	}
	return items, rows.Err()
}
