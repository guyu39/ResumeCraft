-- 招聘聚合"已投递"标记：按用户维度记录对某条招聘信息的投递标记。
-- 独立于 job_applications（正式投递管理），仅作轻量标记，不建外键，归属由应用层校验。

CREATE TABLE IF NOT EXISTS job_posting_marks
(
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    job_posting_id  UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_posting_marks_user_job
    ON job_posting_marks (user_id, job_posting_id);

CREATE INDEX IF NOT EXISTS idx_job_posting_marks_user
    ON job_posting_marks (user_id);

COMMENT ON TABLE job_posting_marks IS '用户对招聘聚合条目的"已投递"标记，不与 job_applications 关联，不建外键';
