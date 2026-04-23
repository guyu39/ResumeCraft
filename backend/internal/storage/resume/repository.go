package resume

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"resumecraft-pdf-backend/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrResumeNotFound = errors.New("resume not found")
)

type Repository interface {
	List(ctx context.Context, userID string, page, pageSize int, keyword string) ([]model.ResumeListItem, int, error)
	Create(ctx context.Context, userID string, req model.CreateResumeRequest) (*model.ResumeListItem, error)
	GetByID(ctx context.Context, userID, resumeID string) (*model.ResumeDetail, error)
	Update(ctx context.Context, userID, resumeID string, req model.UpdateResumeRequest) (*model.ResumeUpdateResponse, error)
	Delete(ctx context.Context, userID, resumeID string) error
	RestoreFromVersion(ctx context.Context, userID, resumeID string, versionContent []byte) (*model.ResumeUpdateResponse, error)
	GetVersionContent(ctx context.Context, versionID string) ([]byte, error)
}

type repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) Repository {
	return &repository{pool: pool}
}

func (r *repository) List(ctx context.Context, userID string, page, pageSize int, keyword string) ([]model.ResumeListItem, int, error) {
	offset := (page - 1) * pageSize

	// 构建搜索条件
	searchCond := ""
	args := []interface{}{userID}
	argIdx := 2

	if keyword != "" {
		searchCond = fmt.Sprintf(" AND title ILIKE $%d", argIdx)
		args = append(args, "%"+keyword+"%")
		argIdx++
	}

	// 查询总数
	var total int
	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM resumes WHERE user_id = $1 AND deleted_at IS NULL%s`, searchCond)
	err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("count resumes: %w", err)
	}

	// 查询列表
	query := fmt.Sprintf(`
		SELECT id, title, template, updated_at, created_at
		FROM resumes
		WHERE user_id = $1 AND deleted_at IS NULL%s
		ORDER BY updated_at DESC
		LIMIT $%d OFFSET $%d
	`, searchCond, argIdx, argIdx+1)

	args = append(args, pageSize, offset)
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list resumes: %w", err)
	}
	defer rows.Close()

	var items []model.ResumeListItem
	for rows.Next() {
		var item model.ResumeListItem
		var updatedAt, createdAt time.Time
		if err := rows.Scan(&item.ID, &item.Title, &item.Template, &updatedAt, &createdAt); err != nil {
			return nil, 0, fmt.Errorf("scan resume: %w", err)
		}
		item.UpdatedAt = updatedAt.UnixMilli()
		item.CreatedAt = createdAt.UnixMilli()
		items = append(items, item)
	}

	if items == nil {
		items = []model.ResumeListItem{}
	}

	return items, total, nil
}

func (r *repository) Create(ctx context.Context, userID string, req model.CreateResumeRequest) (*model.ResumeListItem, error) {
	locale := req.Locale
	if locale == "" {
		locale = "zh-CN"
	}
	template := req.Template
	if template == "" {
		template = "classic"
	}

	// 构建 content JSON
	content := model.ResumeContent{
		ThemeColor:    req.ThemeColor,
		StyleSettings: getOrDefaultStyleSettings(req.StyleSettings),
		Modules:       req.Modules,
	}
	if content.Modules == nil {
		content.Modules = []map[string]interface{}{}
	}

	contentJSON, err := json.Marshal(content)
	if err != nil {
		return nil, fmt.Errorf("marshal content: %w", err)
	}

	var item model.ResumeListItem
	var updatedAt, createdAt time.Time
	err = r.pool.QueryRow(ctx, `
		INSERT INTO resumes (user_id, title, locale, template, content)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, title, template, updated_at, created_at
	`, userID, req.Title, locale, template, contentJSON).Scan(
		&item.ID, &item.Title, &item.Template, &updatedAt, &createdAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create resume: %w", err)
	}

	item.UpdatedAt = updatedAt.UnixMilli()
	item.CreatedAt = createdAt.UnixMilli()

	return &item, nil
}

func (r *repository) GetByID(ctx context.Context, userID, resumeID string) (*model.ResumeDetail, error) {
	var detail model.ResumeDetail
	var contentJSON []byte
	var updatedAt, createdAt time.Time

	err := r.pool.QueryRow(ctx, `
		SELECT id, title, locale, template, content, latest_version_id, updated_at, created_at
		FROM resumes
		WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
	`, resumeID, userID).Scan(
		&detail.ID, &detail.Title, &detail.Locale, &detail.Template,
		&contentJSON, &detail.LatestVersionID, &updatedAt, &createdAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrResumeNotFound
		}
		return nil, fmt.Errorf("get resume: %w", err)
	}

	// 解析 content
	var content model.ResumeContent
	if err := json.Unmarshal(contentJSON, &content); err != nil {
		return nil, fmt.Errorf("unmarshal content: %w", err)
	}

	detail.ThemeColor = content.ThemeColor
	detail.StyleSettings = content.StyleSettings
	detail.Modules = content.Modules
	detail.UpdatedAt = updatedAt.UnixMilli()
	detail.CreatedAt = createdAt.UnixMilli()

	return &detail, nil
}

func (r *repository) Update(ctx context.Context, userID, resumeID string, req model.UpdateResumeRequest) (*model.ResumeUpdateResponse, error) {
	// 先获取当前简历信息
	var currentVersionID *string // NULL 可能
	var currentContentJSON []byte
	err := r.pool.QueryRow(ctx, `
		SELECT latest_version_id, content FROM resumes WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
	`, resumeID, userID).Scan(&currentVersionID, &currentContentJSON)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrResumeNotFound
		}
		return nil, fmt.Errorf("get resume for update: %w", err)
	}

	// 构建更新字段
	updates := []string{}
	args := []interface{}{}
	argIdx := 1

	if req.Title != "" {
		updates = append(updates, fmt.Sprintf("title = $%d", argIdx))
		args = append(args, req.Title)
		argIdx++
	}

	if req.Modules != nil || req.ThemeColor != "" || req.StyleSettings != nil {
		// 合并现有 content
		var existingContent model.ResumeContent
		json.Unmarshal(currentContentJSON, &existingContent)

		if req.ThemeColor != "" {
			existingContent.ThemeColor = req.ThemeColor
		}
		if req.StyleSettings != nil {
			existingContent.StyleSettings = *req.StyleSettings
		}
		if req.Modules != nil {
			existingContent.Modules = req.Modules
		}

		contentJSON, err := json.Marshal(existingContent)
		if err != nil {
			return nil, fmt.Errorf("marshal content: %w", err)
		}
		updates = append(updates, fmt.Sprintf("content = $%d", argIdx))
		args = append(args, contentJSON)
		argIdx++
	}

	if len(updates) == 0 {
		// 没有更新内容，返回当前状态
		var updatedAt time.Time
		err := r.pool.QueryRow(ctx, `
			SELECT updated_at FROM resumes WHERE id = $1 AND user_id = $2
		`, resumeID, userID).Scan(&updatedAt)
		if err != nil {
			return nil, fmt.Errorf("get updated_at: %w", err)
		}
		return &model.ResumeUpdateResponse{
			ID:              resumeID,
			UpdatedAt:       updatedAt.UnixMilli(),
			LatestVersionID: currentVersionID,
		}, nil
	}

	// 创建新版本（保存当前内容）
	newVersionID, err := r.createVersion(ctx, resumeID, userID, currentContentJSON)
	if err != nil {
		return nil, fmt.Errorf("create version: %w", err)
	}

	updates = append(updates, fmt.Sprintf("latest_version_id = $%d", argIdx))
	args = append(args, newVersionID)
	argIdx++

	updates = append(updates, "updated_at = NOW()")

	setClause := strings.Join(updates, ", ")
	whereIdx := argIdx
	query := fmt.Sprintf(`UPDATE resumes SET %s WHERE id = $%d AND user_id = $%d AND deleted_at IS NULL RETURNING updated_at`, setClause, whereIdx, whereIdx+1)
	args = append(args, resumeID, userID)

	var updatedAt time.Time
	err = r.pool.QueryRow(ctx, query, args...).Scan(&updatedAt)
	if err != nil {
		return nil, fmt.Errorf("update resume: %w", err)
	}

	return &model.ResumeUpdateResponse{
		ID:              resumeID,
		UpdatedAt:       updatedAt.UnixMilli(),
		LatestVersionID: &newVersionID,
	}, nil
}

func (r *repository) createVersion(ctx context.Context, resumeID, userID string, contentJSON []byte) (string, error) {
	var versionNo int
	err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(MAX(version_no), 0) + 1 FROM resume_versions WHERE resume_id = $1
	`, resumeID).Scan(&versionNo)
	if err != nil {
		return "", fmt.Errorf("get next version no: %w", err)
	}

	var versionID string
	err = r.pool.QueryRow(ctx, `
		INSERT INTO resume_versions (resume_id, user_id, version_no, content_snapshot)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, resumeID, userID, versionNo, contentJSON).Scan(&versionID)
	if err != nil {
		return "", fmt.Errorf("create version: %w", err)
	}

	return versionID, nil
}

func (r *repository) Delete(ctx context.Context, userID, resumeID string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE resumes SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
	`, resumeID, userID)
	if err != nil {
		return fmt.Errorf("delete resume: %w", err)
	}
	// 幂等删除：无论是否真的删除了记录，都返回成功
	return nil
}

