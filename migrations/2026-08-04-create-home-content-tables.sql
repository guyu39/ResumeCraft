-- ============================================================
-- 首页内容表：AI 日报（每日精选资讯）+ 简历项目推荐
-- 幂等（IF NOT EXISTS），可重复执行；不使用外键（项目规范）
-- ============================================================

-- AI 日报：每天一份，report_date 唯一；items 为资讯 JSONB 数组
CREATE TABLE IF NOT EXISTS ai_daily_reports (
    id             BIGSERIAL PRIMARY KEY,
    report_date    DATE        NOT NULL,
    title          TEXT        NOT NULL DEFAULT '',
    theme          TEXT        NOT NULL DEFAULT '',
    trend_keywords TEXT[]      NOT NULL DEFAULT '{}',
    items          JSONB       NOT NULL DEFAULT '[]',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_daily_reports_date ON ai_daily_reports (report_date DESC);

-- 简历项目推荐：toC 场景项目，供首页展示
CREATE TABLE IF NOT EXISTS resume_projects (
    id             BIGSERIAL PRIMARY KEY,
    name           TEXT        NOT NULL,
    tagline        TEXT        NOT NULL DEFAULT '',
    tech_stack     TEXT[]      NOT NULL DEFAULT '{}',
    modules        TEXT[]      NOT NULL DEFAULT '{}',
    star_summary   TEXT        NOT NULL DEFAULT '',
    duration       TEXT        NOT NULL DEFAULT '',
    difficulty     INTEGER     NOT NULL DEFAULT 3,
    trend_relation TEXT        NOT NULL DEFAULT '',
    sort_order     INTEGER     NOT NULL DEFAULT 0,
    active         BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resume_projects_sort ON resume_projects (sort_order, active);
