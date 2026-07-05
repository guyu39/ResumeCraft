package job_application

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"resumecraft-pdf-backend/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrApplicationNotFound = errors.New("job application not found")
	ErrInvalidAssociation  = errors.New("resume snapshot does not belong to user resume")
)

func isFinalStatus(status model.JobApplicationStatus) bool {
	return status == model.JobApplicationStatusOffer ||
		status == model.JobApplicationStatusRejected ||
		status == model.JobApplicationStatusWithdrawn
}

type CreateApplicationParams struct {
	UserID            string
	ResumeID          string
	SnapshotVersionID string
	CompanyName       string
	TargetTitle       string
	Department        string
	JDText            string
	JDHash            string
	Source            string
	ApplicationURL    string
	NextAction        string
	MatchScore        *int
	JDScore           *int
}

type UpdateApplicationParams struct {
	ResumeID           string
	SnapshotVersionID  string
	CompanyName        string
	TargetTitle        string
	Department         string
	JDText             string
	JDHash             string
	Source             string
	ApplicationURL     string
	NextAction         string
	SubmittedAt        *time.Time
	ClearSubmittedAt   bool
	WrittenTestAt      *time.Time
	ClearWrittenTestAt bool
	Status             model.JobApplicationStatus
}

type CreateInterviewAttachmentParams struct {
	InterviewID string
	FileName    string
	FileType    string
	FileSize    int64
	StorageKey  string
	Metadata    json.RawMessage
}

type Repository interface {
	List(ctx context.Context, userID string, filters model.JobApplicationFilters) ([]model.JobApplicationListItem, int, error)
	GetByID(ctx context.Context, userID, applicationID string) (*model.JobApplication, error)
	Create(ctx context.Context, params CreateApplicationParams) (*model.JobApplication, error)
	Update(ctx context.Context, userID, applicationID string, params UpdateApplicationParams) (*model.JobApplication, error)
	Delete(ctx context.Context, userID, applicationID string) error
	FindDuplicates(ctx context.Context, userID, companyName, targetTitle, jdHash string) ([]model.JobApplicationListItem, error)

	UpdateStatus(ctx context.Context, userID, applicationID string, status model.JobApplicationStatus, note string) (*model.JobApplicationStatusEvent, error)
	ListStatusEvents(ctx context.Context, userID, applicationID string) ([]model.JobApplicationStatusEvent, error)

	ListChecklistItems(ctx context.Context, userID, applicationID string) ([]model.JobApplicationChecklistItem, error)
	CreateChecklistItem(ctx context.Context, userID, applicationID string, req model.CreateChecklistItemRequest) (*model.JobApplicationChecklistItem, error)
	UpdateChecklistItem(ctx context.Context, userID, applicationID, itemID string, req model.UpdateChecklistItemRequest) (*model.JobApplicationChecklistItem, error)
	DeleteChecklistItem(ctx context.Context, userID, applicationID, itemID string) error
	ReplaceChecklistItems(ctx context.Context, userID, applicationID string, items []model.CreateChecklistItemRequest) ([]model.JobApplicationChecklistItem, error)

	CreateAIRun(ctx context.Context, userID, applicationID string, req model.CreateJobApplicationAIRunRequest) (*model.JobApplicationAIRun, error)
	ListAIRuns(ctx context.Context, userID, applicationID string) ([]model.JobApplicationAIRun, error)

	ListInterviews(ctx context.Context, userID, applicationID string) ([]model.JobApplicationInterview, error)
	CreateInterview(ctx context.Context, userID, applicationID string, req model.CreateInterviewRequest) (*model.JobApplicationInterview, error)
	UpdateInterview(ctx context.Context, userID, applicationID, interviewID string, req model.UpdateInterviewRequest) (*model.JobApplicationInterview, error)
	DeleteInterview(ctx context.Context, userID, applicationID, interviewID string) error

	CreateInterviewAttachment(ctx context.Context, userID, applicationID string, params CreateInterviewAttachmentParams) (*model.JobApplicationAttachment, error)
	GetInterviewAttachment(ctx context.Context, userID, applicationID, interviewID string) (*model.JobApplicationAttachment, error)
	DeleteInterviewAttachment(ctx context.Context, userID, applicationID, interviewID string) error

	GetStatus(ctx context.Context, userID, applicationID string) (model.JobApplicationStatus, error)
}

type repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) Repository {
	return &repository{pool: pool}
}