// RestoreFromVersion 从版本恢复简历内容
func (r *repository) RestoreFromVersion(ctx context.Context, userID, resumeID string, versionContent []byte) (*model.ResumeUpdateResponse, error) {
	// 创建新版本（保存当前内容）
	var currentContentJSON []byte
	err := r.pool.QueryRow(ctx, `
		SELECT content FROM resumes WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
	`, resumeID, userID).Scan(&currentContentJSON)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrResumeNotFound
		}
		return nil, fmt.Errorf("get current content: %w", err)
	}

	newVersionID, err := r.createVersion(ctx, resumeID, userID, currentContentJSON)
	if err != nil {
		return nil, fmt.Errorf("create backup version: %w", err)
	}

	// 用版本内容更新简历
	var updatedAt time.Time
	err = r.pool.QueryRow(ctx, `
		UPDATE resumes
		SET content = $1, latest_version_id = $2, updated_at = NOW()
		WHERE id = $3 AND user_id = $4 AND deleted_at IS NULL
		RETURNING updated_at
	`, versionContent, newVersionID, resumeID, userID).Scan(&updatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrResumeNotFound
		}
		return nil, fmt.Errorf("restore resume: %w", err)
	}

	return &model.ResumeUpdateResponse{
		ID:              resumeID,
		UpdatedAt:       updatedAt.UnixMilli(),
		LatestVersionID: &newVersionID,
	}, nil
}

// GetVersionContent 获取版本的快照内容
func (r *repository) GetVersionContent(ctx context.Context, versionID string) ([]byte, error) {
	var content []byte
	err := r.pool.QueryRow(ctx, `
		SELECT content_snapshot FROM resume_versions WHERE id = $1
	`, versionID).Scan(&content)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrResumeNotFound
		}
		return nil, fmt.Errorf("get version content: %w", err)
	}
	return content, nil
}

func getOrDefaultStyleSettings(s *model.ResumeStyleSettings) model.ResumeStyleSettings {
	if s == nil {
		return model.ResumeStyleSettings{
			FontFamily:            "Microsoft YaHei",
			FontSize:             12,
			TextColor:            "#363636",
			LineHeight:           1.3,
			PagePaddingHorizontal: 20,
			PagePaddingVertical:   20,
			ModuleSpacing:         7,
			ParagraphSpacing:      1,
		}
	}
	return *s
}