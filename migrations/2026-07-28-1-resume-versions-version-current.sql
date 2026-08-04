-- snapshot-as-source-of-truth: resume_versions 升为正文权威
-- 1) 新增 version 列（乐观锁 CAS，每快照独立版本）
-- 2) snapshot_type check 增加 'current'（当前编辑载体快照）
-- 幂等，可重复执行。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'resume_versions' AND column_name = 'version'
  ) THEN
    ALTER TABLE resume_versions ADD COLUMN version bigint NOT NULL DEFAULT 0;
  END IF;
END $$;

ALTER TABLE resume_versions DROP CONSTRAINT IF EXISTS chk_snapshot_type;
ALTER TABLE resume_versions
  ADD CONSTRAINT chk_snapshot_type
  CHECK (snapshot_type = ANY (ARRAY['auto'::varchar, 'manual'::varchar, 'default'::varchar, 'current'::varchar]));
