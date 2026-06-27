package ai

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"resumecraft-pdf-backend/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrInterviewSessionNotFound = errors.New("interview session not found")
)

type InterviewSessionRecord struct {
	ID               string
	UserID           string
	ResumeID         *string
	SnapshotID       *string
	ConversationID   *string
	TargetTitle      string
	CompanyName      string
	JDText           string
	JDHash           *string
	FocusAreas       json.RawMessage
	QuestionCount    int
	InterviewRound   string
	Mode             string
	TranscriptText   *string
	TranscriptSource *string
	Questions        json.RawMessage
	Answers          json.RawMessage
	AnsweredCount    int
	SkippedCount     int
	Evaluation       json.RawMessage
	OverallScore     *int
	PassLevel        *string
	Model            *string
	Status           string
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

type InterviewRepository interface {
	CreateSession(ctx context.Context, rec *InterviewSessionRecord) error
	GetSessionByID(ctx context.Context, userID, sessionID string) (*InterviewSessionRecord, error)
	UpdateSessionQuestions(ctx context.Context, userID, sessionID string, questions json.RawMessage, model string) error
	UpdateSessionProgress(ctx context.Context, userID, sessionID string, answers json.RawMessage, answeredCount, skippedCount int) error
	UpdateSessionEvaluation(ctx context.Context, userID, sessionID string, evaluation json.RawMessage, overallScore int, passLevel string) error
	ListSessionsByUser(ctx context.Context, userID, resumeID string, limit, offset int) ([]InterviewSessionRecord, error)
	CountSessionsByUser(ctx context.Context, userID, resumeID string) (int, error)
	DeleteSession(ctx context.Context, userID, sessionID string) error
}

type pgInterviewRepository struct {
	pool *pgxpool.Pool
}

func NewInterviewRepository(pool *pgxpool.Pool) InterviewRepository {
	return &pgInterviewRepository{pool: pool}
}

func (r *pgInterviewRepository) CreateSession(ctx context.Context, rec *InterviewSessionRecord) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO interview_sessions (
			id, user_id, resume_id, snapshot_id, conversation_id,
			target_title, company_name, jd_text, jd_hash,
			focus_areas, question_count, interview_round, mode,
			transcript_text, transcript_source,
			questions, answers, answered_count, skipped_count,
			status, created_at, updated_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
	`, rec.ID, rec.UserID, rec.ResumeID, rec.SnapshotID, rec.ConversationID,
		rec.TargetTitle, rec.CompanyName, rec.JDText, rec.JDHash,
		rec.FocusAreas, rec.QuestionCount, rec.InterviewRound, rec.Mode,
		rec.TranscriptText, rec.TranscriptSource,
		rec.Questions, rec.Answers, rec.AnsweredCount, rec.SkippedCount,
		rec.Status, rec.CreatedAt, rec.UpdatedAt,
	)
	return err
}

func (r *pgInterviewRepository) GetSessionByID(ctx context.Context, userID, sessionID string) (*InterviewSessionRecord, error) {
	var rec InterviewSessionRecord
	err := r.pool.QueryRow(ctx, `
		SELECT id, user_id, resume_id, snapshot_id, conversation_id,
			target_title, company_name, jd_text, jd_hash,
			focus_areas, question_count, interview_round, mode,
			transcript_text, transcript_source,
			questions, answers, answered_count, skipped_count,
			COALESCE(evaluation, 'null'), overall_score, pass_level,
			model, status, created_at, updated_at
		FROM interview_sessions
		WHERE id = $1 AND user_id = $2
	`, sessionID, userID).Scan(
		&rec.ID, &rec.UserID, &rec.ResumeID, &rec.SnapshotID, &rec.ConversationID,
		&rec.TargetTitle, &rec.CompanyName, &rec.JDText, &rec.JDHash,
		&rec.FocusAreas, &rec.QuestionCount, &rec.InterviewRound, &rec.Mode,
		&rec.TranscriptText, &rec.TranscriptSource,
		&rec.Questions, &rec.Answers, &rec.AnsweredCount, &rec.SkippedCount,
		&rec.Evaluation, &rec.OverallScore, &rec.PassLevel,
		&rec.Model, &rec.Status, &rec.CreatedAt, &rec.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInterviewSessionNotFound
		}
		return nil, err
	}
	return &rec, nil
}

func (r *pgInterviewRepository) UpdateSessionQuestions(ctx context.Context, userID, sessionID string, questions json.RawMessage, model string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE interview_sessions
		SET questions = $1, model = $2, status = 'answering', updated_at = now()
		WHERE id = $3 AND user_id = $4
	`, questions, model, sessionID, userID)
	return err
}

func (r *pgInterviewRepository) UpdateSessionProgress(ctx context.Context, userID, sessionID string, answers json.RawMessage, answeredCount, skippedCount int) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE interview_sessions
		SET answers = $1, answered_count = $2, skipped_count = $3, updated_at = now()
		WHERE id = $4 AND user_id = $5
	`, answers, answeredCount, skippedCount, sessionID, userID)
	return err
}

func (r *pgInterviewRepository) UpdateSessionEvaluation(ctx context.Context, userID, sessionID string, evaluation json.RawMessage, overallScore int, passLevel string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE interview_sessions
		SET evaluation = $1, overall_score = $2, pass_level = $3, status = 'evaluated', updated_at = now()
		WHERE id = $4 AND user_id = $5
	`, evaluation, overallScore, passLevel, sessionID, userID)
	return err
}

