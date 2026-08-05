package github

import (
	"context"
	"fmt"
	"time"

	"resumecraft-pdf-backend/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository GitHub 开源项目存储层
type Repository interface {
	// Upsert 幂等写入；已存在的仓库刷新动态字段（star/forks/描述），返回插入/更新计数
	Upsert(ctx context.Context, items []model.GithubProjectItem) (inserted, updated int, err error)
	// ListTop 按 star 数倒序返回前 limit 个
	ListTop(ctx context.Context, limit int) ([]model.GithubProjectItem, error)
	// ListRecent 按同步时间倒序返回近 days 天内的仓库，最多 limit 个
	ListRecent(ctx context.Context, days, limit int) ([]model.GithubProjectItem, error)
	// UpdateZhContent 按 full_name 回写 AI 中文加工结果（同步流程的独立后处理步骤，失败不影响主同步）
	UpdateZhContent(ctx context.Context, fullName, summaryZh, highlightZh string) error
}

type repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) Repository {
	return &repository{pool: pool}
}

const upsertSQL = `
INSERT INTO github_projects (full_name, html_url, description, language, stars, forks, topics, synced_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
ON CONFLICT (full_name) DO UPDATE SET
    html_url = EXCLUDED.html_url,
    description = EXCLUDED.description,
    language = EXCLUDED.language,
    stars = EXCLUDED.stars,
    forks = EXCLUDED.forks,
    topics = EXCLUDED.topics,
    synced_at = NOW()
RETURNING (xmax = 0) AS inserted
`

func (r *repository) Upsert(ctx context.Context, items []model.GithubProjectItem) (int, int, error) {
	if len(items) == 0 {
		return 0, 0, nil
	}
	batch := &pgx.Batch{}
	for _, item := range items {
		batch.Queue(upsertSQL, item.FullName, item.HtmlURL, item.Description,
			item.Language, item.Stars, item.Forks, item.Topics)
	}
	br := r.pool.SendBatch(ctx, batch)
	defer br.Close()

	inserted, updated := 0, 0
	for range items {
		rows, err := br.Query()
		if err != nil {
			return 0, 0, fmt.Errorf("upsert github row: %w", err)
		}
		if rows.Next() {
			var isInsert bool
			if err := rows.Scan(&isInsert); err != nil {
				rows.Close()
				return 0, 0, fmt.Errorf("upsert github scan: %w", err)
			}
			if isInsert {
				inserted++
			} else {
				updated++
			}
		}
		rows.Close()
	}
	if err := br.Close(); err != nil {
		return 0, 0, fmt.Errorf("github batch close: %w", err)
	}
	return inserted, updated, nil
}

func (r *repository) ListTop(ctx context.Context, limit int) ([]model.GithubProjectItem, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, full_name, html_url, description, summary_zh, highlight_zh, language, stars, forks, topics, synced_at
		FROM github_projects
		ORDER BY stars DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list top github projects: %w", err)
	}
	defer rows.Close()

	items := make([]model.GithubProjectItem, 0, limit)
	for rows.Next() {
		var item model.GithubProjectItem
		var syncedAt time.Time
		if err := rows.Scan(&item.ID, &item.FullName, &item.HtmlURL, &item.Description,
			&item.SummaryZh, &item.HighlightZh, &item.Language, &item.Stars, &item.Forks, &item.Topics, &syncedAt); err != nil {
			return nil, fmt.Errorf("scan github project: %w", err)
		}
		item.SyncedAt = syncedAt.UnixMilli()
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *repository) ListRecent(ctx context.Context, days, limit int) ([]model.GithubProjectItem, error) {
	if days <= 0 {
		days = 7
	}
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, full_name, html_url, description, summary_zh, highlight_zh, language, stars, forks, topics, synced_at
		FROM github_projects
		WHERE synced_at >= NOW() - make_interval(days => $1)
		ORDER BY synced_at DESC
		LIMIT $2
	`, days, limit)
	if err != nil {
		return nil, fmt.Errorf("list recent github projects: %w", err)
	}
	defer rows.Close()

	items := make([]model.GithubProjectItem, 0, limit)
	for rows.Next() {
		var item model.GithubProjectItem
		var syncedAt time.Time
		if err := rows.Scan(&item.ID, &item.FullName, &item.HtmlURL, &item.Description,
			&item.SummaryZh, &item.HighlightZh, &item.Language, &item.Stars, &item.Forks, &item.Topics, &syncedAt); err != nil {
			return nil, fmt.Errorf("scan github project: %w", err)
		}
		item.SyncedAt = syncedAt.UnixMilli()
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *repository) UpdateZhContent(ctx context.Context, fullName, summaryZh, highlightZh string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE github_projects SET summary_zh = $2, highlight_zh = $3
		WHERE full_name = $1
	`, fullName, summaryZh, highlightZh)
	if err != nil {
		return fmt.Errorf("update github project zh content: %w", err)
	}
	return nil
}
