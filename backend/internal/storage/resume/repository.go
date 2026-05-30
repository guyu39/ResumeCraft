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
	ErrDuplicateTitle = errors.New("resume title already exists")
	ErrDuplicateLabel = errors.New("snapshot label already exists")
)

type Repository interface {
	List(ctx context.Context, userID string, page, pageSize int, keyword string) ([]model.ResumeListItem, int, error)
	FindByTitle(ctx context.Context, userID, title string) (bool, error)
	Create(ctx context.Context, userID string, req model.CreateResumeRequest) (*model.ResumeListItem, error)
	GetByID(ctx context.Context, userID, resumeID string) (*model.ResumeDetail, error)
	Update(ctx context.Context, userID, resumeID string, req model.UpdateResumeRequest) (*model.ResumeUpdateResponse, error)
	Delete(ctx context.Context, userID, resumeID string) error
	RestoreFromVersion(ctx context.Context, userID, resumeID string, versionContent []byte) (*model.ResumeUpdateResponse, error)
	GetVersionContent(ctx context.Context, versionID string) ([]byte, error)

	// 版本快照
	ListSnapshots(ctx context.Context, resumeID string, limit int, includeAuto bool) ([]model.SnapshotListItem, int, error)
	CreateManualSnapshot(ctx context.Context, userID, resumeID string, label string) (*model.VersionSnapshot, error)
	UpdateSnapshotLabel(ctx context.Context, snapshotID, userID string, label string) error
	DeleteSnapshot(ctx context.Context, snapshotID, userID string) error
	GetSnapshotDetail(ctx context.Context, snapshotID string) (*model.VersionSnapshot, []byte, error)
	DiffSnapshots(ctx context.Context, snapshotAID, snapshotBID string) (*model.DiffResult, error)
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

func (r *repository) FindByTitle(ctx context.Context, userID, title string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM resumes WHERE user_id = $1 AND title = $2 AND deleted_at IS NULL)
	`, userID, title).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("find by title: %w", err)
	}
	return exists, nil
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
			FontSize:              12,
			TextColor:             "#363636",
			LineHeight:            1.3,
			PagePaddingHorizontal: 20,
			PagePaddingVertical:   20,
			ModuleSpacing:         7,
			ParagraphSpacing:      1,
		}
	}
	return *s
}

// ============================================================================
// 版本快照 Repository 实现
// ============================================================================

// ListSnapshots 获取快照列表（时间轴）
func (r *repository) ListSnapshots(ctx context.Context, resumeID string, limit int, includeAuto bool) ([]model.SnapshotListItem, int, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	var total int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM resume_versions
		WHERE resume_id = $1
		  AND ($2::bool OR snapshot_type = 'manual')
	`, resumeID, includeAuto).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("count snapshots: %w", err)
	}

	rows, err := r.pool.Query(ctx, `
		SELECT id, version_no, snapshot_type, label,
		       EXTRACT(EPOCH FROM created_at)::bigint * 1000
		FROM resume_versions
		WHERE resume_id = $1
		  AND ($2::bool OR snapshot_type = 'manual')
		ORDER BY created_at DESC
		LIMIT $3
	`, resumeID, includeAuto, limit)
	if err != nil {
		return nil, 0, fmt.Errorf("list snapshots: %w", err)
	}
	defer rows.Close()

	var items []model.SnapshotListItem
	for rows.Next() {
		var item model.SnapshotListItem
		if err := rows.Scan(&item.ID, &item.VersionNo, &item.SnapshotType, &item.Label, &item.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan snapshot: %w", err)
		}
		item.IsCurrent = false
		items = append(items, item)
	}

	if items == nil {
		items = []model.SnapshotListItem{}
	}

	// 标记最新版本为 current
	if len(items) > 0 {
		items[0].IsCurrent = true
	}

	return items, total, nil
}

