package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"resumecraft-pdf-backend/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrConversationNotFound = errors.New("conversation not found")
	ErrConfigNotFound       = errors.New("config not found")
)

// AIConfigRecord AI 配置记录
type AIConfigRecord struct {
	ID                string
	UserID            string
	Provider          string
	APIKeyEncrypted   string
	BaseURL           string
	DefaultModel      string
	EvaluateModel     *string
	TimeoutMs         int
	Enabled           bool
	IsGlobal          bool
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// ConversationRecord AI 对话记录
type ConversationRecord struct {
	ID               string
	UserID           string
	ResumeID         *string
	Type             string
	Title            *string
	Context          json.RawMessage
	ModuleType       string
	ModuleInstanceID  string
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// MessageRecord AI 消息记录
type MessageRecord struct {
	ID             string
	ConversationID string
	Role           string
	Content        string
	Model          *string
	InputTokens    *int
	OutputTokens   *int
	CreatedAt      time.Time
}

// ConfigRepository AI 配置仓库接口
type ConfigRepository interface {
	GetByUserID(ctx context.Context, userID string) (*AIConfigRecord, error)
	Upsert(ctx context.Context, cfg *AIConfigRecord) error
}

// Repository AI 对话仓库接口
type Repository interface {
	// 对话
	List(ctx context.Context, userID, conversationType string, page, pageSize int) ([]model.AIConversation, int, error)
	GetByID(ctx context.Context, userID, conversationID string) (*model.AIConversation, error)
	Create(ctx context.Context, conv *ConversationRecord) error
	Delete(ctx context.Context, userID, conversationID string) error

	// 消息
	AddMessage(ctx context.Context, msg *MessageRecord) (*model.AIMessage, error)
	GetMessages(ctx context.Context, conversationID string) ([]model.AIMessage, error)

	// 润色建议缓存查询
	GetLatestSuggestByResume(ctx context.Context, userID, resumeID, moduleType, fieldKey, contentHash string) (*model.AIConversation, error)

	// 根据 contentHash 查询润色建议（用于判断是否已有缓存）
	GetSuggestByContentHash(ctx context.Context, userID, resumeID, moduleType, moduleInstanceID, contentHash string) (*model.AIConversation, []model.AIMessage, error)
}

type repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) Repository {
	return &repository{pool: pool}
}

// ============ Config Repository ============

type configRepository struct {
	pool *pgxpool.Pool
}

func NewConfigRepository(pool *pgxpool.Pool) ConfigRepository {
	return &configRepository{pool: pool}
}

func (r *configRepository) GetByUserID(ctx context.Context, userID string) (*AIConfigRecord, error) {
	var cfg AIConfigRecord
	err := r.pool.QueryRow(ctx, `
		SELECT id, user_id, provider, api_key_encrypted, base_url, default_model,
		       evaluate_model, timeout_ms, enabled, is_global, created_at, updated_at
		FROM ai_configs
		WHERE user_id = $1 AND (is_global = false OR is_global IS NULL)
		ORDER BY is_global ASC, created_at DESC
		LIMIT 1
	`, userID).Scan(
		&cfg.ID, &cfg.UserID, &cfg.Provider, &cfg.APIKeyEncrypted, &cfg.BaseURL,
		&cfg.DefaultModel, &cfg.EvaluateModel, &cfg.TimeoutMs, &cfg.Enabled, &cfg.IsGlobal,
		&cfg.CreatedAt, &cfg.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrConfigNotFound
		}
		return nil, err
	}
	return &cfg, nil
}

func (r *configRepository) Upsert(ctx context.Context, cfg *AIConfigRecord) error {
	// 使用 CTE 实现幂等 upsert，不依赖特定约束名
	_, err := r.pool.Exec(ctx, `
		WITH upsert AS (
			UPDATE ai_configs
			SET provider = $3, api_key_encrypted = $4, base_url = $5,
			    default_model = $6, evaluate_model = $7, timeout_ms = $8,
			    enabled = $9, updated_at = NOW()
			WHERE user_id = $2 AND is_global = false
			RETURNING *
		)
		INSERT INTO ai_configs (id, user_id, provider, api_key_encrypted, base_url, default_model,
		                        evaluate_model, timeout_ms, enabled, is_global, created_at, updated_at)
		SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
		WHERE NOT EXISTS (SELECT 1 FROM upsert)
	`, cfg.ID, cfg.UserID, cfg.Provider, cfg.APIKeyEncrypted, cfg.BaseURL,
		cfg.DefaultModel, cfg.EvaluateModel, cfg.TimeoutMs, cfg.Enabled, cfg.IsGlobal)
	return err
}

// ============ Conversation Repository ============

