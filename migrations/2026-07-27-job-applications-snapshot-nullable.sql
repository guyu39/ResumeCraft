-- 方案 B：投递记录软删除后释放对简历快照的引用，从而允许删除快照。
-- 将 job_applications.snapshot_version_id 由 NOT NULL 改为可空，并在软删除时（repository Delete）
-- 置空该列；IsSnapshotInUse 仅统计未软删记录。其余对 resume_versions 的外键均为 ON DELETE SET NULL，
-- 不拦截删除。本迁移幂等，可重复执行。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'job_applications'
      AND column_name = 'snapshot_version_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE job_applications ALTER COLUMN snapshot_version_id DROP NOT NULL;
  END IF;
END $$;
