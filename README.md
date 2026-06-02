# ResumeCraft（简历大师）

一个 React + TypeScript 在线简历编辑器，提供三栏编辑体验、实时 A4 预览、模块化内容管理、版本快照对比与 AI 辅助优化能力。

## 功能亮点

1. **三栏工作台**：左栏模块管理，中栏实时预览，右栏表单编辑。
2. **模块化编辑**：固定模块（个人信息、教育经历、工作/实习经历、项目经历）+ 可选模块（技能清单、自我评价、荣誉奖项、证书资质、作品集、语言能力）+ 自定义模块。
3. **拖拽排序与显隐**：模块顺序可调整，支持一键隐藏/显示。
4. **三套模板**：经典单栏、现代双栏、简约极简。
5. **样式调节**：主题色、字体、字号、边距、行距、段落间距、模块标题样式（标记线/底线/无线）。
6. **富文本能力**：Tiptap 富文本编辑器，支持加粗/斜体/下划线/链接/列表，链接使用应用内弹窗。
7. **字体编码检测**：粘贴时提示异常字符，支持自动修复。
8. **本地自动保存**：Zustand + localStorage 防抖持久化，刷新后可恢复。
9. **云端同步**：登录后事件驱动落库（切后台/刷新/关页面），`lastSyncedDataRef` 数据去重避免重复写。
10. **版本快照**：手动创建命名快照记录简历状态，快照时间轴可视化，每个快照支持独立本地草稿（切快照自动保存/恢复）。
11. **快照对比**：选择两个快照逐模块逐字段比较，Git 风格统一 diff（+ 新增 / − 删除），支持递归比较 items 数组内的字段差异。
12. **A4 分页预览**：按页切片展示，自适应缩放，减少内容截断。
13. **AI 辅助**：简历评估、内容润色建议、JD 匹配分析、求职信生成、要点改写、简历翻译。
14. **PDF 导出**：后端 chromedp 异步任务（创建 → 轮询 → 下载）。
15. **中英文国际化**：一键切换中英文简历，AI 翻译模块自动生成英文副本。
16. **简历解析导入**：上传 PDF/Word 文件，AI 自动识别填充。
17. **认证与安全**：JWT + Redis token 即时撤销 + 令牌桶限流 + bcrypt 密码哈希。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript 5 + Vite 5 |
| 状态管理 | Zustand（localStorage 持久化 + 脏标记 + 快照草稿管理） |
| 样式 | Tailwind CSS |
| 拖拽 | @dnd-kit |
| 富文本 | Tiptap |
| 后端框架 | Go (Gin) |
| 数据库 | PostgreSQL + Redis（认证/限流） |
| PDF 渲染 | chromedp (Chromium) |
| 对象存储 | MinIO (S3 兼容) |
| 数据安全 | DOMPurify（HTML 净化）、AES-256-GCM（AI 密钥加密） |
| AI | OpenAI Compatible API（流式 SSE） |
| 限流 | Redis Lua 令牌桶（auth/ai 分别限流，Fail-Open 策略） |

## 项目结构

