-- ============================================================
-- github_projects 新增中文加工字段：summary_zh / highlight_zh
-- 由系统级 AI（GenerateHomeContent 同批调用）对英文项目简介加工为中文
-- 一句话简介 + 求职视角亮点点评；未配置 AI 或加工失败时保持为空，
-- 前端回退展示原始 description。幂等（IF NOT EXISTS），不使用外键。
-- ============================================================

ALTER TABLE github_projects ADD COLUMN IF NOT EXISTS summary_zh   TEXT NOT NULL DEFAULT '';
ALTER TABLE github_projects ADD COLUMN IF NOT EXISTS highlight_zh TEXT NOT NULL DEFAULT '';
