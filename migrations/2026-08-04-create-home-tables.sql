-- ============================================================
-- 首页工作台数据表：AI 新闻速递 + GitHub 最新开源项目
-- 幂等（IF NOT EXISTS），可重复执行；不使用外键（项目规范）
-- ============================================================

-- AI 新闻速递：按 url 去重，published_at 用于按天分组
CREATE TABLE IF NOT EXISTS ai_news (
    id           BIGSERIAL PRIMARY KEY,
    title        TEXT        NOT NULL,
    url          TEXT        NOT NULL,
    source       TEXT        NOT NULL DEFAULT '',
    summary      TEXT        NOT NULL DEFAULT '',
    published_at TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_news_url ON ai_news (url);
CREATE INDEX IF NOT EXISTS idx_ai_news_published_at ON ai_news (published_at DESC);

-- GitHub 最新开源项目：按 full_name 去重，stars 用于排序
CREATE TABLE IF NOT EXISTS github_projects (
    id          BIGSERIAL PRIMARY KEY,
    full_name   TEXT        NOT NULL,
    html_url    TEXT        NOT NULL DEFAULT '',
    description TEXT        NOT NULL DEFAULT '',
    language    TEXT        NOT NULL DEFAULT '',
    stars       INTEGER     NOT NULL DEFAULT 0,
    forks       INTEGER     NOT NULL DEFAULT 0,
    topics      TEXT[]      NOT NULL DEFAULT '{}',
    synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_github_projects_full_name ON github_projects (full_name);
CREATE INDEX IF NOT EXISTS idx_github_projects_stars ON github_projects (stars DESC);
