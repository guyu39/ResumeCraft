-- ============================================================
-- 清理 2026-08-11 为账号 1368214010@qq.com (谷雨) 生成的种子数据
-- 依据 jd_hash 前缀 'seed-20260811-' 定位；用户手动运行。
-- 顺序：先删关联（interviews / status_events），再删主表（applications）。
-- ============================================================

BEGIN;

WITH seeded AS (
  SELECT id
  FROM job_applications
  WHERE user_id = 'c0a2e767-2154-484d-92df-913e44b50694'
    AND jd_hash LIKE 'seed-20260811-%'
)
DELETE FROM job_application_status_events
 WHERE application_id IN (SELECT id FROM seeded);

WITH seeded AS (
  SELECT id
  FROM job_applications
  WHERE user_id = 'c0a2e767-2154-484d-92df-913e44b50694'
    AND jd_hash LIKE 'seed-20260811-%'
)
DELETE FROM job_application_interviews
 WHERE application_id IN (SELECT id FROM seeded);

DELETE FROM job_applications
 WHERE user_id = 'c0a2e767-2154-484d-92df-913e44b50694'
   AND jd_hash LIKE 'seed-20260811-%';

COMMIT;