```
introduce/
├── src/                          # 前端源码
│   ├── api/                      # API 客户端
│   │   ├── client.ts             # 通用请求客户端（自动 Token 刷新）
│   │   ├── types.ts              # API 类型定义
│   │   ├── auth.ts               # 认证接口
│   │   ├── resume.ts             # 简历 CRUD + 快照 + 分支 + Diff
│   │   ├── export.ts             # PDF 导出任务
│   │   ├── ai.ts                 # AI 接口（评估/润色/翻译/求职信等）
│   │   ├── upload.ts             # 文件上传
│   │   └── index.ts
│   ├── components/
│   │   ├── layout/               # 布局组件
│   │   │   ├── AppShell.tsx      # 三栏容器
│   │   │   ├── LeftPanel.tsx     # 左栏（模块列表 + 当前分支）
│   │   │   ├── CenterPanel.tsx   # 中栏（A4预览 + 快照时间轴 + Diff弹窗）
│   │   │   ├── RightPanel.tsx    # 右栏（编辑/设置/AI评估/PDF导出）
│   │   │   ├── LoginPage.tsx     # 登录注册页
│   │   │   ├── ResumeListPage.tsx # 简历列表页
│   │   │   └── ai/               # AI 面板组件（评估/匹配/改写/求职信/评分）
│   │   ├── resume/               # 简历模块编辑表单（11个模块）
│   │   ├── resume/blocks/        # 模块表单子组件
│   │   └── common/               # 通用组件（SnapshotTimeline、主题色、模板切换等）
│   ├── hooks/                    # 自定义 Hook
│   │   ├── useCloudSync.ts       # 云端同步（事件驱动 + 数据去重）
│   │   ├── useExportPDF.ts       # PDF 导出（异步任务轮询）
│   │   ├── useI18n.ts            # 国际化翻译
│   │   ├── useTranslate.ts       # AI 翻译流程
│   │   └── ...                   # AI 功能 Hooks（评估/润色/匹配/求职信等）
│   ├── store/
│   │   ├── authStore.ts          # 认证状态
│   │   └── resumeStore.ts        # 简历状态（含快照草稿管理 + 脏标记）
│   ├── i18n/
│   │   └── resume.ts             # 中英文翻译字典（150+ 键值对）
│   └── App.tsx                   # 根组件（认证检查 + 路由分发）
├── backend/                      # 后端 API 服务（Go + Gin）
│   ├── cmd/server/main.go
│   └── internal/
│       ├── app/                  # 应用初始化（DB/Redis/路由）
│       ├── config/               # 配置管理（环境变量解析）
│       ├── middleware/           # 中间件（认证/限流/CORS）
│       ├── router/               # 路由注册
│       ├── handler/              # HTTP Handler（auth/resume/snapshot/export/ai）
│       ├── service/              # 业务逻辑
│       ├── storage/              # 数据访问（PostgreSQL）
│       ├── model/                # 数据模型
│       └── renderer/             # PDF 渲染（chromedp）
├── migrations/                   # 数据库迁移 SQL
│   ├── 001_add_snapshot_type.sql
│   ├── 002_add_default_snapshots.sql
│   ├── 003_add_snapshot_version_id_to_conversations.sql
│   └── 004_add_snapshot_drafts.sql
├── python-parser/                # 简历解析服务（FastAPI）
├── docker/                       # 本地开发依赖（nginx/minio/redis 等）
├── docs/                         # 技术文档（14篇）
│   ├── 技术文档.md
│   ├── tech-translate-resume.md
│   ├── snapshot-diff-optimization.md
│   ├── version-snapshot-timeline.md
│   └── ...
└── docker-compose.yml
```

## 快速开始

### Docker Compose（一键启动）

```bash
docker compose up --build
```

包含：后端 API、PostgreSQL、MinIO、Redis、简历解析服务与 Nginx。

### 前端

```bash
npm install
npm run dev          # 启动开发服务器（API 代理到 localhost:8787）
npm run build        # 生产构建
npm run preview      # 预览构建产物
```

### 后端

```bash
cd backend
go mod tidy
go run ./cmd/server  # 启动服务（默认 :8787）
```

### 数据库迁移

```bash
psql -U resumecraft -d resumecraft -f migrations/001_add_snapshot_type.sql
psql -U resumecraft -d resumecraft -f migrations/002_add_default_snapshots.sql
psql -U resumecraft -d resumecraft -f migrations/003_add_snapshot_version_id_to_conversations.sql
psql -U resumecraft -d resumecraft -f migrations/004_add_snapshot_drafts.sql
```

## 环境变量

### 前端（Vite）

```env
VITE_API_BASE_URL=http://localhost:8787/api
```

### 后端（Go）

```env
# 数据库
PG_DSN=postgres://user:password@localhost:5432/resumecraft?sslmode=disable

# JWT
AUTH_JWT_SECRET=your-secret-key
AUTH_ACCESS_TOKEN_TTL_MINUTES=15
AUTH_REFRESH_TOKEN_TTL_HOURS=720

# AI 配置加密密钥
AI_ENCRYPTION_KEY=change-this-32-char-key!!

# 对象存储（S3 兼容，未配置则使用内存降级）
S3_ENDPOINT=localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin123
S3_BUCKET=resumecraft
S3_USE_SSL=false

# 简历解析服务
PARSER_SERVICE_URL=http://localhost:9002

# Redis（认证 Token 存储 + 限流，推荐启用）
REDIS_ENABLED=true
REDIS_ADDR=localhost:6379
REDIS_PASSWORD=
REDIS_DB=0

# 限流（Redis Lua 令牌桶）
RATE_LIMIT_ENABLED=true
RATE_LIMIT_FAIL_OPEN=true
RATE_LIMIT_AUTH_CAPACITY=8
RATE_LIMIT_AI_CAPACITY=20
RATE_LIMIT_GLOBAL_CAPACITY=120

# 静态资源（Go 后端直出前端构建产物）
FRONTEND_DIST_DIR=../dist
```

## API 概览

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/register | 用户注册 |
| POST | /api/auth/login | 用户登录 |
| POST | /api/auth/refresh | 刷新 Token |
| POST | /api/auth/logout | 登出（即时撤销 Redis 令牌） |
| GET | /api/auth/me | 当前用户信息 |