func (r *repository) List(ctx context.Context, userID, conversationType string, page, pageSize int) ([]model.AIConversation, int, error) {
	offset := (page - 1) * pageSize

	// 查询总数
	var total int
	countQuery := `SELECT COUNT(*) FROM ai_conversations WHERE user_id = $1`
	args := []interface{}{userID}
	if conversationType != "" {
		countQuery += ` AND type = $2`
		args = append(args, conversationType)
	}
	err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	// 查询列表
	query := `
		SELECT id, user_id, resume_id, type, title, context, module_type, module_instance_id, created_at, updated_at
		FROM ai_conversations
		WHERE user_id = $1`
	listArgs := []interface{}{userID}
	if conversationType != "" {
		query += ` AND type = $2`
		listArgs = append(listArgs, conversationType)
	}
	query += ` ORDER BY updated_at DESC LIMIT $` + fmt.Sprintf("%d", len(listArgs)+1) + ` OFFSET $` + fmt.Sprintf("%d", len(listArgs)+2)
	listArgs = append(listArgs, pageSize, offset)

	rows, err := r.pool.Query(ctx, query, listArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var items []model.AIConversation
	for rows.Next() {
		var item model.AIConversation
		var title *string
		var contextJSON []byte
		var moduleType, moduleInstanceID string
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&item.ID, &item.UserID, &item.ResumeID, &item.Type,
			&title, &contextJSON, &moduleType, &moduleInstanceID, &createdAt, &updatedAt); err != nil {
			return nil, 0, err
		}
		item.Title = title
		item.ModuleType = moduleType
		item.ModuleInstanceID = moduleInstanceID
		if len(contextJSON) > 0 {
			json.Unmarshal(contextJSON, &item.Context)
		}
		item.CreatedAt = createdAt.UnixMilli()
		item.UpdatedAt = updatedAt.UnixMilli()
		items = append(items, item)
	}

	if items == nil {
		items = []model.AIConversation{}
	}
	return items, total, nil
}

func (r *repository) GetByID(ctx context.Context, userID, conversationID string) (*model.AIConversation, error) {
	var conv model.AIConversation
	var title *string
	var contextJSON []byte
	var moduleType, moduleInstanceID string
	var createdAt, updatedAt time.Time

	err := r.pool.QueryRow(ctx, `
		SELECT id, user_id, resume_id, type, title, context, module_type, module_instance_id, created_at, updated_at
		FROM ai_conversations
		WHERE id = $1 AND user_id = $2
	`, conversationID, userID).Scan(
		&conv.ID, &conv.UserID, &conv.ResumeID, &conv.Type,
		&title, &contextJSON, &moduleType, &moduleInstanceID, &createdAt, &updatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrConversationNotFound
		}
		return nil, err
	}
	conv.Title = title
	conv.ModuleType = moduleType
	conv.ModuleInstanceID = moduleInstanceID
	if len(contextJSON) > 0 {
		json.Unmarshal(contextJSON, &conv.Context)
	}
	conv.CreatedAt = createdAt.UnixMilli()
	conv.UpdatedAt = updatedAt.UnixMilli()

	// 获取消息
	messages, err := r.GetMessages(ctx, conv.ID)
	if err != nil {
		return nil, err
	}
	conv.Messages = messages

	return &conv, nil
}

