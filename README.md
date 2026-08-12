# ResumeCraft（简历大师）

一个 React + TypeScript 求职一体化平台：在线简历编辑（三栏工作台、实时 A4 预览、模块化管理、版本快照对比）+ AI 辅助优化 + 投递全流程管理（漏斗分析、日程日历、面试题库）+ 招聘信息聚合。

## 功能亮点

### 简历编辑
1. **三栏工作台**：左栏模块管理，中栏实时预览，右栏表单编辑。
2. **模块化编辑**：固定模块（个人信息、教育经历、工作/实习经历、项目经历）+ 可选模块（技能清单、自我评价、荣誉奖项、证书资质、作品集、语言能力）+ 自定义模块。
3. **拖拽排序与显隐**：模块顺序可调整，支持一键隐藏/显示。
4. **三套模板**：经典单栏、现代双栏、简约极简。
5. **样式调节**：主题色、字体、字号、边距、行距、段落间距、模块标题样式（标记线/底线/无线）。
6. **富文本能力**：Tiptap 富文本编辑器，支持加粗/斜体/下划线/链接/列表，链接使用应用内弹窗。
7. **字体编码检测**：粘贴时提示异常字符，支持自动修复。
8. **A4 分页预览**：按页切片展示，自适应缩放，减少内容截断。
9. **中英文国际化**：一键切换中英文简历，AI 翻译模块自动生成英文副本。
10. **简历解析导入**：上传 PDF/Word 文件，AI 自动识别填充。

