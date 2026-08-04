-- ============================================================
-- resume_projects 增加 updated_at 列（幂等）
-- 首页项目推荐按更新时间倒序展示，AI 每日生成时刷新该列
-- 存量数据回填为 created_at
-- ============================================================

ALTER TABLE resume_projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE resume_projects SET updated_at = created_at WHERE updated_at = created_at AND created_at IS NOT NULL;
