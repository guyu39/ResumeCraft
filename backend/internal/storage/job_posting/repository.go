package job_posting

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"resumecraft-pdf-backend/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository 招聘数据聚合存储层
type Repository interface {
	// UpsertJobPostings 批量 upsert，按 (company_name, recruitment_type) 去重；返回插入/更新计数
	UpsertJobPostings(ctx context.Context, items []model.JobPosting) (*model.SyncResult, error)
	// ListJobPostings 筛选 + 分页 + 关键词搜索，按开启时间排序
	ListJobPostings(ctx context.Context, filters model.JobPostingFilters) ([]model.JobPosting, int, error)
	// GetFilters 返回去重后的行业 / 招聘类型枚举
	GetFilters(ctx context.Context) (*model.JobPostingFiltersResponse, error)
	// SetMark 设置/取消当前用户对某条招聘信息的「已投递」标记
	SetMark(ctx context.Context, userID, jobPostingID string, applied bool) error
}

type repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) Repository {
	return &repository{pool: pool}
}

const upsertSQL = `
INSERT INTO job_postings (
    source, source_id, company_name, industry, industry_category,
    recruitment_type, recruitment_category,
    open_date, location, positions, application_url, referral_code, notes,
    is_active, scraped_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, NOW())
ON CONFLICT (company_name, recruitment_type) DO UPDATE SET
    source = EXCLUDED.source,
    source_id = EXCLUDED.source_id,
    industry = EXCLUDED.industry,
    industry_category = EXCLUDED.industry_category,
    recruitment_category = EXCLUDED.recruitment_category,
    open_date = EXCLUDED.open_date,
    location = EXCLUDED.location,
    positions = EXCLUDED.positions,
    application_url = EXCLUDED.application_url,
    referral_code = EXCLUDED.referral_code,
    notes = EXCLUDED.notes,
    is_active = true,
    scraped_at = NOW()
RETURNING (xmax = 0) AS inserted
`