func (r *repository) List(ctx context.Context, userID string, filters model.JobApplicationFilters) ([]model.JobApplicationListItem, int, error) {
	where, args := buildListWhere(userID, filters)

	var total int
	countQuery := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM job_applications ja
		JOIN resumes rs ON rs.id = ja.resume_id
		WHERE %s
	`, where)
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count job applications: %w", err)
	}

	page := filters.Page
	if page < 1 {
		page = 1
	}
	pageSize := filters.PageSize
	if pageSize < 1 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize
	args = append(args, pageSize, offset)

	query := fmt.Sprintf(`
		SELECT ja.id, ja.resume_id, rs.title, ja.snapshot_version_id,
		       COALESCE(rv.label, ''), ja.company_name, COALESCE(ja.department, ''), ja.target_title,
		       ja.source, COALESCE(ja.application_url, ''), ja.status,
		       ja.match_score, ja.jd_score,
		       COALESCE(progress.done_count, 0), COALESCE(progress.total_count, 0),
		       COALESCE(ja.next_action, ''), ja.submitted_at, ja.written_test_at, ja.updated_at, ja.created_at
		FROM job_applications ja
		JOIN resumes rs ON rs.id = ja.resume_id
		LEFT JOIN resume_versions rv ON rv.id = ja.snapshot_version_id
		LEFT JOIN (
			SELECT application_id,
			       COUNT(*)::int AS total_count,
			       COUNT(*) FILTER (WHERE checked)::int AS done_count
			FROM job_application_checklist_items
			GROUP BY application_id
		) progress ON progress.application_id = ja.id
		WHERE %s
		ORDER BY ja.updated_at DESC
		LIMIT $%d OFFSET $%d
	`, where, len(args)-1, len(args))

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list job applications: %w", err)
	}
	defer rows.Close()

	items, err := scanApplicationListRows(rows)
	if err != nil {
		return nil, 0, err
	}
	if err := r.attachInterviewBriefs(ctx, userID, items); err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

// attachInterviewBriefs 批量查询这一页投递记录的面试轮次精简信息，避免逐条查询造成 N+1
func (r *repository) attachInterviewBriefs(ctx context.Context, userID string, items []model.JobApplicationListItem) error {
	if len(items) == 0 {
		return nil
	}
	ids := make([]string, len(items))
	indexByID := make(map[string]int, len(items))
	for i, item := range items {
		ids[i] = item.ID
		indexByID[item.ID] = i
	}

	rows, err := r.pool.Query(ctx, `
		SELECT application_id, round, scheduled_at, scheduled_end, result
		FROM job_application_interviews
		WHERE application_id = ANY($1::uuid[]) AND user_id = $2
		ORDER BY scheduled_at ASC NULLS LAST, created_at ASC
	`, ids, userID)
	if err != nil {
		return fmt.Errorf("list interview briefs: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var applicationID, round, result string
		var scheduledAt, scheduledEnd sql.NullTime
		if err := rows.Scan(&applicationID, &round, &scheduledAt, &scheduledEnd, &result); err != nil {
			return fmt.Errorf("scan interview brief: %w", err)
		}
		brief := model.JobApplicationInterviewBrief{Round: round, Result: result}
		if scheduledAt.Valid {
			ms := scheduledAt.Time.UnixMilli()
			brief.ScheduledAt = &ms
		}
		if scheduledEnd.Valid {
			ms := scheduledEnd.Time.UnixMilli()
			brief.ScheduledEnd = &ms
		}
		if idx, ok := indexByID[applicationID]; ok {
			items[idx].Interviews = append(items[idx].Interviews, brief)
		}
	}
	return rows.Err()
}

func (r *repository) GetByID(ctx context.Context, userID, applicationID string) (*model.JobApplication, error) {
	app, err := r.getBaseByID(ctx, userID, applicationID)
	if err != nil {
		return nil, err
	}
	if app.StatusEvents, err = r.ListStatusEvents(ctx, userID, applicationID); err != nil {
		return nil, err
	}
	if app.ChecklistItems, err = r.ListChecklistItems(ctx, userID, applicationID); err != nil {
		return nil, err
	}
	if app.AIRuns, err = r.ListAIRuns(ctx, userID, applicationID); err != nil {
		return nil, err
	}
	if app.Interviews, err = r.ListInterviews(ctx, userID, applicationID); err != nil {
		return nil, err
	}
	return app, nil
}

func (r *repository) Create(ctx context.Context, params CreateApplicationParams) (*model.JobApplication, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin create application tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var id string
	err = tx.QueryRow(ctx, `
		INSERT INTO job_applications (
			user_id, resume_id, snapshot_version_id, company_name, department, target_title,
			jd_text, jd_hash, source, application_url, next_action, match_score, jd_score
		)
		SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, NULLIF($10, ''), NULLIF($11, ''), $12, $13
		WHERE EXISTS (
			SELECT 1
			FROM resumes r
			JOIN resume_versions rv ON rv.id = $3 AND rv.resume_id = r.id AND rv.user_id = r.user_id
			WHERE r.id = $2 AND r.user_id = $1 AND r.deleted_at IS NULL
		)
		RETURNING id
	`, params.UserID, params.ResumeID, params.SnapshotVersionID, params.CompanyName, params.Department, params.TargetTitle,
		params.JDText, params.JDHash, params.Source, params.ApplicationURL, params.NextAction,
		params.MatchScore, params.JDScore).Scan(&id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvalidAssociation
		}
		return nil, fmt.Errorf("create job application: %w", err)
	}

	if _, err = tx.Exec(ctx, `
		INSERT INTO job_application_status_events (application_id, user_id, from_status, to_status, note)
		VALUES ($1, $2, NULL, 'pending_adaptation', '创建投递记录')
	`, id, params.UserID); err != nil {
		return nil, fmt.Errorf("create status event: %w", err)
	}

	if err = tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit create application: %w", err)
	}

	return r.GetByID(ctx, params.UserID, id)
}

func (r *repository) Update(ctx context.Context, userID, applicationID string, params UpdateApplicationParams) (*model.JobApplication, error) {
	updates := []string{}
	args := []interface{}{}
	argIdx := 1

	if params.ResumeID != "" || params.SnapshotVersionID != "" {
		if params.ResumeID == "" || params.SnapshotVersionID == "" {
			return nil, ErrInvalidAssociation
		}
		updates = append(updates, fmt.Sprintf("resume_id = $%d", argIdx))
		args = append(args, params.ResumeID)
		argIdx++
		updates = append(updates, fmt.Sprintf("snapshot_version_id = $%d", argIdx))
		args = append(args, params.SnapshotVersionID)
		argIdx++
	}
	if params.CompanyName != "" {
		updates = append(updates, fmt.Sprintf("company_name = $%d", argIdx))
		args = append(args, params.CompanyName)
		argIdx++
	}
	if params.TargetTitle != "" {
		updates = append(updates, fmt.Sprintf("target_title = $%d", argIdx))
		args = append(args, params.TargetTitle)
		argIdx++
	}
	if params.Department != "" {
		updates = append(updates, fmt.Sprintf("department = $%d", argIdx))
		args = append(args, params.Department)
		argIdx++
	}
	if params.JDText != "" {
		updates = append(updates, fmt.Sprintf("jd_text = $%d", argIdx), fmt.Sprintf("jd_hash = $%d", argIdx+1))
		args = append(args, params.JDText, params.JDHash)
		argIdx += 2
	}
	if params.Source != "" {
		updates = append(updates, fmt.Sprintf("source = $%d", argIdx))
		args = append(args, params.Source)
		argIdx++
	}
	if params.ApplicationURL != "" {
		updates = append(updates, fmt.Sprintf("application_url = $%d", argIdx))
		args = append(args, params.ApplicationURL)
		argIdx++
	}
	if params.NextAction != "" {
		updates = append(updates, fmt.Sprintf("next_action = $%d", argIdx))
		args = append(args, params.NextAction)
		argIdx++
	}
	if params.SubmittedAt != nil {
		updates = append(updates, fmt.Sprintf("submitted_at = $%d", argIdx))
		args = append(args, *params.SubmittedAt)
		argIdx++
	} else if params.ClearSubmittedAt {
		updates = append(updates, "submitted_at = NULL")
	}
	if params.WrittenTestAt != nil {
		updates = append(updates, fmt.Sprintf("written_test_at = $%d", argIdx))
		args = append(args, *params.WrittenTestAt)
		argIdx++
	} else if params.ClearWrittenTestAt {
		updates = append(updates, "written_test_at = NULL")
	}
	if params.Status != "" {
		updates = append(updates, fmt.Sprintf("status = $%d", argIdx))
		args = append(args, params.Status)
		argIdx++
	}
	if len(updates) == 0 {
		return r.GetByID(ctx, userID, applicationID)
	}
	updates = append(updates, "updated_at = NOW()")

	args = append(args, applicationID, userID)
	applicationIDArg := len(args) - 1
	userIDArg := len(args)
	whereAssociation := ""
	if params.ResumeID != "" && params.SnapshotVersionID != "" {
		args = append(args, params.ResumeID, params.SnapshotVersionID)
		whereAssociation = fmt.Sprintf(`
			AND EXISTS (
				SELECT 1
				FROM resumes r
				JOIN resume_versions rv ON rv.id = $%d AND rv.resume_id = r.id AND rv.user_id = r.user_id
				WHERE r.id = $%d AND r.user_id = $%d AND r.deleted_at IS NULL
			)
		`, len(args), len(args)-1, len(args)-2)
	}
	query := fmt.Sprintf(`
		UPDATE job_applications
		SET %s
		WHERE id = $%d AND user_id = $%d AND deleted_at IS NULL
		%s
	`, strings.Join(updates, ", "), applicationIDArg, userIDArg, whereAssociation)

	result, err := r.pool.Exec(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("update job application: %w", err)
	}
	if result.RowsAffected() == 0 {
		if params.ResumeID != "" && params.SnapshotVersionID != "" {
			var exists bool
			_ = r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM job_applications WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL)`, applicationID, userID).Scan(&exists)
			if exists {
				return nil, ErrInvalidAssociation
			}
		}
		return nil, ErrApplicationNotFound
	}

	return r.GetByID(ctx, userID, applicationID)
}

