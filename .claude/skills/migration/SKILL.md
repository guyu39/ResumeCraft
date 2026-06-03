---
name: migration
description: PostgreSQL 数据库迁移编写规范。当需要新增表、修改字段、添加索引或编写 migration SQL 文件时使用此 skill。适用于 ResumeCraft 项目迁移管理。
agent_created: true
---

# Migration — 数据库迁移编写规范

## 文件位置与命名

```
backend/migrations/
```

命名格式：`<序号>_<动作>_<对象>.sql`

已有迁移文件：
```
001_create_users.sql
002_create_resumes.sql
003_create_snapshots.sql
004_add_snapshot_drafts.sql
```

## 编写规则

### 1. 必须幂等

每个 migration 使用 `IF NOT EXISTS` / `IF EXISTS`，确保可重复执行不会报错：

```sql
-- ✅ 好的写法
ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS draft_content JSONB;

-- ❌ 坏写法
ALTER TABLE snapshots ADD COLUMN draft_content JSONB;
```

### 2. 新表创建模板

```sql
-- 005_create_ai_suggest_records.sql

CREATE TABLE IF NOT EXISTS ai_suggest_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resume_id       UUID REFERENCES resumes(id) ON DELETE SET NULL,
    conversation_id UUID,
    module_type     VARCHAR(32)  NOT NULL,
    field_key       VARCHAR(64)  NOT NULL,
    original_text   TEXT         NOT NULL,
    optimized_text  TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT fk_suggest_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_suggest_records_user ON ai_suggest_records(user_id, created_at DESC);
```

### 3. 字段增删模板

```sql
-- 新增字段
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS locale VARCHAR(10) DEFAULT 'zh-CN';
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS theme_color VARCHAR(7) DEFAULT '#2563eb';

-- 删除字段（谨慎！先确认无引用）
-- ALTER TABLE resumes DROP COLUMN IF EXISTS old_field;

-- 修改字段类型
ALTER TABLE resumes ALTER COLUMN title TYPE VARCHAR(200);
```

### 4. 索引模板

```sql
CREATE INDEX IF NOT EXISTS idx_resumes_user_updated
    ON resumes(user_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshots_label
    ON snapshots(resume_id, label) WHERE label IS NOT NULL AND label != '';
```

### 5. 约束模板

```sql
-- 外键
ALTER TABLE snapshots
    ADD CONSTRAINT fk_snapshot_resume
    FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE;

-- 唯一约束
ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email);

-- Check 约束
ALTER TABLE exports
    ADD CONSTRAINT chk_export_format CHECK (format IN ('pdf', 'docx', 'md'));
```

## 核心表结构参考

| 表名 | 主键 | 关键字段 |
|------|------|---------|
| `users` | UUID | email, password_hash, display_name |
| `resumes` | UUID | user_id, title, locale, theme_color, style_settings(JSONB), modules(JSONB) |
| `snapshots` | UUID | resume_id, user_id, version_no, label, content(JSONB), draft_content(JSONB) |
| `exports` | UUID | resume_id, format, status, file_url |
| `ai_configs` | UUID | user_id, provider, api_key_encrypted, base_url, default_model |
| `ai_conversations` | UUID | user_id, resume_id, type, title, context(JSONB) |

## 字段类型约定

| 用途 | 类型 | 说明 |
|------|------|------|
| 主键/外键 | UUID | `gen_random_uuid()` |
| 短文本 | VARCHAR(n) | 有长度上限 |
| 长文本 | TEXT | 无上限 |
| JSON/复杂结构 | JSONB | 带默认值 `'{}'::jsonb` |
| 时间戳 | TIMESTAMPTZ | `now()` |
| 布尔 | BOOLEAN | `DEFAULT false` |
| 枚举 | VARCHAR(32) | 字符串约束，不在 PG 层用 enum 类型 |

## 迁移管理

**当前项目未使用 ORM 迁移框架**，SQL 文件按序号手动执行。

启动时 `init.sql` 或 compose 中的 db-init 容器负责执行迁移。
