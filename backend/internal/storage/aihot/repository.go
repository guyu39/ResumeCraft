// Package aihot 提供 AI HOT (https://aihot.virxact.com) 首页工作台数据缓存仓储。
// 数据源为匿名只读 REST API v1；本仓储仅负责本地缓存表的读写，外部同步由 home service 驱动。
package aihot

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"resumecraft-pdf-backend/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository AI HOT 本地缓存仓储
type Repository interface {
	// UpsertItems 批量写入快讯（id 冲突时更新），返回写入条数
	UpsertItems(ctx context.Context, items []model.AihotItem) (int, error)
	// ListItems 查询快讯流：window 为 24h|7d，可按 category / 关键词 q 过滤，limit 上限 100
	ListItems(ctx context.Context, window, category, q string, limit int) ([]model.AihotItem, error)

	// UpsertDaily 覆盖写入某日报（report_date 为 pk）
	UpsertDaily(ctx context.Context, reportDate string, raw []byte, linksAihot string, generatedAt time.Time) error
	// GetDaily 读取指定日期日报；date 为空返回最新
	GetDaily(ctx context.Context, date string) (*model.AihotDaily, error)
	// ListDailyDates 返回最近 limit 期日报日期（倒序，供日期切换）
	ListDailyDates(ctx context.Context, limit int) ([]string, error)

	// UpsertHotTopics 覆盖写入热点榜快照（每次保留最新一份）
	UpsertHotTopics(ctx context.Context, topics []model.AihotHotTopic) error
	// GetLatestHotTopics 读取最新热点榜
	GetLatestHotTopics(ctx context.Context) ([]model.AihotHotTopic, error)

	// UpsertStory 写入事件详情（public_id 为 pk）
	UpsertStory(ctx context.Context, publicID string, raw []byte) error
	// GetStory 读取事件详情，返回结构与拉取时间；不存在返回 nil
	GetStory(ctx context.Context, publicID string) (*model.AihotStory, time.Time, error)
}

type repository struct {
	pool *pgxpool.Pool
}

// NewRepository 构造仓储
func NewRepository(pool *pgxpool.Pool) Repository {
	return &repository{pool: pool}
}

const upsertItemSQL = `
INSERT INTO aihot_items
    (id, title, original_title, summary, source_name, links_aihot, links_original,
     category, score, published_at, discovered_at, updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    original_title = EXCLUDED.original_title,
    summary = EXCLUDED.summary,
    source_name = EXCLUDED.source_name,
    links_aihot = EXCLUDED.links_aihot,
    links_original = EXCLUDED.links_original,
    category = EXCLUDED.category,
    score = EXCLUDED.score,
    published_at = EXCLUDED.published_at,
    discovered_at = EXCLUDED.discovered_at,
    updated_at = now()
RETURNING id
`

func (r *repository) UpsertItems(ctx context.Context, items []model.AihotItem) (int, error) {
	if len(items) == 0 {
		return 0, nil
	}
	batch := &pgx.Batch{}
	for _, it := range items {
		batch.Queue(upsertItemSQL, it.ID, it.Title, it.OriginalTitle, it.Summary, it.SourceName,
			it.LinksAihot, it.LinksOriginal, it.Category, it.Score, it.PublishedAt, it.DiscoveredAt)
	}
	br := r.pool.SendBatch(ctx, batch)
	defer br.Close()

	inserted := 0
	for range items {
		rows, err := br.Query()
		if err != nil {
			return 0, fmt.Errorf("upsert aihot item row: %w", err)
		}
		if rows.Next() {
			inserted++
		}
		rows.Close()
	}
	if err := br.Close(); err != nil {
		return 0, fmt.Errorf("aihot batch close: %w", err)
	}
	return inserted, nil
}

func (r *repository) ListItems(ctx context.Context, window, category, q string, limit int) ([]model.AihotItem, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	query := `
		SELECT id, title, original_title, summary, source_name, links_aihot, links_original,
		       category, score, published_at, discovered_at
		FROM aihot_items
		WHERE published_at >= NOW() - make_interval(hours => $1)
	`
	args := []any{24}
	if window == "7d" {
		args[0] = 24 * 7
	}
	if category != "" {
		query += " AND category = $2"
		args = append(args, category)
	}
	if q != "" {
		query += " AND (title ILIKE '%' || $" + fmt.Sprintf("%d", len(args)+1) + " || '%' OR summary ILIKE '%' || $" + fmt.Sprintf("%d", len(args)+1) + " || '%')"
		args = append(args, q)
	}
	query += " ORDER BY published_at DESC NULLS LAST, discovered_at DESC LIMIT $" + fmt.Sprintf("%d", len(args)+1)
	args = append(args, limit)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list aihot items: %w", err)
	}
	defer rows.Close()

	items := make([]model.AihotItem, 0, limit)
	for rows.Next() {
		var it model.AihotItem
		if err := rows.Scan(&it.ID, &it.Title, &it.OriginalTitle, &it.Summary, &it.SourceName,
			&it.LinksAihot, &it.LinksOriginal, &it.Category, &it.Score, &it.PublishedAt, &it.DiscoveredAt); err != nil {
			return nil, fmt.Errorf("scan aihot item: %w", err)
		}
		items = append(items, it)
	}
	return items, rows.Err()
}

