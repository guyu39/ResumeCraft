package home

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"time"

	"resumecraft-pdf-backend/internal/model"

	"github.com/jackc/pgx/v5/pgxpool"
)

// TodoRepository 首页待办存储层：聚合投递笔试与面试时间
type TodoRepository interface {
	// ListTodos 返回该用户全部待办（面试 + 笔试），按时间升序
	ListTodos(ctx context.Context, userID string) ([]model.TodoItem, error)
}

type todoRepository struct {
	pool *pgxpool.Pool
}

func NewTodoRepository(pool *pgxpool.Pool) TodoRepository {
	return &todoRepository{pool: pool}
}

func (r *todoRepository) ListTodos(ctx context.Context, userID string) ([]model.TodoItem, error) {
	items := make([]model.TodoItem, 0, 16)

	// 面试待办：已排期（scheduled_at 非空）且投递未被软删除
	rows, err := r.pool.Query(ctx, `
		SELECT i.id, ja.id, ja.company_name, ja.target_title, COALESCE(ja.department, ''),
		       i.round, i.scheduled_at, i.scheduled_end, ja.status, COALESCE(ja.application_url, '')
		FROM job_application_interviews i
		JOIN job_applications ja ON ja.id = i.application_id
		WHERE i.user_id = $1 AND i.scheduled_at IS NOT NULL AND ja.deleted_at IS NULL
		ORDER BY i.scheduled_at ASC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list interview todos: %w", err)
	}
	for rows.Next() {
		var (
			item         model.TodoItem
			scheduledAt  time.Time
			scheduledEnd sql.NullTime
		)
		if err := rows.Scan(
			&item.ID, &item.ApplicationID, &item.CompanyName, &item.TargetTitle,
			&item.Department, &item.Round, &scheduledAt, &scheduledEnd,
			&item.Status, &item.ApplicationURL,
		); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scan interview todo: %w", err)
		}
		item.Type = string(model.TodoTypeInterview)
		item.ID = "interview-" + item.ID
		item.ScheduledAt = scheduledAt.UnixMilli()
		if scheduledEnd.Valid {
			ms := scheduledEnd.Time.UnixMilli()
			item.ScheduledEnd = &ms
		}
		items = append(items, item)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate interview todos: %w", err)
	}

	// 笔试待办：written_test_at 非空且投递未被软删除
	rows, err = r.pool.Query(ctx, `
		SELECT id, company_name, target_title, COALESCE(department, ''),
		       written_test_at, status, COALESCE(application_url, '')
		FROM job_applications
		WHERE user_id = $1 AND written_test_at IS NOT NULL AND deleted_at IS NULL
		ORDER BY written_test_at ASC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list written-test todos: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var (
			item        model.TodoItem
			writtenTest time.Time
		)
		if err := rows.Scan(
			&item.ID, &item.CompanyName, &item.TargetTitle,
			&item.Department, &writtenTest, &item.Status, &item.ApplicationURL,
		); err != nil {
			return nil, fmt.Errorf("scan written-test todo: %w", err)
		}
		item.Type = string(model.TodoTypeWrittenTest)
		item.ApplicationID = item.ID
		item.ID = "test-" + item.ID
		item.ScheduledAt = writtenTest.UnixMilli()
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate written-test todos: %w", err)
	}

	// 合并后按时间升序
	sort.Slice(items, func(i, j int) bool { return items[i].ScheduledAt < items[j].ScheduledAt })
	return items, nil
}
