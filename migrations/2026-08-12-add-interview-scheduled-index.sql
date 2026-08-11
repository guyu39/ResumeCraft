-- 为日历视图按时间区间查询面试记录提供索引
-- 现有索引 idx_job_application_interviews_application 按 application_id 聚集，
-- 跨用户按 scheduled_at 时间范围扫描时无法走索引。
CREATE INDEX IF NOT EXISTS idx_job_application_interviews_scheduled
    ON job_application_interviews (scheduled_at);
