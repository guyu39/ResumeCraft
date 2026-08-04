package home

import (
	"context"
	"fmt"
	"strings"
	"time"

	"resumecraft-pdf-backend/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ProjectRepository 首页简历项目推荐存储层
type ProjectRepository interface {
	// ListActive 返回启用中的项目推荐，按 sort_order 升序
	ListActive(ctx context.Context) ([]model.ResumeProject, error)
	// ListUpdatedOn 返回指定日期（本地日）更新过的启用项目（含 id/updatedAt），按 updated_at 倒序
	ListUpdatedOn(ctx context.Context, date string) ([]model.ResumeProject, error)
	// UpsertAll 按 name 幂等批量写入（已存在则更新，新名称插入），返回写入条数
	UpsertAll(ctx context.Context, items []model.ResumeProject) (int, error)
}

type projectRepository struct {
	pool *pgxpool.Pool
}

func NewProjectRepository(pool *pgxpool.Pool) ProjectRepository {
	return &projectRepository{pool: pool}
}

func (r *projectRepository) ListActive(ctx context.Context) ([]model.ResumeProject, error) {
	return r.queryUpdated(ctx, "")
}

// ListUpdatedOn 指定日期当天更新过的启用项目（含 id/updatedAt）
func (r *projectRepository) ListUpdatedOn(ctx context.Context, date string) ([]model.ResumeProject, error) {
	return r.queryUpdated(ctx, date)
}

func (r *projectRepository) queryUpdated(ctx context.Context, date string) ([]model.ResumeProject, error) {
	sql := `
		SELECT id, name, tagline, tech_stack, modules, star_summary, duration, difficulty, trend_relation, sort_order, updated_at
		FROM resume_projects
		WHERE active = TRUE
	`
	var rows pgx.Rows
	var err error
	if date != "" {
		sql += ` AND updated_at >= $1::date AND updated_at < ($1::date + INTERVAL '1 day')`
		sql += ` ORDER BY updated_at DESC`
		rows, err = r.pool.Query(ctx, sql, date)
	} else {
		sql += ` ORDER BY updated_at DESC`
		rows, err = r.pool.Query(ctx, sql)
	}
	if err != nil {
		return nil, fmt.Errorf("list resume projects: %w", err)
	}
	defer rows.Close()

	items := make([]model.ResumeProject, 0, 8)
	for rows.Next() {
		var p model.ResumeProject
		var updatedAt time.Time
		if err := rows.Scan(&p.ID, &p.Name, &p.Tagline, &p.TechStack, &p.Modules,
			&p.StarSummary, &p.Duration, &p.Difficulty, &p.TrendRelation, &p.SortOrder, &updatedAt); err != nil {
			return nil, fmt.Errorf("scan resume project: %w", err)
		}
		p.UpdatedAt = updatedAt.UnixMilli()
		items = append(items, p)
	}
	return items, rows.Err()
}

func (r *projectRepository) UpsertAll(ctx context.Context, items []model.ResumeProject) (int, error) {
	if len(items) == 0 {
		return 0, nil
	}
	batch := &pgx.Batch{}
	for i, p := range items {
		star := p.StarSummary
		// 前端按 S/T、A、R 分列渲染：AI 生成的分段拼回 STAR 单字段
		if star == "" && (p.ST != "" || p.A != "" || p.R != "") {
			var sb strings.Builder
			if p.ST != "" {
				sb.WriteString("S/T：" + p.ST + " ")
			}
			if p.A != "" {
				sb.WriteString("A：" + p.A + " ")
			}
			if p.R != "" {
				sb.WriteString("R：" + p.R)
			}
			star = strings.TrimSpace(sb.String())
		}
		batch.Queue(`
			INSERT INTO resume_projects (name, tagline, tech_stack, modules, star_summary, duration, difficulty, trend_relation, sort_order, active)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
			ON CONFLICT (name) DO UPDATE SET
				tagline = EXCLUDED.tagline,
				tech_stack = EXCLUDED.tech_stack,
				modules = EXCLUDED.modules,
				star_summary = EXCLUDED.star_summary,
				duration = EXCLUDED.duration,
				difficulty = EXCLUDED.difficulty,
				trend_relation = EXCLUDED.trend_relation,
				sort_order = EXCLUDED.sort_order,
				active = TRUE,
				updated_at = NOW()
		`, p.Name, p.Tagline, p.TechStack, p.Modules, star, p.Duration, p.Difficulty, p.TrendRelation, i)
	}
	br := r.pool.SendBatch(ctx, batch)
	defer br.Close()

	inserted := 0
	for range items {
		if _, err := br.Exec(); err != nil {
			return inserted, fmt.Errorf("upsert resume project: %w", err)
		}
		inserted++
	}
	return inserted, nil
}