func (r *repository) Create(ctx context.Context, conv *ConversationRecord) error {
	contextJSON := conv.Context
	if contextJSON == nil {
		contextJSON = []byte("{}")
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO ai_conversations (id, user_id, resume_id, type, title, context, module_type, module_instance_id, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
	`, conv.ID, conv.UserID, conv.ResumeID, conv.Type, conv.Title, contextJSON, conv.ModuleType, conv.ModuleInstanceID)
	return err
}

func (r *repository) Delete(ctx context.Context, userID, conversationID string) error {
	result, err := r.pool.Exec(ctx, `
		DELETE FROM ai_conversations WHERE id = $1 AND user_id = $2
	`, conversationID, userID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrConversationNotFound
	}
	return nil
}

// ============ Message Repository ============

func (r *repository) AddMessage(ctx context.Context, msg *MessageRecord) (*model.AIMessage, error) {
	var out model.AIMessage
	var createdAt time.Time
	err := r.pool.QueryRow(ctx, `
		INSERT INTO ai_messages (id, conversation_id, role, content, model, input_tokens, output_tokens, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
		RETURNING id, conversation_id, role, content, model, input_tokens, output_tokens, created_at
	`, msg.ID, msg.ConversationID, msg.Role, msg.Content, msg.Model, msg.InputTokens, msg.OutputTokens).Scan(
		&out.ID, &out.ConversationID, &out.Role, &out.Content, &out.Model,
		&out.InputTokens, &out.OutputTokens, &createdAt,
	)
	if err != nil {
		return nil, err
	}
	out.CreatedAt = createdAt.UnixMilli()
	return &out, nil
}

func (r *repository) GetMessages(ctx context.Context, conversationID string) ([]model.AIMessage, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, conversation_id, role, content, model, input_tokens, output_tokens, created_at
		FROM ai_messages
		WHERE conversation_id = $1
		ORDER BY created_at ASC
	`, conversationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []model.AIMessage
	for rows.Next() {
		var msg model.AIMessage
		var createdAt time.Time
		if err := rows.Scan(&msg.ID, &msg.ConversationID, &msg.Role, &msg.Content,
			&msg.Model, &msg.InputTokens, &msg.OutputTokens, &createdAt); err != nil {
			return nil, err
		}
		msg.CreatedAt = createdAt.UnixMilli()
		messages = append(messages, msg)
	}

	if messages == nil {
		messages = []model.AIMessage{}
	}
	return messages, nil
}

// GetLatestSuggestByResume 根据简历ID、模块、字段和内容hash查询最近的润色建议会话
func (r *repository) GetLatestSuggestByResume(ctx context.Context, userID, resumeID, moduleType, fieldKey, contentHash string) (*model.AIConversation, error) {
	var conv model.AIConversation
	var title *string
	var contextJSON []byte
	var dbModuleType, dbModuleInstanceID string
	var createdAt, updatedAt time.Time

	err := r.pool.QueryRow(ctx, `
		SELECT id, user_id, resume_id, type, title, context, module_type, module_instance_id, created_at, updated_at
		FROM ai_conversations
		WHERE user_id = $1 AND type = 'suggest' AND resume_id = $2
		ORDER BY updated_at DESC
		LIMIT 1
	`, userID, resumeID).Scan(
		&conv.ID, &conv.UserID, &conv.ResumeID, &conv.Type,
		&title, &contextJSON, &dbModuleType, &dbModuleInstanceID, &createdAt, &updatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrConversationNotFound
		}
		return nil, err
	}
	conv.Title = title
	conv.ModuleType = dbModuleType
	conv.ModuleInstanceID = dbModuleInstanceID
	conv.ModuleType = dbModuleType
	conv.ModuleInstanceID = dbModuleInstanceID
	if len(contextJSON) > 0 {
		json.Unmarshal(contextJSON, &conv.Context)
	}
	conv.CreatedAt = createdAt.UnixMilli()
	conv.UpdatedAt = updatedAt.UnixMilli()

	// 验证 context 中存储的 contentHash 是否匹配
	if conv.Context == nil {
		return nil, ErrConversationNotFound
	}
	storedHash, _ := conv.Context["contentHash"].(string)
	if storedHash != contentHash {
		return nil, ErrConversationNotFound
	}

	// 获取消息
	messages, err := r.GetMessages(ctx, conv.ID)
	if err != nil {
		return nil, err
	}
	conv.Messages = messages

	return &conv, nil
}

// GetSuggestByContentHash 根据内容hash查询润色会话（用于判断是否有缓存）
func (r *repository) GetSuggestByContentHash(ctx context.Context, userID, resumeID, moduleType, moduleInstanceID, contentHash string) (*model.AIConversation, []model.AIMessage, error) {
	var conv model.AIConversation
	var title *string
	var contextJSON []byte
	var createdAt, updatedAt time.Time
	var dbModuleType, dbModuleInstanceID string

	err := r.pool.QueryRow(ctx, `
		SELECT id, user_id, resume_id, type, title, context, module_type, module_instance_id, created_at, updated_at
		FROM ai_conversations
		WHERE user_id = $1 AND type = 'suggest' AND resume_id = $2 AND module_type = $3 AND module_instance_id = $4
		ORDER BY updated_at DESC
		LIMIT 1
	`, userID, resumeID, moduleType, moduleInstanceID).Scan(
		&conv.ID, &conv.UserID, &conv.ResumeID, &conv.Type,
		&title, &contextJSON, &dbModuleType, &dbModuleInstanceID, &createdAt, &updatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, ErrConversationNotFound
		}
		return nil, nil, err
	}
	conv.Title = title
	conv.ModuleType = dbModuleType
	conv.ModuleInstanceID = dbModuleInstanceID
	if len(contextJSON) > 0 {
		json.Unmarshal(contextJSON, &conv.Context)
	}
	conv.CreatedAt = createdAt.UnixMilli()
	conv.UpdatedAt = updatedAt.UnixMilli()

	// 验证 contentHash
	if conv.Context == nil {
		return nil, nil, ErrConversationNotFound
	}
	storedHash, _ := conv.Context["contentHash"].(string)
	if storedHash != contentHash {
		return nil, nil, ErrConversationNotFound
	}

	messages, err := r.GetMessages(ctx, conv.ID)
	if err != nil {
		return nil, nil, err
	}

	return &conv, messages, nil
}

// ============ SuggestRecord Repository ============

// SuggestRecordRepository 润色记录仓库接口
type SuggestRecordRepository interface {
	Create(ctx context.Context, record *SuggestRecordDB) error
	ListByResume(ctx context.Context, userID, resumeID string, limit int) ([]model.SuggestRecord, error)
	ListByModule(ctx context.Context, userID, resumeID, moduleType, fieldKey string, limit int) ([]model.SuggestRecord, error)
}

// SuggestRecordDB 润色记录数据库模型
type SuggestRecordDB struct {
	ID               string
	UserID           string
	ResumeID         *string
	ConversationID   *string
	ModuleType       string
	ModuleInstanceID string
	FieldKey         string
	OriginalContent  string
	OptimizedContent *string
	CreatedAt        time.Time
}

type suggestRecordRepository struct {
	pool *pgxpool.Pool
}

func NewSuggestRecordRepository(pool *pgxpool.Pool) SuggestRecordRepository {
	return &suggestRecordRepository{pool: pool}
}

func (r *suggestRecordRepository) Create(ctx context.Context, record *SuggestRecordDB) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO ai_suggest_records (id, user_id, resume_id, conversation_id, module_type, module_instance_id, field_key, original_content, optimized_content, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
	`, record.ID, record.UserID, record.ResumeID, record.ConversationID, record.ModuleType, record.ModuleInstanceID, record.FieldKey, record.OriginalContent, record.OptimizedContent)
	return err
}

func (r *suggestRecordRepository) ListByResume(ctx context.Context, userID, resumeID string, limit int) ([]model.SuggestRecord, error) {
	if limit <= 0 {
		limit = 5
	}
	if limit > 20 {
		limit = 20
	}

	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id, resume_id, conversation_id, module_type, module_instance_id, field_key, original_content, optimized_content, created_at
		FROM ai_suggest_records
		WHERE user_id = $1 AND resume_id = $2
		ORDER BY created_at DESC
		LIMIT $3
	`, userID, resumeID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []model.SuggestRecord
	for rows.Next() {
		var rec model.SuggestRecord
		var resumeID *string
		var convID *string
		var optimizedContent *string
		var createdAt time.Time
		if err := rows.Scan(&rec.ID, &rec.UserID, &resumeID, &convID, &rec.ModuleType, &rec.ModuleInstanceID, &rec.FieldKey,
			&rec.OriginalContent, &optimizedContent, &createdAt); err != nil {
			return nil, err
		}
		if resumeID != nil {
			rec.ResumeID = *resumeID
		}
		if convID != nil {
			rec.ConversationID = *convID
		}
		if optimizedContent != nil {
			rec.OptimizedContent = *optimizedContent
		}
		rec.CreatedAt = createdAt.UnixMilli()
		records = append(records, rec)
	}
	if records == nil {
		records = []model.SuggestRecord{}
	}
	return records, nil
}

func (r *suggestRecordRepository) ListByModule(ctx context.Context, userID, resumeID, moduleType, moduleInstanceID string, limit int) ([]model.SuggestRecord, error) {
	if limit <= 0 {
		limit = 5
	}
	if limit > 20 {
		limit = 20
	}

	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id, resume_id, conversation_id, module_type, module_instance_id, field_key, original_content, optimized_content, created_at
		FROM ai_suggest_records
		WHERE user_id = $1 AND resume_id = $2 AND module_type = $3 AND module_instance_id = $4
		ORDER BY created_at DESC
		LIMIT $5
	`, userID, resumeID, moduleType, moduleInstanceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []model.SuggestRecord
	for rows.Next() {
		var rec model.SuggestRecord
		var resumeID *string
		var convID *string
		var optimizedContent *string
		var createdAt time.Time
		if err := rows.Scan(&rec.ID, &rec.UserID, &resumeID, &convID, &rec.ModuleType, &rec.ModuleInstanceID, &rec.FieldKey,
			&rec.OriginalContent, &optimizedContent, &createdAt); err != nil {
			return nil, err
		}
		if resumeID != nil {
			rec.ResumeID = *resumeID
		}
		if convID != nil {
			rec.ConversationID = *convID
		}
		if optimizedContent != nil {
			rec.OptimizedContent = *optimizedContent
		}
		rec.CreatedAt = createdAt.UnixMilli()
		records = append(records, rec)
	}
	if records == nil {
		records = []model.SuggestRecord{}
	}
	return records, nil
}