func (r *repository) UpsertJobPostings(ctx context.Context, items []model.JobPosting) (*model.SyncResult, error) {
	result := &model.SyncResult{}
	if len(items) == 0 {
		return result, nil
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	batch := &pgx.Batch{}
	for _, jp := range items {
		batch.Queue(upsertSQL,
			jp.Source,
			nullIfEmpty(jp.SourceID),
			jp.CompanyName,
			nullIfEmpty(jp.Industry),
			nullIfEmpty(jp.IndustryCategory),
			nullIfEmpty(jp.RecruitmentType),
			nullIfEmpty(jp.RecruitmentCategory),
			jp.OpenDate,
			nullIfEmpty(jp.Location),
			nullIfEmpty(jp.Positions),
			nullIfEmpty(jp.ApplicationURL),
			nullIfEmpty(jp.ReferralCode),
			nullIfEmpty(jp.Notes),
		)
	}

	br := tx.SendBatch(ctx, batch)
	for range items {
		rows, err := br.Query()
		if err != nil {
			_ = br.Close()
			return nil, fmt.Errorf("upsert row: %w", err)
		}
		if rows.Next() {
			var isInsert bool
			if err := rows.Scan(&isInsert); err != nil {
				rows.Close()
				_ = br.Close()
				return nil, fmt.Errorf("upsert row scan: %w", err)
			}
			if isInsert {
				result.Inserted++
			} else {
				result.Updated++
			}
		}
		rows.Close()
		result.Total++
	}
	if err := br.Close(); err != nil {
		return nil, fmt.Errorf("batch close: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return result, nil
}

func (r *repository) MarkInactiveExcept(ctx context.Context, companies, types []string) (int, error) {
	if len(companies) == 0 {
		return 0, nil
	}
	const sql = `
		UPDATE job_postings
		SET is_active = false
		WHERE is_active = true
		  AND NOT (company_name, recruitment_type) IN (
		      SELECT * FROM unnest($1::text[], $2::text[])
		  )
	`
	tag, err := r.pool.Exec(ctx, sql, companies, types)
	if err != nil {
		return 0, fmt.Errorf("mark inactive: %w", err)
	}
	return int(tag.RowsAffected()), nil
}

func (r *repository) ListJobPostings(ctx context.Context, filters model.JobPostingFilters) ([]model.JobPosting, int, error) {
	page := filters.Page
	if page < 1 {
		page = 1
	}
	pageSize := filters.PageSize
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 200 {
		pageSize = 200
	}

	// 默认过滤 2026 年之前的数据（开启时间为空者保留，视为未知年份）
	where := []string{
		"is_active = true",
		"(open_date IS NULL OR open_date >= DATE '2026-01-01')",
	}
	args := []interface{}{}
	argIdx := 1

	// 行业 / 招聘类型筛选走归一化分类列（下拉枚举也来自分类列）
	if filters.Industry != "" {
		where = append(where, fmt.Sprintf("industry_category = $%d", argIdx))
		args = append(args, filters.Industry)
		argIdx++
	}
	if filters.RecruitmentType != "" {
		where = append(where, fmt.Sprintf("recruitment_category = $%d", argIdx))
		args = append(args, filters.RecruitmentType)
		argIdx++
	}
	if filters.Keyword != "" {
		where = append(where, fmt.Sprintf(
			"(coalesce(company_name,'') || ' ' || coalesce(positions,'') || ' ' || coalesce(industry,'') || ' ' || coalesce(location,'')) ILIKE $%d",
			argIdx))
		args = append(args, "%"+filters.Keyword+"%")
		argIdx++
	}

	// 「是否投递」筛选依赖 job_posting_marks 中是否存在当前用户的标记行；
	// 未登录（UserID 为空）时该筛选不生效，交由前端隐藏该选项。
	var markUserIdx int
	if filters.Applied != "" && filters.UserID != "" {
		markUserIdx = argIdx
		args = append(args, filters.UserID)
		argIdx++
		existsClause := fmt.Sprintf(
			"EXISTS (SELECT 1 FROM job_posting_marks m WHERE m.user_id = $%d AND m.job_posting_id = job_postings.id)",
			markUserIdx,
		)
		if filters.Applied == "true" {
			where = append(where, existsClause)
		} else {
			where = append(where, "NOT "+existsClause)
		}
	}
	whereClause := strings.Join(where, " AND ")

	var total int
	countSQL := fmt.Sprintf("SELECT COUNT(*) FROM job_postings WHERE %s", whereClause)
	if err := r.pool.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count job_postings: %w", err)
	}

	sortClause := "open_date DESC NULLS LAST"
	if filters.Sort == "open_date_asc" {
		sortClause = "open_date ASC NULLS LAST"
	}
	offset := (page - 1) * pageSize
	listArgs := append([]interface{}{}, args...)
	listArgs = append(listArgs, pageSize, offset)

	// 是否已投递（applied）始终随列表一起返回，供表格展示标记状态；
	// 未登录时 filters.UserID 为空，applied 一律为 false。
	appliedExpr := "false"
	appliedArgs := []interface{}{}
	if filters.UserID != "" {
		appliedExpr = fmt.Sprintf(
			"EXISTS (SELECT 1 FROM job_posting_marks m WHERE m.user_id = $%d AND m.job_posting_id = job_postings.id)",
			argIdx+2,
		)
		appliedArgs = append(appliedArgs, filters.UserID)
	}
	listArgs = append(listArgs, appliedArgs...)

	listSQL := fmt.Sprintf(`
		SELECT id, source, source_id, company_name, industry, industry_category,
		       recruitment_type, recruitment_category,
		       open_date, location, positions, application_url, referral_code, notes,
		       is_active, created_at, updated_at, scraped_at, %s AS applied
		FROM job_postings
		WHERE %s
		ORDER BY %s
		LIMIT $%d OFFSET $%d
	`, appliedExpr, whereClause, sortClause, argIdx, argIdx+1)

	rows, err := r.pool.Query(ctx, listSQL, listArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("query job_postings: %w", err)
	}
	defer rows.Close()

	items := make([]model.JobPosting, 0, pageSize)
	for rows.Next() {
		var jp model.JobPosting
		var sourceID, industry, indCategory, recType, recCategory, location, positions, appURL, referral, notes sql.NullString
		var openDate sql.NullTime
		if err := rows.Scan(
			&jp.ID, &jp.Source, &sourceID, &jp.CompanyName, &industry, &indCategory,
			&recType, &recCategory,
			&openDate, &location, &positions, &appURL, &referral, &notes,
			&jp.IsActive, &jp.CreatedAt, &jp.UpdatedAt, &jp.ScrapedAt, &jp.Applied,
		); err != nil {
			return nil, 0, fmt.Errorf("scan job_posting: %w", err)
		}
		jp.SourceID = sourceID.String
		jp.Industry = industry.String
		jp.IndustryCategory = indCategory.String
		jp.RecruitmentType = recType.String
		jp.RecruitmentCategory = recCategory.String
		jp.Location = location.String
		jp.Positions = positions.String
		jp.ApplicationURL = appURL.String
		jp.ReferralCode = referral.String
		jp.Notes = notes.String
		if openDate.Valid {
			t := openDate.Time
			jp.OpenDate = &t
		}
		items = append(items, jp)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate job_postings: %w", err)
	}
	return items, total, nil
}

// SetMark 设置/取消当前用户对某条招聘信息的「已投递」标记；
// applied=true 时幂等插入（存在则忽略），applied=false 时删除标记。
func (r *repository) SetMark(ctx context.Context, userID, jobPostingID string, applied bool) error {
	if applied {
		_, err := r.pool.Exec(ctx, `
			INSERT INTO job_posting_marks (user_id, job_posting_id)
			VALUES ($1, $2)
			ON CONFLICT (user_id, job_posting_id) DO NOTHING
		`, userID, jobPostingID)
		if err != nil {
			return fmt.Errorf("insert job_posting_mark: %w", err)
		}
		return nil
	}
	_, err := r.pool.Exec(ctx, `
		DELETE FROM job_posting_marks WHERE user_id = $1 AND job_posting_id = $2
	`, userID, jobPostingID)
	if err != nil {
		return fmt.Errorf("delete job_posting_mark: %w", err)
	}
	return nil
}

func (r *repository) GetFilters(ctx context.Context) (*model.JobPostingFiltersResponse, error) {
	// 筛选枚举返回归一化后的大类（招聘类型 ~7 类、行业 ~16 类）
	industries, err := r.distinct(ctx, "industry_category")
	if err != nil {
		return nil, err
	}
	types, err := r.distinct(ctx, "recruitment_category")
	if err != nil {
		return nil, err
	}
	return &model.JobPostingFiltersResponse{Industries: industries, Types: types}, nil
}

func (r *repository) distinct(ctx context.Context, col string) ([]string, error) {
	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		SELECT DISTINCT %s FROM job_postings
		WHERE is_active = true AND %s IS NOT NULL AND %s <> ''
		  AND (open_date IS NULL OR open_date >= DATE '2026-01-01')
		ORDER BY %s
	`, col, col, col, col))
	if err != nil {
		return nil, fmt.Errorf("distinct %s: %w", col, err)
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, fmt.Errorf("scan %s: %w", col, err)
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func nullIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
