package ai

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrParserConfigNotFound = errors.New("parser config not found")

// ParserConfigRecord 简历解析 AI 配置记录
type ParserConfigRecord struct {
	ID              string
	UserID          string
	Provider        string
	APIKeyEncrypted string
	BaseURL         string
	Model           string
	Enabled         bool
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// ParserConfigRepository 简历解析配置仓库接口
type ParserConfigRepository interface {
	GetByUserID(ctx context.Context, userID string) (*ParserConfigRecord, error)
	Upsert(ctx context.Context, cfg *ParserConfigRecord) error
}

type parserConfigRepository struct {
	pool *pgxpool.Pool
}

func NewParserConfigRepository(pool *pgxpool.Pool) ParserConfigRepository {
	return &parserConfigRepository{pool: pool}
}

func (r *parserConfigRepository) GetByUserID(ctx context.Context, userID string) (*ParserConfigRecord, error) {
	var cfg ParserConfigRecord
	err := r.pool.QueryRow(ctx, `
		SELECT id, user_id, provider, api_key_encrypted, base_url, model,
		       enabled, created_at, updated_at
		FROM resume_parser_configs
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`, userID).Scan(
		&cfg.ID, &cfg.UserID, &cfg.Provider, &cfg.APIKeyEncrypted, &cfg.BaseURL,
		&cfg.Model, &cfg.Enabled, &cfg.CreatedAt, &cfg.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrParserConfigNotFound
		}
		return nil, err
	}
	return &cfg, nil
}

func (r *parserConfigRepository) Upsert(ctx context.Context, cfg *ParserConfigRecord) error {
	_, err := r.pool.Exec(ctx, `
		WITH upsert AS (
			UPDATE resume_parser_configs
			SET provider = $3, api_key_encrypted = $4, base_url = $5,
			    model = $6, enabled = $7, updated_at = NOW()
			WHERE user_id = $2
			RETURNING *
		)
		INSERT INTO resume_parser_configs (id, user_id, provider, api_key_encrypted, base_url, model, enabled, created_at, updated_at)
		SELECT $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()
		WHERE NOT EXISTS (SELECT 1 FROM upsert)
	`, cfg.ID, cfg.UserID, cfg.Provider, cfg.APIKeyEncrypted, cfg.BaseURL, cfg.Model, cfg.Enabled)
	return err
}
