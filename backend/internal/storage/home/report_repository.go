package home

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"resumecraft-pdf-backend/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ReportRepository 首页 AI 日报存储层
type ReportRepository interface {
	// GetLatest 返回最近一份日报（按日期倒序），不存在时返回 nil
	GetLatest(ctx context.Context) (*model.AiDailyReport, error)
	// ListRecent 返回近 days 天日报（按日期倒序）
	ListRecent(ctx context.Context, days int) ([]model.AiDailyReport, error)
	// Upsert 按 report_date 幂等写入（当日已存在则整体覆盖），返回报告 ID
	Upsert(ctx context.Context, report model.AiDailyReport) (int64, error)
}

type reportRepository struct {
	pool *pgxpool.Pool
}

func NewReportRepository(pool *pgxpool.Pool) ReportRepository {
	return &reportRepository{pool: pool}
}

func (r *reportRepository) Upsert(ctx context.Context, report model.AiDailyReport) (int64, error) {
	rawItems, err := json.Marshal(report.Items)
	if err != nil {
		return 0, fmt.Errorf("marshal report items: %w", err)
	}
	reportDate, err := time.Parse("2006-01-02", report.ReportDate)
	if err != nil {
		return 0, fmt.Errorf("parse report date %q: %w", report.ReportDate, err)
	}
	var id int64
	err = r.pool.QueryRow(ctx, `
		INSERT INTO ai_daily_reports (report_date, title, theme, trend_keywords, items, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
		ON CONFLICT (report_date) DO UPDATE SET
			title = EXCLUDED.title,
			theme = EXCLUDED.theme,
			trend_keywords = EXCLUDED.trend_keywords,
			items = EXCLUDED.items,
			updated_at = NOW()
		RETURNING id
	`, reportDate, report.Title, report.Theme, report.TrendKeywords, rawItems).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("upsert daily report: %w", err)
	}
	return id, nil
}

func (r *reportRepository) GetLatest(ctx context.Context) (*model.AiDailyReport, error) {
	var (
		report      model.AiDailyReport
		reportDate  time.Time
		rawItems    []byte
		createdAt   time.Time
	)
	err := r.pool.QueryRow(ctx, `
		SELECT id, report_date, title, theme, trend_keywords, items, created_at
		FROM ai_daily_reports
		ORDER BY report_date DESC
		LIMIT 1
	`).Scan(&report.ID, &reportDate, &report.Title, &report.Theme, &report.TrendKeywords, &rawItems, &createdAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get latest daily report: %w", err)
	}
	report.ReportDate = reportDate.Format("2006-01-02")
	report.CreatedAt = createdAt.UnixMilli()
	if len(rawItems) > 0 {
		if err := json.Unmarshal(rawItems, &report.Items); err != nil {
			return nil, fmt.Errorf("unmarshal daily report items: %w", err)
		}
	}
	return &report, nil
}

func (r *reportRepository) ListRecent(ctx context.Context, days int) ([]model.AiDailyReport, error) {
	if days <= 0 {
		days = 7
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, report_date, title, theme, trend_keywords, items, created_at
		FROM ai_daily_reports
		WHERE report_date >= CURRENT_DATE - ($1::int - 1)
		ORDER BY report_date DESC
	`, days)
	if err != nil {
		return nil, fmt.Errorf("list recent daily reports: %w", err)
	}
	defer rows.Close()

	reports := make([]model.AiDailyReport, 0, days)
	for rows.Next() {
		var report model.AiDailyReport
		var reportDate time.Time
		var rawItems []byte
		var createdAt time.Time
		if err := rows.Scan(&report.ID, &reportDate, &report.Title, &report.Theme, &report.TrendKeywords, &rawItems, &createdAt); err != nil {
			return nil, fmt.Errorf("scan daily report: %w", err)
		}
		report.ReportDate = reportDate.Format("2006-01-02")
		report.CreatedAt = createdAt.UnixMilli()
		if len(rawItems) > 0 {
			if err := json.Unmarshal(rawItems, &report.Items); err != nil {
				return nil, fmt.Errorf("unmarshal daily report items: %w", err)
			}
		}
		reports = append(reports, report)
	}
	return reports, rows.Err()
}