### 简历管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/resumes | 简历列表 |
| POST | /api/resumes | 创建简历 |
| POST | /api/resumes/parse | 简历导入解析 |
| GET | /api/resumes/:id | 获取简历详情 |
| PUT | /api/resumes/:id | 更新简历（自动保存/落库） |
| DELETE | /api/resumes/:id | 删除简历 |

### 版本快照

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/resumes/:id/snapshots | 快照列表（支持 type/limit 参数） |
| POST | /api/resumes/:id/snapshots | 创建快照 |
| GET | /api/resumes/:id/snapshots/:snid | 快照详情 |
| PUT | /api/resumes/:id/snapshots/:snid | 更新快照标签 |
| DELETE | /api/resumes/:id/snapshots/:snid | 删除快照 |
| POST | /api/resumes/:id/snapshots/:snid/restore | 恢复快照 |
| POST | /api/resumes/:id/snapshots/diff | 快照对比（支持 currentModules/comparisonModules） |

### PDF 导出

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/resumes/:id/exports | 创建导出任务 |
| GET | /api/exports/:taskId | 查询导出任务状态 |
| GET | /api/exports/:taskId/download | 下载导出文件 |

### AI 功能

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | /api/ai/config | 获取/保存 AI 配置 |
| GET/POST | /api/ai/parser-config | 获取/保存简历解析配置 |
| POST | /api/ai/evaluate/stream | 简历评估（SSE 流式） |
| POST | /api/ai/jd-match/stream | JD 匹配分析（SSE 流式） |
| POST | /api/ai/score | JD 评分 |
| POST | /api/ai/rewrite/bullet | 要点改写 |
| POST | /api/ai/cover-letter | 求职信生成 |
| POST | /api/ai/suggest | 内容润色建议 |
| POST | /api/ai/translate | 简历翻译 |
| GET | /api/ai/conversations | AI 对话列表 |
| GET | /api/ai/conversations/:id | 获取对话详情 |
| DELETE | /api/ai/conversations/:id | 删除对话 |
| GET/POST | /api/ai/suggest-records | 润色记录列表/保存 |

## 核心机制说明

### 快照版本管理

- **快照创建**：手动点击「新建版本」将当前编辑器状态固化为一个命名快照（存入 `resume_versions` 表）。
- **快照草稿**：切走快照时当前编辑保存到 `localStorage`（key: `resumecraft_snapshot_draft_:id`），切回时自动恢复。
- **对比算法**：后端按 `module.id` 匹配模块 → 递归 `items` 数组 → 逐字段 `fieldToString` 比较 → 返回 `FieldDiff[]`。
- **持久化**：切后台/关闭页面时通过 `saveToCloud` 落库，`lastSyncedDataRef` 数据去重避免重复写。

### 云端同步

- **事件驱动**：`beforeunload`（sendBeacon 兜底）+ `visibilitychange`（切后台）。
- **数据去重**：比较 `serializeResume(resume)` 与 `lastSyncedDataRef`，相同则跳过。
- **快照草稿收集**：落库时收集所有 `resumecraft_snapshot_draft_*` 一并发送（待 migration 004 执行后持久化到 DB）。

### 认证与安全

- **Token 管理**：access token 存 Redis（可即时撤销），refresh token 存 Redis session。
- **限流**：Redis Lua 令牌桶，auth 接口 8 capacity / 0.2 refill，AI 接口 20 capacity / 0.05 refill。
- **Fail-Open**：Redis 不可用时默认放行（`RATE_LIMIT_FAIL_OPEN=true`）。

## 部署

### Docker（前后端一体）

```bash
docker build -t resumecraft:latest .
docker run --rm -p 8787:8787 \
  -e PG_DSN=postgres://... \
  -e AUTH_JWT_SECRET=... \
  resumecraft:latest
```

### 分离部署

- 前端：`npm run build` → 产物部署至 Nginx/Caddy，代理 API 至后端。
- 后端：Go 二进制或容器部署，监听 `:8787`。

## 文档

| 文档 | 说明 |
|------|------|
| `docs/技术文档.md` | 整体技术架构 |
| `docs/tech-translate-resume.md` | AI 翻译功能设计 |
| `docs/snapshot-diff-optimization.md` | 快照对比算法优化 |
| `docs/version-snapshot-timeline.md` | 版本快照时间轴设计 |
| `docs/ai-capability-expansion.md` | AI 能力扩展方案 |
| `docs/简历解析与导入方案.md` | 简历解析导入方案 |

## 已知限制

1. PDF 导出依赖后端 chromedp，请确保后端和 Chromium 正常运行。
2. AI 功能需要用户自行配置 OpenAI Compatible API Key（AES-256-GCM 加密存储）。