### 数据同步与版本
11. **本地自动保存**：Zustand + localStorage 防抖持久化（150ms），刷新后可恢复。
12. **云端同步**：revision 驱动的串行保存队列 + 后端乐观锁（version CAS）+ 指数退避重试，详见[核心机制](#云端同步)。
13. **版本快照**：手动创建命名快照记录简历状态，快照时间轴可视化；`resume_versions.content_snapshot` 为快照正文唯一权威源。
14. **快照对比**：选择两个快照逐模块逐字段比较，Git 风格统一 diff（+ 新增 / − 删除），支持递归比较 items 数组内的字段差异。

### AI 能力
15. **AI 辅助**：简历评估（含报告 PDF 导出）、内容润色建议、JD 匹配分析与 JD 定向优化、整模块/要点改写、模拟面试（出题 + 答题 + 多轮追问 + 逐题评估）、简历翻译。
16. **PDF 导出**：简历导出走后端 chromedp 异步任务（创建 → 轮询 → 下载）；AI 评估报告走前端 html2canvas + jsPDF 动态加载生成。

### 投递管理
17. **投递记录**：按公司/岗位管理投递全流程，状态机涵盖待适配 → 已适配 → 已投递 → 笔试 → 面试 → Offer/被拒/撤回，支持意向城市、JD 存档、去重检测与 Excel 导出。
18. **面试记录**：按轮次（一面/二面/三面/主管面/HR面）记录时间、形式、面试官、问题、笔记与结果，支持录音上传 + AI 转写分析。
19. **漏斗分析**：投递 → 笔试 → 面试 → Offer 各阶段转化率，简历版本 A/B 对比，按周/月分桶的趋势图，面试轮次分布与阶段停留时长（中位数/最大值）。
20. **日程日历**：月/周视图展示笔试与面试安排，冲突日标红、正常安排标蓝，显示开始时间与轮次标签。
21. **面试题库**：跨投递聚合自己记录过的面试问题，支持关键词/公司/轮次/时间筛选，命中高亮，仅本人可见。

### 其他
22. **首页工作台**：AI 日报、GitHub 热门项目、AI HOT 榜、最近新增岗位（Redis 列表）、待办笔面试（过滤历史、显示相对日期）。
23. **招聘聚合**：定时同步外部招聘信息，支持标记已投递、按投递状态筛选。
24. **认证与安全**：JWT + Redis token 即时撤销 + 单设备登录（两阶段确认顶号）+ 令牌桶限流 + bcrypt 密码哈希 + SQL 操作审计日志。
25. **简历分享与评论**：生成分享链接，访客可逐模块评论；评论跨快照保留、访客仅能删除自己的评论。
## 访问地址：https://honoz.top/
## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript 5 + Vite 5 |
| 状态管理 | Zustand（localStorage 持久化 + revision 版本追踪 + 同步状态机） |
| 样式 | Tailwind CSS（语义化色板 token） |
| 拖拽 | @dnd-kit |
| 富文本 | Tiptap |
| 图表 | Recharts |
| 后端框架 | Go (Gin) |
| 数据库 | PostgreSQL（无外键，引用完整性由应用层校验）+ Redis（认证/限流/热点列表） |
| 并发控制 | 乐观锁（version CAS，409 冲突自动仲裁） |
| PDF 渲染 | chromedp (Chromium) |
| 对象存储 | MinIO (S3 兼容) |
| 数据安全 | DOMPurify（HTML 净化）、AES-256-GCM（AI 密钥加密） |
| AI | OpenAI Compatible API（流式 SSE） |
| 限流 | Redis Lua 令牌桶（auth/ai 分别限流，Fail-Open 策略） |
| 定时任务 | Go cron（招聘同步/AI 日报/GitHub 项目/AI HOT） |

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
│   │   ├── ai.ts                 # AI 接口（评估/匹配/改写/翻译/面试等）
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
│   │   │   └── ai/               # AI 面板组件（评估/匹配/改写/面试/评分）
│   │   ├── resume/               # 简历模块编辑表单（11个模块）
│   │   ├── resume/blocks/        # 模块表单子组件
│   │   ├── applications/         # 投递管理组件
│   │   │   ├── FunnelAnalytics.tsx      # 漏斗/趋势/轮次分析
│   │   │   ├── ApplicationCalendar.tsx  # 日程日历（月/周视图 + 冲突标色）
│   │   │   └── InterviewBankPanel.tsx   # 面试题库（检索/筛选/高亮）
│   │   ├── home/                 # 首页工作台组件（资讯面板/待办/新增岗位）
│   │   └── common/               # 通用组件（SnapshotTimeline、StyledSelect、主题色等）
│   ├── pages/
│   │   ├── ApplicationsPage.tsx  # 投递管理页（列表/日程/分析/题库 四视图）
│   │   ├── JobPostingsPage.tsx   # 招聘聚合页
│   │   └── HomePage.tsx          # 首页工作台
│   ├── hooks/                    # 自定义 Hook
│   │   ├── useCloudSync.ts       # 云端同步（revision 驱动 + 串行队列 + 乐观锁）
│   │   ├── useExportPDF.ts       # PDF 导出（异步任务轮询）
│   │   ├── useI18n.ts            # 国际化翻译
│   │   ├── useTranslate.ts       # AI 翻译流程
│   │   └── ...                   # AI 功能 Hooks（评估/匹配/改写/面试等）
│   ├── store/
│   │   ├── authStore.ts          # 认证状态
│   │   └── resumeStore.ts        # 简历状态（revision 追踪 + 同步状态机）
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

### 投递管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/applications | 投递列表（分页/筛选/排序） |
| POST | /api/applications | 创建投递 |
| GET | /api/applications/export | 导出 Excel |
| POST | /api/applications/duplicates | 去重检测 |
| GET | /api/applications/stats | 漏斗统计 + 简历版本 A/B 对比 |
| GET | /api/applications/stats/trend | 分桶趋势（周/月） |
| GET | /api/applications/stats/interview-rounds | 面试轮次分布 + 阶段停留时长 |
| GET | /api/applications/calendar | 日程日历事件 + 冲突检测 |
| GET | /api/applications/interviews/bank | 面试题库（关键词/公司/轮次/时间筛选） |
| GET | /api/applications/:id | 投递详情 |
| PUT | /api/applications/:id | 更新投递 |
| DELETE | /api/applications/:id | 删除投递 |
| PUT | /api/applications/:id/status | 变更投递状态 |
| POST | /api/applications/:id/interviews | 新增面试记录 |
| PUT | /api/applications/:id/interviews/:iid | 更新面试记录 |
| DELETE | /api/applications/:id/interviews/:iid | 删除面试记录 |
| POST | /api/applications/:id/interviews/:iid/recording | 上传面试录音 |
| POST | /api/applications/:id/interviews/analyze-file | AI 面试记录文件分析 |

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

### 分享与评论

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/resumes/:id/share | 创建分享链接 |
| GET | /api/resumes/:id/shares | 分享链接列表 |
| DELETE | /api/resumes/:id/shares/:shareId | 关闭分享链接 |
| GET | /api/share/:token | 访客查看分享简历 |
| GET/POST | /api/share/:token/comments | 访客评论列表/新增 |
| DELETE | /api/share/:token/comments/:commentId | 删除自己的评论（校验访客归属） |
| GET | /api/resumes/:id/comments | 简历所有者查看全部评论 |

### AI 功能

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | /api/ai/config | 获取/保存 AI 配置 |
| GET/POST | /api/ai/parser-config | 获取/保存简历解析配置 |
| POST | /api/ai/evaluate/stream | 简历评估（SSE 流式） |
| POST | /api/ai/jd-match/stream | JD 匹配分析（SSE 流式） |
| POST | /api/ai/score | JD 评分 |
| POST | /api/ai/jd-optimize | JD 定向优化（生成优化版简历快照） |
| POST | /api/ai/rewrite/bullet | 要点改写 |
| POST | /api/ai/rewrite/module | 整模块内容改写 |
| POST | /api/ai/suggest | 内容润色建议 |
| POST | /api/ai/translate | 简历翻译 |
| POST | /api/ai/interview/generate | 生成面试题（SSE 流式） |
| POST | /api/ai/interview/evaluate | 答题评估（SSE 流式） |
| POST | /api/ai/interview/followup | 面试追问 |
| POST | /api/ai/interview/analyze-transcript | 面试录音转写分析（SSE 流式） |
| GET | /api/ai/interview/sessions | 面试历史列表（按简历隔离） |
| GET/DELETE | /api/ai/interview/sessions/:id | 面试会话详情/删除 |
| GET | /api/ai/conversations | AI 对话列表 |
| GET | /api/ai/conversations/:id | 获取对话详情 |
| DELETE | /api/ai/conversations/:id | 删除对话 |
| GET/POST | /api/ai/suggest-records | 润色记录列表/保存 |

## 核心机制说明

### 快照版本管理

- **快照创建**：手动点击「新建版本」将当前编辑器状态固化为一个命名快照（存入 `resume_versions` 表）。
- **正文权威**：`resume_versions.content_snapshot` 为快照正文唯一数据源；`resumes.content` 为镜像双写。
- **对比算法**：后端按 `module.id` 匹配模块 → 递归 `items` 数组 → 逐字段 `fieldToString` 比较 → 返回 `FieldDiff[]`。

### 云端同步

同步链路历经 9 次迭代，最终收敛为：

| 维度 | 方案 |
|------|------|
| 落库触发 | `localRevision > ackedRevision` 时 150ms debounce 自动保存；`focusout` / `visibilitychange` / `beforeunload` 立即保存 |
| 串行保证 | 单请求飞行 + pending 队列 + waiter Promise，杜绝并发 PUT |
| 并发保护 | 后端 CAS 乐观锁（`WHERE version = $N`），不匹配返回 409 |
| 冲突策略 | 单设备策略：内容一致 → 静默对齐版本号；内容分歧 → 自动 keepLocal 重试 |
| 内容指纹 | `normalizeForHash()` 深度稳定键序 + JSON 指纹，消除字段顺序/默认值差异导致的假冲突 |
| 断网恢复 | 指数退避重试 [1s, 3s, 10s] + `online` 事件重置 + offline 状态展示 |
| 退出兜底 | `fetch + keepalive` 能带鉴权头 |

### 认证与安全

- **Token 管理**：JWT access/refresh 双 token + Redis 存储（即时撤销）；Web Locks + BroadcastChannel 跨标签原子刷新。
- **单设备登录**：新设备登录触发两阶段确认，确认后才踢旧设备。
- **限流**：Redis Lua 令牌桶，auth 接口 8 capacity / 0.2 refill，AI 接口 20 capacity / 0.05 refill。
- **Fail-Open**：Redis 不可用时默认放行（`RATE_LIMIT_FAIL_OPEN=true`）。
- **审计**：SQL 操作审计日志（`operation_audit_logs` 表）。

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
| `docs/ai-extension-plan.md` | AI 能力延伸实现方案（报告导出/整模块改写/面试追问/JD优化） |
| `docs/jd-optimize-plan.md` | JD 定向优化生成优化快照方案 |
| `docs/简历解析与导入方案.md` | 简历解析导入方案 |

## 已知限制

1. PDF 导出依赖后端 chromedp，请确保后端和 Chromium 正常运行。
2. AI 功能需要用户自行配置 OpenAI Compatible API Key（AES-256-GCM 加密存储）。