// CreateManualSnapshot 创建手动快照
func (r *repository) CreateManualSnapshot(ctx context.Context, userID, resumeID string, label string) (*model.VersionSnapshot, error) {
	// 校验同名快照
	var dupExists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM resume_versions
			WHERE resume_id = $1 AND user_id = $2 AND snapshot_type = 'manual' AND label = $3
		)
	`, resumeID, userID, label).Scan(&dupExists)
	if err != nil {
		return nil, fmt.Errorf("check duplicate label: %w", err)
	}
	if dupExists {
		return nil, fmt.Errorf("duplicate label: %w", ErrDuplicateLabel)
	}

	// 获取当前内容
	var currentContentJSON []byte
	err = r.pool.QueryRow(ctx, `
		SELECT content FROM resumes WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
	`, resumeID, userID).Scan(&currentContentJSON)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrResumeNotFound
		}
		return nil, fmt.Errorf("get current content: %w", err)
	}

	// 获取下一个版本号
	var versionNo int
	err = r.pool.QueryRow(ctx, `
		SELECT COALESCE(MAX(version_no), 0) + 1 FROM resume_versions WHERE resume_id = $1
	`, resumeID).Scan(&versionNo)
	if err != nil {
		return nil, fmt.Errorf("get next version no: %w", err)
	}

	// 插入手动快照
	var snapshot model.VersionSnapshot
	var createdAtMS int64
	err = r.pool.QueryRow(ctx, `
		INSERT INTO resume_versions (resume_id, user_id, version_no, content_snapshot, snapshot_type, label)
		VALUES ($1, $2, $3, $4, 'manual', $5)
		RETURNING id, resume_id, user_id, version_no, snapshot_type, label,
		          EXTRACT(EPOCH FROM created_at)::bigint * 1000
	`, resumeID, userID, versionNo, currentContentJSON, label).Scan(
		&snapshot.ID, &snapshot.ResumeID, &snapshot.UserID,
		&snapshot.VersionNo, &snapshot.SnapshotType, &snapshot.Label,
		&createdAtMS,
	)
	if err != nil {
		return nil, fmt.Errorf("create manual snapshot: %w", err)
	}
	snapshot.CreatedAt = createdAtMS
	snapshot.IsCurrent = true

	// 清理超过 50 个的自动版本
	_, _ = r.pool.Exec(ctx, `
		DELETE FROM resume_versions
		WHERE resume_id = $1
		  AND snapshot_type = 'auto'
		  AND id NOT IN (
		      SELECT id FROM resume_versions
		      WHERE resume_id = $1 AND snapshot_type = 'auto'
		      ORDER BY created_at DESC LIMIT 50
		  )
	`, resumeID)

	return &snapshot, nil
}

// UpdateSnapshotLabel 更新快照标签
func (r *repository) UpdateSnapshotLabel(ctx context.Context, snapshotID, userID string, label string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE resume_versions
		SET label = $1
		WHERE id = $2
		  AND user_id = $3
		  AND snapshot_type = 'manual'
	`, label, snapshotID, userID)
	if err != nil {
		return fmt.Errorf("update snapshot label: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrResumeNotFound
	}
	return nil
}