func (r *repository) UpsertDaily(ctx context.Context, reportDate string, raw []byte, linksAihot string, generatedAt time.Time) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO aihot_dailies (report_date, raw, links_aihot, generated_at, updated_at)
		VALUES ($1, $2, $3, $4, now())
		ON CONFLICT (report_date) DO UPDATE SET
			raw = EXCLUDED.raw,
			links_aihot = EXCLUDED.links_aihot,
			generated_at = EXCLUDED.generated_at,
			updated_at = now()
	`, reportDate, raw, linksAihot, generatedAt)
	if err != nil {
		return fmt.Errorf("upsert aihot daily: %w", err)
	}
	return nil
}

func (r *repository) GetDaily(ctx context.Context, date string) (*model.AihotDaily, error) {
	query := `
		SELECT report_date, raw, links_aihot, generated_at, updated_at
		FROM aihot_dailies
	`
	args := []any{}
	if date != "" {
		query += " WHERE report_date = $1"
		args = append(args, date)
	} else {
		query += " ORDER BY report_date DESC LIMIT 1"
	}
	row := r.pool.QueryRow(ctx, query, args...)

	var d model.AihotDaily
	var rd time.Time
	if err := row.Scan(&rd, &d.Raw, &d.LinksAihot, &d.GeneratedAt, &d.UpdatedAt); err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get aihot daily: %w", err)
	}
	d.ReportDate = rd.Format("2006-01-02")
	// raw 存储的是完整响应（含 schemaVersion/report 包裹），此处解出内层 report 供前端直接使用
	var wrapper struct {
		Report json.RawMessage `json:"report"`
	}
	if err := json.Unmarshal(d.Raw, &wrapper); err == nil && len(wrapper.Report) > 0 {
		d.Raw = wrapper.Report
	}
	return &d, nil
}

func (r *repository) ListDailyDates(ctx context.Context, limit int) ([]string, error) {
	if limit <= 0 || limit > 30 {
		limit = 7
	}
	rows, err := r.pool.Query(ctx, `
		SELECT report_date FROM aihot_dailies ORDER BY report_date DESC LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list aihot daily dates: %w", err)
	}
	defer rows.Close()
	dates := make([]string, 0, limit)
	for rows.Next() {
		var d time.Time
		if err := rows.Scan(&d); err != nil {
			return nil, fmt.Errorf("scan aihot daily date: %w", err)
		}
		dates = append(dates, d.Format("2006-01-02"))
	}
	return dates, rows.Err()
}

func (r *repository) UpsertHotTopics(ctx context.Context, topics []model.AihotHotTopic) error {
	raw, err := json.Marshal(topics)
	if err != nil {
		return fmt.Errorf("marshal aihot hot topics: %w", err)
	}
	_, err = r.pool.Exec(ctx, `
		INSERT INTO aihot_hot_topics (snapshot_at, topics) VALUES (now(), $1)
	`, raw)
	if err != nil {
		return fmt.Errorf("upsert aihot hot topics: %w", err)
	}
	return nil
}

func (r *repository) GetLatestHotTopics(ctx context.Context) ([]model.AihotHotTopic, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT topics FROM aihot_hot_topics ORDER BY snapshot_at DESC LIMIT 1
	`)
	var raw []byte
	if err := row.Scan(&raw); err != nil {
		if err == pgx.ErrNoRows {
			return []model.AihotHotTopic{}, nil
		}
		return nil, fmt.Errorf("get aihot hot topics: %w", err)
	}
	var topics []model.AihotHotTopic
	if err := json.Unmarshal(raw, &topics); err != nil {
		return nil, fmt.Errorf("unmarshal aihot hot topics: %w", err)
	}
	if topics == nil {
		topics = []model.AihotHotTopic{}
	}
	return topics, nil
}

func (r *repository) UpsertStory(ctx context.Context, publicID string, raw []byte) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO aihot_stories (public_id, raw, fetched_at)
		VALUES ($1, $2, now())
		ON CONFLICT (public_id) DO UPDATE SET raw = EXCLUDED.raw, fetched_at = now()
	`, publicID, raw)
	if err != nil {
		return fmt.Errorf("upsert aihot story: %w", err)
	}
	return nil
}

func (r *repository) GetStory(ctx context.Context, publicID string) (*model.AihotStory, time.Time, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT raw, fetched_at FROM aihot_stories WHERE public_id = $1
	`, publicID)
	var raw []byte
	var fetched time.Time
	if err := row.Scan(&raw, &fetched); err != nil {
		if err == pgx.ErrNoRows {
			return nil, time.Time{}, nil
		}
		return nil, time.Time{}, fmt.Errorf("get aihot story: %w", err)
	}
	story, err := parseStory(raw)
	if err != nil {
		return nil, time.Time{}, err
	}
	story.FetchedAt = fetched
	return &story, fetched, nil
}

// parseStory 解析 story 响应：兼容带 schemaVersion/story 包裹层，
// 并将 AI HOT 嵌套的 links.aihot / links.original 映射为平铺字段
func parseStory(raw []byte) (model.AihotStory, error) {
	var wrapper struct {
		Story json.RawMessage `json:"story"`
	}
	storyRaw := raw
	if err := json.Unmarshal(raw, &wrapper); err == nil && len(wrapper.Story) > 0 {
		storyRaw = wrapper.Story
	}

	var story model.AihotStory
	if err := json.Unmarshal(storyRaw, &story); err != nil {
		return story, fmt.Errorf("unmarshal aihot story: %w", err)
	}

	var ext struct {
		Links struct {
			Aihot string `json:"aihot"`
		} `json:"links"`
		Reports []struct {
			Links struct {
				Aihot    string `json:"aihot"`
				Original string `json:"original"`
			} `json:"links"`
		} `json:"reports"`
	}
	if err := json.Unmarshal(storyRaw, &ext); err == nil {
		story.LinksAihot = ext.Links.Aihot
		for i := range story.Reports {
			if i < len(ext.Reports) {
				story.Reports[i].LinksAihot = ext.Reports[i].Links.Aihot
				story.Reports[i].LinksOriginal = ext.Reports[i].Links.Original
			}
		}
	}
	return story, nil
}
