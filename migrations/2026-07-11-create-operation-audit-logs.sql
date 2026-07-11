-- Execute manually before deploying code that writes operation audit logs.
CREATE TABLE IF NOT EXISTS operation_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(128) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id UUID,
    request_id VARCHAR(64),
    method VARCHAR(16),
    path TEXT,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operation_audit_logs_actor_created_at
    ON operation_audit_logs (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operation_audit_logs_resource_created_at
    ON operation_audit_logs (resource_type, resource_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operation_audit_logs_request_id
    ON operation_audit_logs (request_id);
