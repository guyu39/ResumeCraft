-- ============================================================
-- resume_projects.name 唯一索引：AI 每日生成项目推荐时按名称幂等覆盖
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_resume_projects_name ON resume_projects (name);