// DeleteSnapshot 删除手动快照
func (r *repository) DeleteSnapshot(ctx context.Context, snapshotID, userID string) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM resume_versions
		WHERE id = $1
		  AND user_id = $2
		  AND snapshot_type = 'manual'
	`, snapshotID, userID)
	if err != nil {
		return fmt.Errorf("delete snapshot: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrResumeNotFound
	}
	return nil
}

// GetSnapshotDetail 获取快照详情（元信息 + 内容）
func (r *repository) GetSnapshotDetail(ctx context.Context, snapshotID string) (*model.VersionSnapshot, []byte, error) {
	var snapshot model.VersionSnapshot
	var contentJSON []byte
	var createdAtMS int64

	err := r.pool.QueryRow(ctx, `
		SELECT id, resume_id, user_id, version_no, snapshot_type, label,
		       content_snapshot,
		       EXTRACT(EPOCH FROM created_at)::bigint * 1000
		FROM resume_versions
		WHERE id = $1
	`, snapshotID).Scan(
		&snapshot.ID, &snapshot.ResumeID, &snapshot.UserID,
		&snapshot.VersionNo, &snapshot.SnapshotType, &snapshot.Label,
		&contentJSON,
		&createdAtMS,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, ErrResumeNotFound
		}
		return nil, nil, fmt.Errorf("get snapshot detail: %w", err)
	}
	snapshot.CreatedAt = createdAtMS

	return &snapshot, contentJSON, nil
}

// DiffSnapshots 对比两个快照（逐字段比较）
func (r *repository) DiffSnapshots(ctx context.Context, snapshotAID, snapshotBID string) (*model.DiffResult, error) {
	_, contentA, err := r.GetSnapshotDetail(ctx, snapshotAID)
	if err != nil {
		return nil, err
	}
	_, contentB, err := r.GetSnapshotDetail(ctx, snapshotBID)
	if err != nil {
		return nil, err
	}

	var dataA, dataB map[string]interface{}
	if err := json.Unmarshal(contentA, &dataA); err != nil {
		return nil, fmt.Errorf("unmarshal snapshot A: %w", err)
	}
	if err := json.Unmarshal(contentB, &dataB); err != nil {
		return nil, fmt.Errorf("unmarshal snapshot B: %w", err)
	}

	modulesA := extractModules(dataA)
	modulesB := extractModules(dataB)
	moduleMapA := buildModuleMap(modulesA)
	moduleMapB := buildModuleMap(modulesB)

	diffs := []model.FieldDiff{}
	stats := model.DiffStats{}

	for id, modA := range moduleMapA {
		modB, exists := moduleMapB[id]
		if !exists {
			stats.ModulesRemoved++
			diffs = append(diffs, model.FieldDiff{
				ModuleType:       modTypeName(modA),
				ModuleInstanceID: id,
				Field:            "模块",
				Before:           moduleLabel(modA),
				After:            "已删除",
			})
			continue
		}
		// 逐字段对比
		fieldDiffs := compareModuleFields(modA, modB)
		if len(fieldDiffs) > 0 {
			stats.ModulesModified++
			stats.FieldsChanged += len(fieldDiffs)
			diffs = append(diffs, fieldDiffs...)
		}
	}
	for id, modB := range moduleMapB {
		if _, exists := moduleMapA[id]; !exists {
			stats.ModulesAdded++
			diffs = append(diffs, model.FieldDiff{
				ModuleType:       modTypeName(modB),
				ModuleInstanceID: id,
				Field:            "模块",
				Before:           "不存在",
				After:            moduleLabel(modB),
			})
		}
	}

	if diffs == nil {
		diffs = []model.FieldDiff{}
	}

	snapshotA := model.SnapshotBrief{}
	snapshotB := model.SnapshotBrief{}
	r.pool.QueryRow(ctx, `SELECT id, version_no, label, EXTRACT(EPOCH FROM created_at)::bigint * 1000 FROM resume_versions WHERE id = $1`, snapshotAID).Scan(&snapshotA.ID, &snapshotA.VersionNo, &snapshotA.Label, &snapshotA.CreatedAt)
	r.pool.QueryRow(ctx, `SELECT id, version_no, label, EXTRACT(EPOCH FROM created_at)::bigint * 1000 FROM resume_versions WHERE id = $1`, snapshotBID).Scan(&snapshotB.ID, &snapshotB.VersionNo, &snapshotB.Label, &snapshotB.CreatedAt)

	return &model.DiffResult{SnapshotA: snapshotA, SnapshotB: snapshotB, Diffs: diffs, Stats: stats}, nil
}

// buildModuleMap 构建 id → module map
func buildModuleMap(modules []map[string]interface{}) map[string]map[string]interface{} {
	result := make(map[string]map[string]interface{})
	for _, m := range modules {
		if id, ok := m["id"].(string); ok {
			result[id] = m
		}
	}
	return result
}

// compareModuleFields 比较两个模块的所有 data 字段
func compareModuleFields(modA, modB map[string]interface{}) []model.FieldDiff {
	dataA, _ := modA["data"].(map[string]interface{})
	dataB, _ := modB["data"].(map[string]interface{})
	if dataA == nil {
		dataA = map[string]interface{}{}
	}
	if dataB == nil {
		dataB = map[string]interface{}{}
	}

	modType := modTypeName(modA)
	modID, _ := modA["id"].(string)

	var diffs []model.FieldDiff
	allKeys := mergedKeys(dataA, dataB)

	for _, key := range allKeys {
		va := fieldToString(dataA[key])
		vb := fieldToString(dataB[key])
		if va == vb {
			continue
		}
		if va == "" {
			va = "(空)"
		}
		if vb == "" {
			vb = "(空)"
		}
		diffs = append(diffs, model.FieldDiff{
			ModuleType:       modType,
			ModuleInstanceID: modID,
			Field:            fieldLabel(key),
			Before:           va,
			After:            vb,
		})
	}
	return diffs
}

// fieldToString 将任意类型转为可比较的字符串
func fieldToString(v interface{}) string {
	if v == nil {
		return ""
	}
	switch val := v.(type) {
	case string:
		return val
	case float64:
		if val == float64(int64(val)) {
			return fmt.Sprintf("%d", int64(val))
		}
		return fmt.Sprintf("%g", val)
	case bool:
		if val {
			return "是"
		} else {
			return "否"
		}
	case []interface{}:
		parts := make([]string, 0, len(val))
		for _, item := range val {
			if m, ok := item.(map[string]interface{}); ok {
				if name, ok := m["name"].(string); ok {
					parts = append(parts, name)
				}
			} else if s, ok := item.(string); ok {
				parts = append(parts, s)
			}
		}
		return strings.Join(parts, "、")
	case map[string]interface{}:
		b, _ := json.Marshal(v)
		return string(b)
	default:
		return fmt.Sprintf("%v", v)
	}
}

// mergedKeys 合并两个 map 的 key（去重排序，已知固定字段排前面）
func mergedKeys(a, b map[string]interface{}) []string {
	order := []string{
		"companyName", "schoolName", "projectName", "title", "degree", "major",
		"position", "startDate", "endDate", "date", "duration",
		"description", "content", "responsibilities", "achievements",
		"skills", "summary", "level", "certificateName", "issuingOrg", "portfolioUrl",
		"languageName", "proficiency", "customContent",
	}
	seen := map[string]bool{}
	var keys []string
	for _, k := range order {
		if _, okA := a[k]; okA {
			seen[k] = true
			keys = append(keys, k)
		}
		if _, okB := b[k]; okB {
			if !seen[k] {
				seen[k] = true
				keys = append(keys, k)
			}
		}
	}
	for k := range a {
		if !seen[k] {
			keys = append(keys, k)
		}
	}
	for k := range b {
		if !seen[k] {
			keys = append(keys, k)
		}
	}
	return keys
}

// modTypeName 模块类型 → 中文名
func modTypeName(m map[string]interface{}) string {
	t, _ := m["type"].(string)
	switch t {
	case "personal":
		return "个人信息"
	case "work":
		return "工作经历"
	case "education":
		return "教育经历"
	case "project":
		return "项目经历"
	case "skills":
		return "专业技能"
	case "awards":
		return "获奖经历"
	case "summary":
		return "自我评价"
	case "certificates":
		return "证书资质"
	case "portfolio":
		return "作品集"
	case "languages":
		return "语言能力"
	case "custom":
		return "自定义模块"
	default:
		return t
	}
}

// moduleLabel 模块的显示标签（标题 or 公司名 or 学校名）
func moduleLabel(m map[string]interface{}) string {
	data, _ := m["data"].(map[string]interface{})
	if data != nil {
		if name, ok := data["companyName"].(string); ok {
			return name
		}
		if name, ok := data["schoolName"].(string); ok {
			return name
		}
		if name, ok := data["projectName"].(string); ok {
			return name
		}
	}
	if title, ok := m["title"].(string); ok {
		return title
	}
	return modTypeName(m)
}

// fieldLabel 字段 → 中文名
func fieldLabel(key string) string {
	switch key {
	case "companyName", "schoolName", "projectName":
		return "名称"
	case "position":
		return "职位"
	case "degree":
		return "学位"
	case "major":
		return "专业"
	case "startDate":
		return "开始日期"
	case "endDate":
		return "结束日期"
	case "date":
		return "日期"
	case "duration":
		return "时长"
	case "description":
		return "描述"
	case "content":
		return "内容"
	case "responsibilities":
		return "职责"
	case "achievements":
		return "成果"
	case "summary":
		return "摘要"
	case "skills":
		return "技能列表"
	case "title":
		return "标题"
	case "level":
		return "等级"
	case "certificateName":
		return "证书名称"
	case "issuingOrg":
		return "颁发机构"
	case "portfolioUrl":
		return "作品链接"
	case "languageName":
		return "语言"
	case "proficiency":
		return "熟练度"
	case "customContent":
		return "内容"
	default:
		return key
	}
}

// extractModules 从 resume content JSON 提取 modules 数组
func extractModules(data map[string]interface{}) []map[string]interface{} {
	if raw, ok := data["modules"]; ok {
		if arr, ok := raw.([]interface{}); ok {
			result := make([]map[string]interface{}, 0, len(arr))
			for _, item := range arr {
				if m, ok := item.(map[string]interface{}); ok {
					result = append(result, m)
				}
			}
			return result
		}
	}
	return []map[string]interface{}{}
}
