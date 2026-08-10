package news

import (
	"context"
	"fmt"
	"time"

	"resumecraft-pdf-backend/internal/model"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository ai_news 存量数据仓储（仅保留降级日报素材读取；RSS 同步已下线，表不再写入）
type Repository interface {
	// ListSince 返回发布时间晚于 since 的新闻，按发布时间倒序，最多 limit 条（日报聚合用）
	ListSince(ctx context.Context, since time.Time, limit int) ([]model.AiNewsItem, error)
}

type repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) Repository {
	return &repository{pool: pool}
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
