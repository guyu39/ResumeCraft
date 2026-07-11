package audit

import (
	"context"
	"encoding/json"
	"fmt"

	"resumecraft-pdf-backend/internal/requestmeta"

	"github.com/jackc/pgx/v5"
)

type Entry struct {
	Action       string
	ResourceType string
	ResourceID   string
	Metadata     map[string]any
}

type Writer interface {
	AppendTx(ctx context.Context, tx pgx.Tx, entry Entry) error
}

type writer struct{}

func NewWriter() Writer {
	return writer{}
}

func (writer) AppendTx(ctx context.Context, tx pgx.Tx, entry Entry) error {
	metadataJSON, err := json.Marshal(entry.Metadata)
	if err != nil {
		return fmt.Errorf("marshal operation audit metadata: %w", err)
	}

	request, _ := requestmeta.From(ctx)
	_, err = tx.Exec(ctx, `
		INSERT INTO operation_audit_logs (
			actor_user_id, action, resource_type, resource_id,
			request_id, method, path, ip_address, user_agent, metadata
		) VALUES (
			NULLIF($1, '')::uuid, $2, $3, NULLIF($4, '')::uuid,
			NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''),
			NULLIF($8, '')::inet, NULLIF($9, ''), $10::jsonb
		)
	`, request.ActorUserID, entry.Action, entry.ResourceType, entry.ResourceID,
		request.RequestID, request.Method, request.Path, request.IP, request.UserAgent, metadataJSON)
	if err != nil {
		return fmt.Errorf("append operation audit log: %w", err)
	}
	return nil
}
