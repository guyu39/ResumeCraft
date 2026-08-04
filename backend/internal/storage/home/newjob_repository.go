package home

import (
	"context"
	"database/sql"
	"fmt"

	"resumecraft-pdf-backend/internal/model"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NewJobRepository 首页新增岗位存储层（查 job_postings 表）
type NewJobRepository interface {
	// ListAddedRecently 返回最近 days 天新增（created_at 落在 [今天-days+1, 今天) 区间）的岗位，
	// 按开放时间倒序，最多 limit 条；days=1 时即「昨日新增」
	ListAddedRecently(ctx context.Context, days, limit int) ([]model.NewJobItem, error)
}

type newJobRepository struct {
	pool *pgxpool.Pool
}

func NewNewJobRepository(pool *pgxpool.Pool) NewJobRepository {
	return &newJobRepository{pool: pool}
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
