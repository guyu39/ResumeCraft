-- Establish one mutable current version for every resume.
-- This migration intentionally adds no foreign keys; ownership is enforced by repository queries.

ALTER TABLE resume_versions
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE resume_versions
    ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;

ALTER TABLE resumes
    ADD COLUMN IF NOT EXISTS current_version_id UUID;

UPDATE resume_versions
SET updated_at = created_at
WHERE updated_at IS NULL;

ALTER TABLE resume_versions DROP CONSTRAINT IF EXISTS chk_snapshot_type;
ALTER TABLE resume_versions
    ADD CONSTRAINT chk_snapshot_type
    CHECK (snapshot_type IN ('current', 'manual', 'auto', 'default'));

WITH ranked_current AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY resume_id
               ORDER BY updated_at DESC, created_at DESC, id DESC
           ) AS row_number
    FROM resume_versions
    WHERE snapshot_type = 'current'
)
UPDATE resume_versions AS version_row
SET snapshot_type = 'auto',
    label = COALESCE(version_row.label, '历史自动版本'),
    updated_at = NOW()
FROM ranked_current
WHERE version_row.id = ranked_current.id
  AND ranked_current.row_number > 1;

INSERT INTO resume_versions (
    resume_id,
    user_id,
    content_snapshot,
    snapshot_type,
    label,
    version,
    created_at,
    updated_at
)
SELECT resume.id,
       resume.user_id,
       resume.content,
       'current',
       '当前',
       resume.version,
       resume.created_at,
       resume.updated_at
FROM resumes AS resume
WHERE NOT EXISTS (
    SELECT 1
    FROM resume_versions AS version_row
    WHERE version_row.resume_id = resume.id
      AND version_row.snapshot_type = 'current'
);

UPDATE resume_versions AS current_version
SET version = resume.version
FROM resumes AS resume
WHERE current_version.resume_id = resume.id
  AND current_version.user_id = resume.user_id
  AND current_version.snapshot_type = 'current'
  AND current_version.version IS DISTINCT FROM resume.version;

WITH selected_current AS (
    SELECT DISTINCT ON (version_row.resume_id)
           version_row.resume_id,
           version_row.user_id,
           version_row.id
    FROM resume_versions AS version_row
    WHERE version_row.snapshot_type = 'current'
    ORDER BY version_row.resume_id, version_row.updated_at DESC, version_row.created_at DESC
)
UPDATE resumes AS resume
SET current_version_id = selected_current.id
FROM selected_current
WHERE selected_current.resume_id = resume.id
  AND selected_current.user_id = resume.user_id
  AND resume.current_version_id IS DISTINCT FROM selected_current.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_resume_versions_one_current
    ON resume_versions (resume_id)
    WHERE snapshot_type = 'current';

CREATE INDEX IF NOT EXISTS idx_resume_versions_owner_resume
    ON resume_versions (user_id, resume_id, created_at DESC);

COMMENT ON COLUMN resumes.current_version_id IS '当前可变编辑版本 ID，由应用层校验归属';
COMMENT ON COLUMN resume_versions.version IS '版本正文修订号；current 用于乐观锁，命名快照编辑时递增';
COMMENT ON COLUMN resume_versions.updated_at IS '版本正文或标签最后更新时间';
