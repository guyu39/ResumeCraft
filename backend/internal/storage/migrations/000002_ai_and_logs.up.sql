-- Phase 2-A extension: AI generation records and login/system logs

CREATE TABLE ai_generation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  resume_id UUID,
  resume_version_id UUID,
  scenario VARCHAR(64) NOT NULL,
  module_type VARCHAR(64),
  provider VARCHAR(64) NOT NULL,
  model VARCHAR(128) NOT NULL,
  prompt_text TEXT NOT NULL,
  response_text TEXT,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'success',
  error_message TEXT,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_ai_generation_records_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_generation_records_resume FOREIGN KEY (resume_id)
    REFERENCES resumes (id) ON DELETE SET NULL,
  CONSTRAINT fk_ai_generation_records_resume_version FOREIGN KEY (resume_version_id)
    REFERENCES resume_versions (id) ON DELETE SET NULL
);

CREATE INDEX idx_ai_generation_records_user_created_at
  ON ai_generation_records (user_id, created_at DESC);
CREATE INDEX idx_ai_generation_records_resume_created_at
  ON ai_generation_records (resume_id, created_at DESC);
CREATE INDEX idx_ai_generation_records_status_created_at
  ON ai_generation_records (status, created_at DESC);

CREATE TABLE ai_usage_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  usage_date DATE NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_ai_usage_daily_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT uq_ai_usage_daily_user_date UNIQUE (user_id, usage_date)
);

CREATE INDEX idx_ai_usage_daily_usage_date ON ai_usage_daily (usage_date DESC);

CREATE TABLE login_attempt_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  success BOOLEAN NOT NULL,
  reason VARCHAR(128),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_attempt_logs_email_created_at
  ON login_attempt_logs (LOWER(email), created_at DESC);
CREATE INDEX idx_login_attempt_logs_created_at
  ON login_attempt_logs (created_at DESC);

CREATE TABLE system_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level VARCHAR(16) NOT NULL,
  source VARCHAR(64) NOT NULL,
  event VARCHAR(128) NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_system_logs_level_created_at
  ON system_logs (level, created_at DESC);
CREATE INDEX idx_system_logs_source_created_at
  ON system_logs (source, created_at DESC);

CREATE TRIGGER trg_ai_usage_daily_set_updated_at
BEFORE UPDATE ON ai_usage_daily
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
