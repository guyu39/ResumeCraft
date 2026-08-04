-- ============================================================
-- 首页内容历史快照表（按日保留，支持近 7 天多天展示）
-- github_sync_snapshots:  每次 GitHub 同步的当日 30 条项目快照
-- resume_project_snapshots: AI 生成项目推荐的当日快照
-- 幂等（IF NOT EXISTS），不使用外键（项目规范）
-- ============================================================

CREATE TABLE IF NOT EXISTS github_sync_snapshots (
    id            BIGSERIAL PRIMARY KEY,
    snapshot_date DATE        NOT NULL,
    items         JSONB       NOT NULL DEFAULT '[]',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_github_sync_snapshots_date ON github_sync_snapshots (snapshot_date DESC);

CREATE TABLE IF NOT EXISTS resume_project_snapshots (
    id            BIGSERIAL PRIMARY KEY,
    snapshot_date DATE        NOT NULL,
    items         JSONB       NOT NULL DEFAULT '[]',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_resume_project_snapshots_date ON resume_project_snapshots (snapshot_date DESC);
