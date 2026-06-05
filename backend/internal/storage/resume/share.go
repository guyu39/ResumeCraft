package resume

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"resumecraft-pdf-backend/internal/model"

	"github.com/google/uuid"
)

// ----- Share Link -----

func (r *repository) CreateShareLink(ctx context.Context, resumeID, userID, token string, expiresInDays int) (*model.ShareLink, error) {
	id := uuid.New().String()
	now := time.Now()
	var expiresAt *time.Time
	if expiresInDays > 0 {
		t := now.Add(time.Duration(expiresInDays) * 24 * time.Hour)
		expiresAt = &t
	}

	_, err := r.pool.Exec(ctx,
		`INSERT INTO share_links (id, resume_id, token, created_by, expires_at, is_active, created_at)
		 VALUES ($1, $2, $3, $4, $5, true, $6)`,
		id, resumeID, token, userID, expiresAt, now,
	)
	if err != nil {
		return nil, fmt.Errorf("create share link: %w", err)
	}

	return r.GetShareLinkByToken(ctx, token)
}

func (r *repository) GetShareLinkByToken(ctx context.Context, token string) (*model.ShareLink, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, resume_id, token, created_by, expires_at, view_count, is_active,
		 COALESCE(EXTRACT(EPOCH FROM created_at) * 1000, 0)::bigint
		 FROM share_links WHERE token = $1`, token,
	)

	var sl model.ShareLink
	var expiresAt *time.Time
	if err := row.Scan(&sl.ID, &sl.ResumeID, &sl.Token, &sl.CreatedBy,
		&expiresAt, &sl.ViewCount, &sl.IsActive, &sl.CreatedAt); err != nil {
		return nil, fmt.Errorf("get share link by token: %w", err)
	}

	if expiresAt != nil {
		ts := expiresAt.UnixMilli()
		sl.ExpiresAt = &ts
	}
	return &sl, nil
}

func (r *repository) ListShareLinksByResume(ctx context.Context, resumeID, userID string) ([]model.ShareLink, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, resume_id, token, created_by, expires_at, view_count, is_active,
		 COALESCE(EXTRACT(EPOCH FROM created_at) * 1000, 0)::bigint
		 FROM share_links
		 WHERE resume_id = $1 AND created_by = $2
		 ORDER BY created_at DESC`, resumeID, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var links []model.ShareLink
	for rows.Next() {
		var sl model.ShareLink
		var expiresAt *time.Time
		if err := rows.Scan(&sl.ID, &sl.ResumeID, &sl.Token, &sl.CreatedBy,
			&expiresAt, &sl.ViewCount, &sl.IsActive, &sl.CreatedAt); err != nil {
			return nil, err
		}
		if expiresAt != nil {
			ts := expiresAt.UnixMilli()
			sl.ExpiresAt = &ts
		}
		links = append(links, sl)
	}
	return links, nil
}

func (r *repository) IncrementShareViewCount(ctx context.Context, token string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE share_links SET view_count = view_count + 1 WHERE token = $1`, token,
	)
	return err
}

func (r *repository) DeactivateShareLink(ctx context.Context, shariID, userID string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE share_links SET is_active = false WHERE id = $1 AND created_by = $2`,
		shariID, userID,
	)
	return err
}

// ----- Comments -----

func (r *repository) AddComment(ctx context.Context, shareID, authorName, content, moduleID, visitorID string, itemIndex int) (*model.ShareComment, error) {
	id := uuid.New().String()
	now := time.Now()
	if authorName == "" {
		authorName = "匿名"
	}
	if visitorID == "" {
		visitorID = ""
	}

	_, err := r.pool.Exec(ctx,
		`INSERT INTO share_comments (id, share_id, visitor_id, author_name, content, module_id, item_index, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		id, shareID, visitorID, authorName, content, moduleID, itemIndex, now,
	)
	if err != nil {
		return nil, fmt.Errorf("add comment: %w", err)
	}

	return &model.ShareComment{
		ID:         id,
		ShareID:    shareID,
		VisitorID:  visitorID,
		AuthorName: authorName,
		Content:    content,
		ModuleID:   moduleID,
		ItemIndex:  itemIndex,
		CreatedAt:  now.UnixMilli(),
	}, nil
}

func (r *repository) ListComments(ctx context.Context, shareID, visitorID string) ([]model.ShareComment, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, share_id, author_name, content, COALESCE(module_id,''), COALESCE(item_index,0),
		 COALESCE(EXTRACT(EPOCH FROM created_at) * 1000, 0)::bigint
		 FROM share_comments
		 WHERE share_id = $1 AND visitor_id = $2
		 ORDER BY created_at ASC`, shareID, visitorID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []model.ShareComment
	for rows.Next() {
		var c model.ShareComment
		if err := rows.Scan(&c.ID, &c.ShareID, &c.AuthorName, &c.Content, &c.ModuleID, &c.ItemIndex, &c.CreatedAt); err != nil {
			return nil, err
		}
		comments = append(comments, c)
	}
	return comments, nil
}

// ListCommentsByResume 获取简历的全部评论（管理员视图）
func (r *repository) ListCommentsByResume(ctx context.Context, resumeID string) ([]model.AdminCommentItem, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT sc.id, sl.token, sc.visitor_id, sc.author_name, sc.content,
		 sc.module_id, COALESCE(sc.item_index,0),
		 COALESCE(EXTRACT(EPOCH FROM sc.created_at) * 1000, 0)::bigint
		 FROM share_comments sc
		 JOIN share_links sl ON sc.share_id = sl.id
		 WHERE sl.resume_id = $1
		 ORDER BY sc.module_id, sc.item_index, sc.created_at ASC`,
		resumeID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []model.AdminCommentItem
	for rows.Next() {
		var item model.AdminCommentItem
		if err := rows.Scan(&item.ID, &item.ShareToken, &item.VisitorID, &item.AuthorName,
			&item.Content, &item.ModuleID, &item.ItemIndex, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

// ----- Static helpers for repo bootstrap (shared service can use these) -----
func marshalModules(modules []map[string]interface{}) []byte {
	b, _ := json.Marshal(modules)
	return b
}

func unmarshalModules(data []byte) []map[string]interface{} {
	var modules []map[string]interface{}
	json.Unmarshal(data, &modules)
	return modules
}

// Ensure package compiles
var _ = log.Printf
