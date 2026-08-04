package home

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// 允许的快照表白名单（防 SQL 注入）
var allowedSnapshotTables = map[string]bool{
	"github_sync_snapshots":     true,
	"resume_project_snapshots": true,
}

func validSnapshotTable(table string) bool {
	return allowedSnapshotTables[table]
}

// SnapshotItem 快照条目（含日期分组）
type SnapshotItem struct {
	Date string          `json:"date"` // YYYY-MM-DD
	Data json.RawMessage `json:"data"` // 该日快照的原始 JSON 数组
}

// SnapshotRepository 首页内容按日快照存储（GitHub 同步批次 / 项目推荐历史）
type SnapshotRepository interface {
	// UpsertDaily 写入（覆盖）指定日期的快照
	UpsertDaily(ctx context.Context, table string, date string, raw []byte) error
	// ListRecent 返回近 days 天的快照（按日期倒序），每份为 SnapshotItem
	ListRecent(ctx context.Context, table string, days int) ([]SnapshotItem, error)
}

type snapshotRepository struct {
	pool *pgxpool.Pool
}

func NewSnapshotRepository(pool *pgxpool.Pool) SnapshotRepository {
	return &snapshotRepository{pool: pool}
}

func (r *snapshotRepository) UpsertDaily(ctx context.Context, table string, date string, raw []byte) error {
	if !validSnapshotTable(table) {
		return fmt.Errorf("invalid snapshot table %q", table)
	}
	snapshotDate, err := time.Parse("2006-01-02", date)
	if err != nil {
		return fmt.Errorf("parse snapshot date %q: %w", date, err)
	}
	_, err = r.pool.Exec(ctx, fmt.Sprintf(`
		INSERT INTO %s (snapshot_date, items, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (snapshot_date) DO UPDATE SET
			items = EXCLUDED.items,
			updated_at = NOW()
	`, table), snapshotDate, raw)
	if err != nil {
		return fmt.Errorf("upsert snapshot %s: %w", table, err)
	}
	return nil
}

func (r *snapshotRepository) ListRecent(ctx context.Context, table string, days int) ([]SnapshotItem, error) {
	if !validSnapshotTable(table) {
		return nil, fmt.Errorf("invalid snapshot table %q", table)
	}
	if days <= 0 {
		days = 7
	}
	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		SELECT snapshot_date, items
		FROM %s
		WHERE snapshot_date >= CURRENT_DATE - ($1::int - 1)
		ORDER BY snapshot_date DESC
	`, table), days)
	if err != nil {
		return nil, fmt.Errorf("list snapshot %s: %w", table, err)
	}
	defer rows.Close()

	items := make([]SnapshotItem, 0, days)
	for rows.Next() {
		var d time.Time
		var raw []byte
		if err := rows.Scan(&d, &raw); err != nil {
			return nil, fmt.Errorf("scan snapshot %s: %w", table, err)
		}
		items = append(items, SnapshotItem{Date: d.Format("2006-01-02"), Data: raw})
	}
	return items, rows.Err()
}
