package resume

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"resumecraft-pdf-backend/internal/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ----- Share Link -----

func (r *repository) CreateShareLink(ctx context.Context, resumeID, userID, token string, expiresInDays int, snapshotID *string) (*model.ShareLink, error) {
	id := uuid.New().String()
	now := time.Now()
	var expiresAt *time.Time
	if expiresInDays > 0 {
		t := now.Add(time.Duration(expiresInDays) * 24 * time.Hour)
		expiresAt = &t
	}

	// 空字符串转 nil
	var dbSnapshotID interface{}
	if snapshotID != nil && *snapshotID != "" {
		dbSnapshotID = *snapshotID
	} else {
		dbSnapshotID = nil
	}

	_, err := r.pool.Exec(ctx,
		`INSERT INTO share_links (id, resume_id, token, created_by, expires_at, snapshot_id, is_active, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, true, $7)`,
		id, resumeID, token, userID, expiresAt, dbSnapshotID, now,
	)
	if err != nil {
		return nil, fmt.Errorf("create share link: %w", err)
	}

	return r.GetShareLinkByToken(ctx, token)
}

func (r *repository) GetShareLinkByToken(ctx context.Context, token string) (*model.ShareLink, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, resume_id, token, created_by, snapshot_id, expires_at, view_count, is_active,
		 COALESCE(EXTRACT(EPOCH FROM created_at) * 1000, 0)::bigint
		 FROM share_links WHERE token = $1`, token,
	)

	var sl model.ShareLink
	var expiresAt *time.Time
	var snapshotID *string
	if err := row.Scan(&sl.ID, &sl.ResumeID, &sl.Token, &sl.CreatedBy,
		&snapshotID, &expiresAt, &sl.ViewCount, &sl.IsActive, &sl.CreatedAt); err != nil {
		return nil, fmt.Errorf("get share link by token: %w", err)
	}

	sl.SnapshotID = snapshotID

	if expiresAt != nil {
		ts := expiresAt.UnixMilli()
		sl.ExpiresAt = &ts
	}
	return &sl, nil
}

func (r *repository) ListShareLinksByResume(ctx context.Context, resumeID, userID string) ([]model.ShareLink, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, resume_id, token, created_by, snapshot_id, expires_at, view_count, is_active,
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
		var snapshotID *string
		if err := rows.Scan(&sl.ID, &sl.ResumeID, &sl.Token, &sl.CreatedBy,
			&snapshotID, &expiresAt, &sl.ViewCount, &sl.IsActive, &sl.CreatedAt); err != nil {
			return nil, err
		}
		sl.SnapshotID = snapshotID
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

func (r *repository) AddComment(ctx context.Context, shareID, authorName, content, moduleID, visitorID string, itemIndex int, snapshotID *string) (*model.ShareComment, error) {
	id := uuid.New().String()
	now := time.Now()
	if authorName == "" {
		authorName = "匿名"
	}

	// 空字符串转 nil，避免 PostgreSQL UUID 列报错
	var dbSnapshotID interface{}
	if snapshotID != nil && *snapshotID != "" {
		dbSnapshotID = *snapshotID
	} else {
		dbSnapshotID = nil
	}

	_, err := r.pool.Exec(ctx,
		`INSERT INTO share_comments (id, share_id, visitor_id, author_name, content, module_id, item_index, snapshot_id, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		id, shareID, visitorID, authorName, content, moduleID, itemIndex, dbSnapshotID, now,
	)
	if err != nil {
		return nil, fmt.Errorf("add comment: %w", err)
	}

	return &model.ShareComment{
		ID:         id,
		ShareID:    shareID,
		SnapshotID: snapshotID,
		VisitorID:  visitorID,
		AuthorName: authorName,
		Content:    content,
		ModuleID:   moduleID,
		ItemIndex:  itemIndex,
		CreatedAt:  now.UnixMilli(),
	}, nil
}

func (r *repository) ListComments(ctx context.Context, shareID, visitorID, snapshotID string) ([]model.ShareComment, error) {
	var rows pgx.Rows
	var err error

	if snapshotID != "" {
		rows, err = r.pool.Query(ctx,
			`SELECT id, share_id, author_name, content, COALESCE(module_id,''), COALESCE(item_index,0),
			 COALESCE(snapshot_id::text, ''), COALESCE(EXTRACT(EPOCH FROM created_at) * 1000, 0)::bigint
			 FROM share_comments
			 WHERE share_id = $1 AND visitor_id = $2 AND snapshot_id = $3
			 ORDER BY created_at ASC`, shareID, visitorID, snapshotID,
		)
	} else {
		rows, err = r.pool.Query(ctx,
			`SELECT id, share_id, author_name, content, COALESCE(module_id,''), COALESCE(item_index,0),
			 COALESCE(snapshot_id::text, ''), COALESCE(EXTRACT(EPOCH FROM created_at) * 1000, 0)::bigint
			 FROM share_comments
			 WHERE share_id = $1 AND visitor_id = $2
			 ORDER BY created_at ASC`, shareID, visitorID,
		)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []model.ShareComment
	for rows.Next() {
		var c model.ShareComment
		var snapshotID *string
		if err := rows.Scan(&c.ID, &c.ShareID, &c.AuthorName, &c.Content, &c.ModuleID, &c.ItemIndex, &snapshotID, &c.CreatedAt); err != nil {
			return nil, err
		}
		c.SnapshotID = snapshotID
		comments = append(comments, c)
	}
	return comments, nil
}

// ListCommentsByResume 获取简历的全部评论（管理员视图）
func (r *repository) ListCommentsByResume(ctx context.Context, resumeID string) ([]model.AdminCommentItem, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT sc.id, sl.token, COALESCE(NULLIF(sc.visitor_id::text, ''), ''), sc.author_name, sc.content,
		 sc.module_id, COALESCE(sc.item_index,0),
		 COALESCE(sc.snapshot_id::text, ''), COALESCE(vs.label, ''),
		 COALESCE(EXTRACT(EPOCH FROM sc.created_at) * 1000, 0)::bigint
		 FROM share_comments sc
		 JOIN share_links sl ON sc.share_id = sl.id
		 LEFT JOIN resume_versions vs ON sc.snapshot_id IS NOT NULL AND sc.snapshot_id::text != '' AND sc.snapshot_id = vs.id
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
		var snapshotID, snapshotLabel *string
		if err := rows.Scan(&item.ID, &item.ShareToken, &item.VisitorID, &item.AuthorName,
			&item.Content, &item.ModuleID, &item.ItemIndex,
			&snapshotID, &snapshotLabel, &item.CreatedAt); err != nil {
			return nil, err
		}
		item.SnapshotID = snapshotID
		item.SnapshotLabel = snapshotLabel
		items = append(items, item)
	}
	return items, nil
}

// DeleteComment 删除分享评论（不需要认证，公开接口）
func (r *repository) DeleteComment(ctx context.Context, commentID string) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM share_comments WHERE id = $1`, commentID)
	if err != nil {
		return fmt.Errorf("delete comment: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return fmt.Errorf("comment not found")
	}
	return nil
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