func (r *repository) Delete(ctx context.Context, userID, applicationID string) error {
	result, err := r.pool.Exec(ctx, `
		UPDATE job_applications
		SET deleted_at = NOW(), updated_at = NOW()
		WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
	`, applicationID, userID)
	if err != nil {
		return fmt.Errorf("delete job application: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrApplicationNotFound
	}
	return nil
}

func (r *repository) FindDuplicates(ctx context.Context, userID, companyName, targetTitle, jdHash string) ([]model.JobApplicationListItem, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT ja.id, ja.resume_id, rs.title, ja.snapshot_version_id,
		       COALESCE(rv.label, ''), ja.company_name, COALESCE(ja.department, ''), ja.target_title,
		       ja.source, COALESCE(ja.application_url, ''), ja.status,
		       ja.match_score, ja.jd_score,
		       COALESCE(progress.done_count, 0), COALESCE(progress.total_count, 0),
		       COALESCE(ja.next_action, ''), ja.submitted_at, ja.written_test_at, ja.updated_at, ja.created_at
		FROM job_applications ja
		JOIN resumes rs ON rs.id = ja.resume_id
		LEFT JOIN resume_versions rv ON rv.id = ja.snapshot_version_id
		LEFT JOIN (
			SELECT application_id,
			       COUNT(*)::int AS total_count,
			       COUNT(*) FILTER (WHERE checked)::int AS done_count
			FROM job_application_checklist_items
			GROUP BY application_id
		) progress ON progress.application_id = ja.id
		WHERE ja.user_id = $1
		  AND ja.deleted_at IS NULL
		  AND ja.status NOT IN ('rejected', 'withdrawn')
		  AND (
		    ja.jd_hash = $2
		    OR (lower(ja.company_name) = lower($3) AND lower(ja.target_title) = lower($4))
		  )
		ORDER BY ja.updated_at DESC
		LIMIT 5
	`, userID, jdHash, companyName, targetTitle)
	if err != nil {
		return nil, fmt.Errorf("find duplicate applications: %w", err)
	}
	defer rows.Close()
	return scanApplicationListRows(rows)
}

func (r *repository) UpdateStatus(ctx context.Context, userID, applicationID string, status model.JobApplicationStatus, note string) (*model.JobApplicationStatusEvent, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin status tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var fromStatus model.JobApplicationStatus
	err = tx.QueryRow(ctx, `
		SELECT status
		FROM job_applications
		WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
		FOR UPDATE
	`, applicationID, userID).Scan(&fromStatus)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrApplicationNotFound
		}
		return nil, fmt.Errorf("get application status: %w", err)
	}

	if _, err = tx.Exec(ctx, `
		UPDATE job_applications
		SET status = $1,
		    submitted_at = CASE WHEN $2 = 'submitted' AND submitted_at IS NULL THEN NOW() ELSE submitted_at END,
		    updated_at = NOW()
		WHERE id = $3 AND user_id = $4
	`, status, string(status), applicationID, userID); err != nil {
		return nil, fmt.Errorf("update status: %w", err)
	}

	// 从终态改为非终态视为重新开始流程，清空原有面试记录，避免与新流程混淆
	if isFinalStatus(fromStatus) && !isFinalStatus(status) {
		if _, err = tx.Exec(ctx, `
			DELETE FROM job_application_interviews
			WHERE application_id = $1 AND user_id = $2
		`, applicationID, userID); err != nil {
			return nil, fmt.Errorf("clear interviews on status revert: %w", err)
		}
	}

	event, err := insertStatusEvent(ctx, tx, applicationID, userID, &fromStatus, status, note)
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit status tx: %w", err)
	}
	return event, nil
}

func (r *repository) ListStatusEvents(ctx context.Context, userID, applicationID string) ([]model.JobApplicationStatusEvent, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT se.id, se.application_id, se.from_status, se.to_status, COALESCE(se.note, ''), se.created_at
		FROM job_application_status_events se
		JOIN job_applications ja ON ja.id = se.application_id
		WHERE se.application_id = $1 AND se.user_id = $2 AND ja.user_id = $2
		ORDER BY se.created_at DESC
	`, applicationID, userID)
	if err != nil {
		return nil, fmt.Errorf("list status events: %w", err)
	}
	defer rows.Close()

	items := []model.JobApplicationStatusEvent{}
	for rows.Next() {
		var item model.JobApplicationStatusEvent
		var fromStatus sql.NullString
		var createdAt time.Time
		if err := rows.Scan(&item.ID, &item.ApplicationID, &fromStatus, &item.ToStatus, &item.Note, &createdAt); err != nil {
			return nil, fmt.Errorf("scan status event: %w", err)
		}
		if fromStatus.Valid {
			status := model.JobApplicationStatus(fromStatus.String)
			item.FromStatus = &status
		}
		item.CreatedAt = createdAt.UnixMilli()
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *repository) ListChecklistItems(ctx context.Context, userID, applicationID string) ([]model.JobApplicationChecklistItem, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT ci.id, ci.application_id, ci.source, ci.source_snapshot_version_id,
		       ci.category, ci.title, COALESCE(ci.detail, ''), ci.checked,
		       ci.sort_order, ci.created_at, ci.updated_at
		FROM job_application_checklist_items ci
		JOIN job_applications ja ON ja.id = ci.application_id
		WHERE ci.application_id = $1 AND ci.user_id = $2 AND ja.user_id = $2
		ORDER BY ci.sort_order ASC, ci.created_at ASC
	`, applicationID, userID)
	if err != nil {
		return nil, fmt.Errorf("list checklist items: %w", err)
	}
	defer rows.Close()
	return scanChecklistRows(rows)
}

func (r *repository) CreateChecklistItem(ctx context.Context, userID, applicationID string, req model.CreateChecklistItemRequest) (*model.JobApplicationChecklistItem, error) {
	var item model.JobApplicationChecklistItem
	var sourceSnapshot sql.NullString
	var createdAt, updatedAt time.Time
	err := r.pool.QueryRow(ctx, `
		INSERT INTO job_application_checklist_items (
			application_id, user_id, source, source_snapshot_version_id,
			category, title, detail, checked, sort_order
		)
		SELECT $1, $2, $3, NULLIF($4, '')::uuid, $5, $6, NULLIF($7, ''), $8, $9
		WHERE EXISTS (
			SELECT 1 FROM job_applications WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
		)
		RETURNING id, application_id, source, source_snapshot_version_id, category, title,
		          COALESCE(detail, ''), checked, sort_order, created_at, updated_at
	`, applicationID, userID, defaultString(req.Source, "manual"), req.SourceSnapshotVersionID,
		defaultString(req.Category, "general"), req.Title, req.Detail, req.Checked, req.SortOrder).Scan(
		&item.ID, &item.ApplicationID, &item.Source, &sourceSnapshot,
		&item.Category, &item.Title, &item.Detail, &item.Checked, &item.SortOrder,
		&createdAt, &updatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrApplicationNotFound
		}
		return nil, fmt.Errorf("create checklist item: %w", err)
	}
	if sourceSnapshot.Valid {
		item.SourceSnapshotVersionID = sourceSnapshot.String
	}
	item.CreatedAt = createdAt.UnixMilli()
	item.UpdatedAt = updatedAt.UnixMilli()
	return &item, nil
}

func (r *repository) UpdateChecklistItem(ctx context.Context, userID, applicationID, itemID string, req model.UpdateChecklistItemRequest) (*model.JobApplicationChecklistItem, error) {
	current, err := r.ListChecklistItems(ctx, userID, applicationID)
	if err != nil {
		return nil, err
	}
	found := false
	for _, item := range current {
		if item.ID == itemID {
			found = true
			break
		}
	}
	if !found {
		return nil, ErrApplicationNotFound
	}

	updates := []string{"updated_at = NOW()"}
	args := []interface{}{}
	argIdx := 1
	if req.Source != "" {
		updates = append(updates, fmt.Sprintf("source = $%d", argIdx))
		args = append(args, req.Source)
		argIdx++
	}
	if req.SourceSnapshotVersionID != "" {
		updates = append(updates, fmt.Sprintf("source_snapshot_version_id = $%d", argIdx))
		args = append(args, req.SourceSnapshotVersionID)
		argIdx++
	}
	if req.Category != "" {
		updates = append(updates, fmt.Sprintf("category = $%d", argIdx))
		args = append(args, req.Category)
		argIdx++
	}
	if req.Title != "" {
		updates = append(updates, fmt.Sprintf("title = $%d", argIdx))
		args = append(args, req.Title)
		argIdx++
	}
	if req.Detail != "" {
		updates = append(updates, fmt.Sprintf("detail = $%d", argIdx))
		args = append(args, req.Detail)
		argIdx++
	}
	if req.Checked != nil {
		updates = append(updates, fmt.Sprintf("checked = $%d", argIdx))
		args = append(args, *req.Checked)
		argIdx++
	}
	if req.SortOrder != nil {
		updates = append(updates, fmt.Sprintf("sort_order = $%d", argIdx))
		args = append(args, *req.SortOrder)
		argIdx++
	}
	args = append(args, itemID, applicationID, userID)

	query := fmt.Sprintf(`
		UPDATE job_application_checklist_items ci
		SET %s
		FROM job_applications ja
		WHERE ci.id = $%d AND ci.application_id = $%d AND ci.user_id = $%d
		  AND ja.id = ci.application_id AND ja.user_id = ci.user_id
	`, strings.Join(updates, ", "), len(args)-2, len(args)-1, len(args))
	result, err := r.pool.Exec(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("update checklist item: %w", err)
	}
	if result.RowsAffected() == 0 {
		return nil, ErrApplicationNotFound
	}

	items, err := r.ListChecklistItems(ctx, userID, applicationID)
	if err != nil {
		return nil, err
	}
	for _, item := range items {
		if item.ID == itemID {
			return &item, nil
		}
	}
	return nil, ErrApplicationNotFound
}

func (r *repository) DeleteChecklistItem(ctx context.Context, userID, applicationID, itemID string) error {
	result, err := r.pool.Exec(ctx, `
		DELETE FROM job_application_checklist_items ci
		USING job_applications ja
		WHERE ci.id = $1 AND ci.application_id = $2 AND ci.user_id = $3
		  AND ja.id = ci.application_id AND ja.user_id = ci.user_id
	`, itemID, applicationID, userID)
	if err != nil {
		return fmt.Errorf("delete checklist item: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrApplicationNotFound
	}
	return nil
}

func (r *repository) ReplaceChecklistItems(ctx context.Context, userID, applicationID string, items []model.CreateChecklistItemRequest) ([]model.JobApplicationChecklistItem, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin replace checklist tx: %w", err)
	}
	defer tx.Rollback(ctx)

	result, err := tx.Exec(ctx, `
		DELETE FROM job_application_checklist_items ci
		USING job_applications ja
		WHERE ci.application_id = $1 AND ci.user_id = $2
		  AND ja.id = ci.application_id AND ja.user_id = ci.user_id
	`, applicationID, userID)
	if err != nil {
		return nil, fmt.Errorf("delete old checklist: %w", err)
	}
	_ = result

	for index, item := range items {
		sortOrder := item.SortOrder
		if sortOrder == 0 {
			sortOrder = index + 1
		}
		if _, err = tx.Exec(ctx, `
			INSERT INTO job_application_checklist_items (
				application_id, user_id, source, source_snapshot_version_id,
				category, title, detail, checked, sort_order
			)
			SELECT $1, $2, $3, NULLIF($4, '')::uuid, $5, $6, NULLIF($7, ''), $8, $9
			WHERE EXISTS (
				SELECT 1 FROM job_applications WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
			)
		`, applicationID, userID, defaultString(item.Source, "ai"), item.SourceSnapshotVersionID,
			defaultString(item.Category, "general"), item.Title, item.Detail, item.Checked, sortOrder); err != nil {
			return nil, fmt.Errorf("insert checklist item: %w", err)
		}
	}

	if err = tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit replace checklist: %w", err)
	}
	return r.ListChecklistItems(ctx, userID, applicationID)
}

func (r *repository) CreateAIRun(ctx context.Context, userID, applicationID string, req model.CreateJobApplicationAIRunRequest) (*model.JobApplicationAIRun, error) {
	summary := req.Summary
	if len(summary) == 0 {
		summary = json.RawMessage(`{}`)
	}
	var run model.JobApplicationAIRun
	var resumeID, sourceSnapshot, modelName, conversationID, optimizedSnapshot sql.NullString
	var createdAt time.Time
	err := r.pool.QueryRow(ctx, `
		INSERT INTO job_application_ai_runs (
			application_id, user_id, resume_id, source_snapshot_version_id, result_type,
			summary, model, conversation_id, optimized_snapshot_id
		)
		SELECT $1, $2, NULLIF($3, '')::uuid, NULLIF($4, '')::uuid, $5, $6,
		       NULLIF($7, ''), NULLIF($8, '')::uuid, NULLIF($9, '')::uuid
		WHERE EXISTS (
			SELECT 1 FROM job_applications WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
		)
		RETURNING id, application_id, resume_id, source_snapshot_version_id, result_type,
		          summary, model, conversation_id, optimized_snapshot_id, created_at
	`, applicationID, userID, req.ResumeID, req.SourceSnapshotVersionID, req.ResultType,
		summary, req.Model, req.ConversationID, req.OptimizedSnapshotID).Scan(
		&run.ID, &run.ApplicationID, &resumeID, &sourceSnapshot, &run.ResultType,
		&run.Summary, &modelName, &conversationID, &optimizedSnapshot, &createdAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrApplicationNotFound
		}
		return nil, fmt.Errorf("create ai run: %w", err)
	}
	applyAIRunNulls(&run, resumeID, sourceSnapshot, modelName, conversationID, optimizedSnapshot)
	run.CreatedAt = createdAt.UnixMilli()
	return &run, nil
}

func (r *repository) ListAIRuns(ctx context.Context, userID, applicationID string) ([]model.JobApplicationAIRun, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT ar.id, ar.application_id, ar.resume_id, ar.source_snapshot_version_id,
		       ar.result_type, ar.summary, ar.model, ar.conversation_id,
		       ar.optimized_snapshot_id, ar.created_at
		FROM job_application_ai_runs ar
		JOIN job_applications ja ON ja.id = ar.application_id
		WHERE ar.application_id = $1 AND ar.user_id = $2 AND ja.user_id = $2
		ORDER BY ar.created_at DESC
	`, applicationID, userID)
	if err != nil {
		return nil, fmt.Errorf("list ai runs: %w", err)
	}
	defer rows.Close()

	items := []model.JobApplicationAIRun{}
	for rows.Next() {
		var item model.JobApplicationAIRun
		var resumeID, sourceSnapshot, modelName, conversationID, optimizedSnapshot sql.NullString
		var createdAt time.Time
		if err := rows.Scan(&item.ID, &item.ApplicationID, &resumeID, &sourceSnapshot,
			&item.ResultType, &item.Summary, &modelName, &conversationID,
			&optimizedSnapshot, &createdAt); err != nil {
			return nil, fmt.Errorf("scan ai run: %w", err)
		}
		applyAIRunNulls(&item, resumeID, sourceSnapshot, modelName, conversationID, optimizedSnapshot)
		item.CreatedAt = createdAt.UnixMilli()
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *repository) ListInterviews(ctx context.Context, userID, applicationID string) ([]model.JobApplicationInterview, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT it.id, it.application_id, it.round, it.scheduled_at, it.scheduled_end, it.format,
		       it.interviewer, COALESCE(it.questions, ''), COALESCE(it.notes, ''),
		       it.result, COALESCE(it.next_action, ''), it.created_at, it.updated_at
		FROM job_application_interviews it
		JOIN job_applications ja ON ja.id = it.application_id
		WHERE it.application_id = $1 AND it.user_id = $2 AND ja.user_id = $2
		ORDER BY it.scheduled_at DESC NULLS LAST, it.created_at DESC
	`, applicationID, userID)
	if err != nil {
		return nil, fmt.Errorf("list interviews: %w", err)
	}
	defer rows.Close()
	items, err := scanInterviewRows(rows)
	if err != nil {
		return nil, err
	}
	for i := range items {
		attachment, err := r.GetInterviewAttachment(ctx, userID, applicationID, items[i].ID)
		if err != nil {
			return nil, err
		}
		items[i].RecordingAttachment = attachment
	}
	return items, nil
}

func (r *repository) CreateInterview(ctx context.Context, userID, applicationID string, req model.CreateInterviewRequest) (*model.JobApplicationInterview, error) {
	scheduledAt := unixMilliToTime(req.ScheduledAt)
	scheduledEnd := unixMilliToTime(req.ScheduledEnd)
	var item model.JobApplicationInterview
	var scheduled, scheduledE sql.NullTime
	var createdAt, updatedAt time.Time
	err := r.pool.QueryRow(ctx, `
		INSERT INTO job_application_interviews (
			application_id, user_id, round, scheduled_at, scheduled_end, format, interviewer,
			questions, notes, result, next_action
		)
		SELECT $1, $2, $3, $4, $5, $6, $7, NULLIF($8, ''), NULLIF($9, ''), $10, NULLIF($11, '')
		WHERE EXISTS (
			SELECT 1 FROM job_applications WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
		)
		RETURNING id, application_id, round, scheduled_at, scheduled_end, format, interviewer,
		          COALESCE(questions, ''), COALESCE(notes, ''), result,
		          COALESCE(next_action, ''), created_at, updated_at
	`, applicationID, userID, req.Round, scheduledAt, scheduledEnd, req.Format, req.Interviewer,
		req.Questions, req.Notes, req.Result, req.NextAction).Scan(
		&item.ID, &item.ApplicationID, &item.Round, &scheduled, &scheduledE, &item.Format, &item.Interviewer,
		&item.Questions, &item.Notes, &item.Result, &item.NextAction, &createdAt, &updatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrApplicationNotFound
		}
		return nil, fmt.Errorf("create interview: %w", err)
	}
	if scheduled.Valid {
		ms := scheduled.Time.UnixMilli()
		item.ScheduledAt = &ms
	}
	if scheduledE.Valid {
		ms := scheduledE.Time.UnixMilli()
		item.ScheduledEnd = &ms
	}
	item.CreatedAt = createdAt.UnixMilli()
	item.UpdatedAt = updatedAt.UnixMilli()
	return &item, nil
}

func (r *repository) UpdateInterview(ctx context.Context, userID, applicationID, interviewID string, req model.UpdateInterviewRequest) (*model.JobApplicationInterview, error) {
	scheduledAt := unixMilliToTime(req.ScheduledAt)
	scheduledEnd := unixMilliToTime(req.ScheduledEnd)
	result, err := r.pool.Exec(ctx, `
		UPDATE job_application_interviews it
		SET round = $1, scheduled_at = $2, scheduled_end = $3, format = $4, interviewer = $5,
		    questions = NULLIF($6, ''), notes = NULLIF($7, ''), result = $8,
		    next_action = NULLIF($9, ''), updated_at = NOW()
		FROM job_applications ja
		WHERE it.id = $10 AND it.application_id = $11 AND it.user_id = $12
		  AND ja.id = it.application_id AND ja.user_id = it.user_id
	`, req.Round, scheduledAt, scheduledEnd, req.Format, req.Interviewer, req.Questions,
		req.Notes, req.Result, req.NextAction, interviewID, applicationID, userID)
	if err != nil {
		return nil, fmt.Errorf("update interview: %w", err)
	}
	if result.RowsAffected() == 0 {
		return nil, ErrApplicationNotFound
	}

	items, err := r.ListInterviews(ctx, userID, applicationID)
	if err != nil {
		return nil, err
	}
	for _, item := range items {
		if item.ID == interviewID {
			return &item, nil
		}
	}
	return nil, ErrApplicationNotFound
}

func (r *repository) DeleteInterview(ctx context.Context, userID, applicationID, interviewID string) error {
	result, err := r.pool.Exec(ctx, `
		DELETE FROM job_application_interviews it
		USING job_applications ja
		WHERE it.id = $1 AND it.application_id = $2 AND it.user_id = $3
		  AND ja.id = it.application_id AND ja.user_id = it.user_id
	`, interviewID, applicationID, userID)
	if err != nil {
		return fmt.Errorf("delete interview: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrApplicationNotFound
	}
	return nil
}

func (r *repository) CreateInterviewAttachment(ctx context.Context, userID, applicationID string, params CreateInterviewAttachmentParams) (*model.JobApplicationAttachment, error) {
	metadata := params.Metadata
	if len(metadata) == 0 {
		metadata = json.RawMessage(`{}`)
	}
	// 一个面试记录只保留一份录音附件，新上传覆盖旧附件
	if _, err := r.pool.Exec(ctx, `
		DELETE FROM job_application_attachments a
		USING job_application_interviews it, job_applications ja
		WHERE a.interview_id = $1 AND a.application_id = $2 AND a.user_id = $3
		  AND it.id = a.interview_id AND it.user_id = a.user_id
		  AND ja.id = it.application_id AND ja.user_id = it.user_id
	`, params.InterviewID, applicationID, userID); err != nil {
		return nil, fmt.Errorf("clear old interview attachment: %w", err)
	}
	var attachment model.JobApplicationAttachment
	var createdAt time.Time
	err := r.pool.QueryRow(ctx, `
		INSERT INTO job_application_attachments (
			application_id, interview_id, user_id, file_name, file_type, file_size, storage_key, metadata
		)
		SELECT $1, $2, $3, $4, $5, $6, $7, $8
		WHERE EXISTS (
			SELECT 1 FROM job_application_interviews
			WHERE id = $2 AND application_id = $1 AND user_id = $3
		)
		RETURNING id, application_id, interview_id, file_name, file_type, file_size, storage_key, metadata, created_at
	`, applicationID, params.InterviewID, userID, params.FileName, params.FileType, params.FileSize, params.StorageKey, metadata).Scan(
		&attachment.ID, &attachment.ApplicationID, &attachment.InterviewID, &attachment.FileName,
		&attachment.FileType, &attachment.FileSize, &attachment.StorageKey, &attachment.Metadata, &createdAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrApplicationNotFound
		}
		return nil, fmt.Errorf("create interview attachment: %w", err)
	}
	attachment.CreatedAt = createdAt.UnixMilli()
	return &attachment, nil
}

func (r *repository) GetInterviewAttachment(ctx context.Context, userID, applicationID, interviewID string) (*model.JobApplicationAttachment, error) {
	var attachment model.JobApplicationAttachment
	var createdAt time.Time
	err := r.pool.QueryRow(ctx, `
		SELECT a.id, a.application_id, a.interview_id, a.file_name, a.file_type, a.file_size, a.storage_key, a.metadata, a.created_at
		FROM job_application_attachments a
		JOIN job_application_interviews it ON it.id = a.interview_id
		JOIN job_applications ja ON ja.id = it.application_id
		WHERE a.interview_id = $1 AND a.application_id = $2 AND a.user_id = $3
		  AND it.user_id = $3 AND ja.user_id = $3
		ORDER BY a.created_at DESC
		LIMIT 1
	`, interviewID, applicationID, userID).Scan(
		&attachment.ID, &attachment.ApplicationID, &attachment.InterviewID, &attachment.FileName,
		&attachment.FileType, &attachment.FileSize, &attachment.StorageKey, &attachment.Metadata, &createdAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("get interview attachment: %w", err)
	}
	attachment.CreatedAt = createdAt.UnixMilli()
	return &attachment, nil
}

func (r *repository) DeleteInterviewAttachment(ctx context.Context, userID, applicationID, interviewID string) error {
	result, err := r.pool.Exec(ctx, `
		DELETE FROM job_application_attachments a
		USING job_application_interviews it, job_applications ja
		WHERE a.interview_id = $1 AND a.application_id = $2 AND a.user_id = $3
		  AND it.id = a.interview_id AND it.user_id = a.user_id
		  AND ja.id = it.application_id AND ja.user_id = it.user_id
	`, interviewID, applicationID, userID)
	if err != nil {
		return fmt.Errorf("delete interview attachment: %w", err)
	}
	_ = result
	return nil
}

func (r *repository) GetStatus(ctx context.Context, userID, applicationID string) (model.JobApplicationStatus, error) {
	var status model.JobApplicationStatus
	err := r.pool.QueryRow(ctx, `
		SELECT status
		FROM job_applications
		WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
	`, applicationID, userID).Scan(&status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrApplicationNotFound
		}
		return "", fmt.Errorf("get application status: %w", err)
	}
	return status, nil
}

func (r *repository) getBaseByID(ctx context.Context, userID, applicationID string) (*model.JobApplication, error) {
	var app model.JobApplication
	var submittedAt, writtenTestAt sql.NullTime
	var applicationURL, nextAction, snapshotLabel, snapshotType sql.NullString
	var createdAt, updatedAt time.Time
	err := r.pool.QueryRow(ctx, `
		SELECT ja.id, ja.user_id, ja.resume_id, rs.title, ja.snapshot_version_id,
		       rv.label, rv.snapshot_type, ja.company_name, ja.department, ja.target_title, ja.jd_text,
		       ja.jd_hash, ja.source, ja.application_url, ja.status, ja.match_score,
		       ja.jd_score, COALESCE(progress.done_count, 0), COALESCE(progress.total_count, 0),
		       ja.next_action, ja.submitted_at, ja.written_test_at, ja.created_at, ja.updated_at
		FROM job_applications ja
		JOIN resumes rs ON rs.id = ja.resume_id
		LEFT JOIN resume_versions rv ON rv.id = ja.snapshot_version_id
		LEFT JOIN (
			SELECT application_id,
			       COUNT(*)::int AS total_count,
			       COUNT(*) FILTER (WHERE checked)::int AS done_count
			FROM job_application_checklist_items
			GROUP BY application_id
		) progress ON progress.application_id = ja.id
		WHERE ja.id = $1 AND ja.user_id = $2 AND ja.deleted_at IS NULL
	`, applicationID, userID).Scan(
		&app.ID, &app.UserID, &app.ResumeID, &app.ResumeTitle, &app.SnapshotVersionID,
		&snapshotLabel, &snapshotType, &app.CompanyName, &app.Department, &app.TargetTitle, &app.JDText,
		&app.JDHash, &app.Source, &applicationURL, &app.Status, &app.MatchScore,
		&app.JDScore, &app.ChecklistDone, &app.ChecklistTotal, &nextAction,
		&submittedAt, &writtenTestAt, &createdAt, &updatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrApplicationNotFound
		}
		return nil, fmt.Errorf("get job application: %w", err)
	}
	if applicationURL.Valid {
		app.ApplicationURL = applicationURL.String
	}
	if nextAction.Valid {
		app.NextAction = nextAction.String
	}
	if snapshotLabel.Valid {
		app.SnapshotLabel = snapshotLabel.String
	}
	if snapshotType.Valid {
		app.SnapshotType = snapshotType.String
	}
	if submittedAt.Valid {
		ms := submittedAt.Time.UnixMilli()
		app.SubmittedAt = &ms
	}
	if writtenTestAt.Valid {
		ms := writtenTestAt.Time.UnixMilli()
		app.WrittenTestAt = &ms
	}
	app.CreatedAt = createdAt.UnixMilli()
	app.UpdatedAt = updatedAt.UnixMilli()
	return &app, nil
}

func buildListWhere(userID string, filters model.JobApplicationFilters) (string, []interface{}) {
	parts := []string{"ja.user_id = $1", "ja.deleted_at IS NULL"}
	args := []interface{}{userID}
	argIdx := 2
	if filters.Keyword != "" {
		parts = append(parts, fmt.Sprintf("(ja.company_name ILIKE $%d OR ja.target_title ILIKE $%d OR ja.jd_text ILIKE $%d)", argIdx, argIdx, argIdx))
		args = append(args, "%"+filters.Keyword+"%")
		argIdx++
	}
	if filters.Company != "" {
		parts = append(parts, fmt.Sprintf("ja.company_name ILIKE $%d", argIdx))
		args = append(args, "%"+filters.Company+"%")
		argIdx++
	}
	if filters.ResumeID != "" {
		parts = append(parts, fmt.Sprintf("ja.resume_id = $%d", argIdx))
		args = append(args, filters.ResumeID)
		argIdx++
	}
	if len(filters.Statuses) > 0 {
		statuses := make([]string, 0, len(filters.Statuses))
		for _, status := range filters.Statuses {
			statuses = append(statuses, string(status))
		}
		parts = append(parts, fmt.Sprintf("ja.status = ANY($%d::text[])", argIdx))
		args = append(args, statuses)
	}
	return strings.Join(parts, " AND "), args
}

func scanApplicationListRows(rows pgx.Rows) ([]model.JobApplicationListItem, error) {
	items := []model.JobApplicationListItem{}
	for rows.Next() {
		var item model.JobApplicationListItem
		var submittedAt, writtenTestAt sql.NullTime
		var updatedAt, createdAt time.Time
		if err := rows.Scan(
			&item.ID, &item.ResumeID, &item.ResumeTitle, &item.SnapshotVersionID,
			&item.SnapshotLabel, &item.CompanyName, &item.Department, &item.TargetTitle, &item.Source,
			&item.ApplicationURL, &item.Status, &item.MatchScore, &item.JDScore,
			&item.ChecklistDone, &item.ChecklistTotal, &item.NextAction, &submittedAt, &writtenTestAt,
			&updatedAt, &createdAt,
		); err != nil {
			return nil, fmt.Errorf("scan job application: %w", err)
		}
		if submittedAt.Valid {
			ms := submittedAt.Time.UnixMilli()
			item.SubmittedAt = &ms
		}
		if writtenTestAt.Valid {
			ms := writtenTestAt.Time.UnixMilli()
			item.WrittenTestAt = &ms
		}
		item.UpdatedAt = updatedAt.UnixMilli()
		item.CreatedAt = createdAt.UnixMilli()
		items = append(items, item)
	}
	return items, rows.Err()
}

func scanChecklistRows(rows pgx.Rows) ([]model.JobApplicationChecklistItem, error) {
	items := []model.JobApplicationChecklistItem{}
	for rows.Next() {
		var item model.JobApplicationChecklistItem
		var sourceSnapshot sql.NullString
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&item.ID, &item.ApplicationID, &item.Source, &sourceSnapshot,
			&item.Category, &item.Title, &item.Detail, &item.Checked, &item.SortOrder,
			&createdAt, &updatedAt); err != nil {
			return nil, fmt.Errorf("scan checklist item: %w", err)
		}
		if sourceSnapshot.Valid {
			item.SourceSnapshotVersionID = sourceSnapshot.String
		}
		item.CreatedAt = createdAt.UnixMilli()
		item.UpdatedAt = updatedAt.UnixMilli()
		items = append(items, item)
	}
	return items, rows.Err()
}

func scanInterviewRows(rows pgx.Rows) ([]model.JobApplicationInterview, error) {
	items := []model.JobApplicationInterview{}
	for rows.Next() {
		var item model.JobApplicationInterview
		var scheduledAt, scheduledEnd sql.NullTime
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&item.ID, &item.ApplicationID, &item.Round, &scheduledAt, &scheduledEnd,
			&item.Format, &item.Interviewer, &item.Questions, &item.Notes,
			&item.Result, &item.NextAction, &createdAt, &updatedAt); err != nil {
			return nil, fmt.Errorf("scan interview: %w", err)
		}
		if scheduledAt.Valid {
			ms := scheduledAt.Time.UnixMilli()
			item.ScheduledAt = &ms
		}
		if scheduledEnd.Valid {
			ms := scheduledEnd.Time.UnixMilli()
			item.ScheduledEnd = &ms
		}
		item.CreatedAt = createdAt.UnixMilli()
		item.UpdatedAt = updatedAt.UnixMilli()
		items = append(items, item)
	}
	return items, rows.Err()
}

type statusEventTx interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func insertStatusEvent(ctx context.Context, tx statusEventTx, applicationID, userID string, fromStatus *model.JobApplicationStatus, toStatus model.JobApplicationStatus, note string) (*model.JobApplicationStatusEvent, error) {
	var event model.JobApplicationStatusEvent
	var from sql.NullString
	var createdAt time.Time
	err := tx.QueryRow(ctx, `
		INSERT INTO job_application_status_events (application_id, user_id, from_status, to_status, note)
		VALUES ($1, $2, $3, $4, NULLIF($5, ''))
		RETURNING id, application_id, from_status, to_status, COALESCE(note, ''), created_at
	`, applicationID, userID, fromStatus, toStatus, note).Scan(
		&event.ID, &event.ApplicationID, &from, &event.ToStatus, &event.Note, &createdAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert status event: %w", err)
	}
	if from.Valid {
		status := model.JobApplicationStatus(from.String)
		event.FromStatus = &status
	}
	event.CreatedAt = createdAt.UnixMilli()
	return &event, nil
}

func applyAIRunNulls(run *model.JobApplicationAIRun, resumeID, sourceSnapshot, modelName, conversationID, optimizedSnapshot sql.NullString) {
	if resumeID.Valid {
		run.ResumeID = resumeID.String
	}
	if sourceSnapshot.Valid {
		run.SourceSnapshotVersionID = sourceSnapshot.String
	}
	if modelName.Valid {
		run.Model = modelName.String
	}
	if conversationID.Valid {
		run.ConversationID = conversationID.String
	}
	if optimizedSnapshot.Valid {
		run.OptimizedSnapshotID = optimizedSnapshot.String
	}
}

func unixMilliToTime(ms *int64) *time.Time {
	if ms == nil || *ms <= 0 {
		return nil
	}
	t := time.UnixMilli(*ms)
	return &t
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func IsCheckViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23514"
}
