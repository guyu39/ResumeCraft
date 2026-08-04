-- 回填：历史已在「旧代码」下软删除的投递记录，其 snapshot_version_id 未被置空，
-- 仍物理持有对简历快照的引用，导致删除快照时外键 RESTRICT 触发 500。
-- 这里把这些软删除记录的引用置空，使「绑定的投递记录已软删除则允许删除快照」真正生效。
-- 同时保证列可空（幂等，兼容迁移已执行过的情况）。本文件幂等，可重复执行。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_applications'
      AND column_name = 'snapshot_version_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE job_applications ALTER COLUMN snapshot_version_id DROP NOT NULL;
  END IF;
END $$;

UPDATE job_applications
SET snapshot_version_id = NULL
WHERE deleted_at IS NOT NULL
  AND snapshot_version_id IS NOT NULL;