func (r *pgInterviewRepository) ListSessionsByUser(ctx context.Context, userID, resumeID string, limit, offset int) ([]InterviewSessionRecord, error) {
	// resumeID 非空时按简历隔离，避免在 A 简历看到 B 简历的面试记录
	where := "WHERE user_id = $1"
	args := []interface{}{userID, limit, offset}
	if resumeID != "" {
		where = "WHERE user_id = $1 AND resume_id = $4"
		args = append(args, resumeID)
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id, resume_id, snapshot_id, conversation_id,
			target_title, company_name, jd_text, jd_hash,
			focus_areas, question_count, interview_round, mode,
			transcript_text, transcript_source,
			questions, answers, answered_count, skipped_count,
			COALESCE(evaluation, 'null'), overall_score, pass_level,
			model, status, created_at, updated_at
		FROM interview_sessions
		`+where+`
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []InterviewSessionRecord
	for rows.Next() {
		var rec InterviewSessionRecord
		if err := rows.Scan(
			&rec.ID, &rec.UserID, &rec.ResumeID, &rec.SnapshotID, &rec.ConversationID,
			&rec.TargetTitle, &rec.CompanyName, &rec.JDText, &rec.JDHash,
			&rec.FocusAreas, &rec.QuestionCount, &rec.InterviewRound, &rec.Mode,
			&rec.TranscriptText, &rec.TranscriptSource,
			&rec.Questions, &rec.Answers, &rec.AnsweredCount, &rec.SkippedCount,
			&rec.Evaluation, &rec.OverallScore, &rec.PassLevel,
			&rec.Model, &rec.Status, &rec.CreatedAt, &rec.UpdatedAt,
		); err != nil {
			return nil, err
		}
		records = append(records, rec)
	}
	return records, nil
}

func (r *pgInterviewRepository) CountSessionsByUser(ctx context.Context, userID, resumeID string) (int, error) {
	var count int
	var err error
	if resumeID != "" {
		err = r.pool.QueryRow(ctx, `
			SELECT COUNT(*) FROM interview_sessions WHERE user_id = $1 AND resume_id = $2
		`, userID, resumeID).Scan(&count)
	} else {
		err = r.pool.QueryRow(ctx, `
			SELECT COUNT(*) FROM interview_sessions WHERE user_id = $1
		`, userID).Scan(&count)
	}
	return count, err
}

func (r *pgInterviewRepository) DeleteSession(ctx context.Context, userID, sessionID string) error {
	_, err := r.pool.Exec(ctx, `
		DELETE FROM interview_sessions WHERE id = $1 AND user_id = $2
	`, sessionID, userID)
	return err
}

func InterviewRecordToModel(rec *InterviewSessionRecord) (*model.InterviewSession, error) {
	var focusAreas []string
	if err := json.Unmarshal(rec.FocusAreas, &focusAreas); err != nil {
		focusAreas = []string{}
	}

	var questions []model.InterviewQuestion
	if err := json.Unmarshal(rec.Questions, &questions); err != nil {
		questions = []model.InterviewQuestion{}
	}

	var answers []model.InterviewAnswer
	if err := json.Unmarshal(rec.Answers, &answers); err != nil {
		answers = []model.InterviewAnswer{}
	}

	var evaluation *model.InterviewEvaluation
	if rec.Evaluation != nil && string(rec.Evaluation) != "null" {
		if err := json.Unmarshal(rec.Evaluation, &evaluation); err != nil {
			evaluation = nil
		}
	}

	sess := &model.InterviewSession{
		ID:             rec.ID,
		UserID:         rec.UserID,
		TargetTitle:    rec.TargetTitle,
		CompanyName:    rec.CompanyName,
		JDText:         rec.JDText,
		FocusAreas:     focusAreas,
		QuestionCount:  rec.QuestionCount,
		InterviewRound: rec.InterviewRound,
		Mode:           rec.Mode,
		Questions:      questions,
		Answers:        answers,
		AnsweredCount:  rec.AnsweredCount,
		SkippedCount:   rec.SkippedCount,
		Evaluation:     evaluation,
		OverallScore:   rec.OverallScore,
		PassLevel:      stringPtr(rec.PassLevel),
		Model:          stringPtr(rec.Model),
		Status:         rec.Status,
		CreatedAt:      rec.CreatedAt.UnixMilli(),
		UpdatedAt:      rec.UpdatedAt.UnixMilli(),
	}

	if rec.ResumeID != nil {
		sess.ResumeID = *rec.ResumeID
	}
	if rec.SnapshotID != nil {
		sess.SnapshotID = *rec.SnapshotID
	}
	if rec.ConversationID != nil {
		sess.ConversationID = *rec.ConversationID
	}
	if rec.JDHash != nil {
		sess.JDHash = *rec.JDHash
	}
	if rec.TranscriptText != nil {
		sess.TranscriptText = *rec.TranscriptText
	}
	if rec.TranscriptSource != nil {
		sess.TranscriptSource = *rec.TranscriptSource
	}

	return sess, nil
}

func stringPtr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
