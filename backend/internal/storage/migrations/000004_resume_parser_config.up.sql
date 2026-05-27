-- Phase 2-A extension: resume parser AI config

CREATE TABLE IF NOT EXISTS resume_parser_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider VARCHAR(64) NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  base_url TEXT NOT NULL DEFAULT '',
  model VARCHAR(128) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_resume_parser_configs_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT uq_resume_parser_configs_user UNIQUE (user_id)
);

CREATE INDEX idx_resume_parser_configs_user ON resume_parser_configs (user_id);
