-- 回滚 seed-interview-questions-20260812.sql 补充的面试问题
-- 作用域：仅 jd_hash LIKE 'seed-20260811-%' 的投递关联面试记录
-- 将 questions/notes 清空（这些字段原本就是空的）

BEGIN;

UPDATE job_application_interviews it
SET questions = '',
    notes = '',
    updated_at = NOW()
WHERE it.user_id = 'c0a2e767-2154-484d-92df-913e44b50694'
  AND it.application_id IN (
    SELECT id FROM job_applications WHERE jd_hash LIKE 'seed-20260811-%'
  );

COMMIT;
