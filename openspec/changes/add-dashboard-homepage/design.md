## Context

`App.tsx` 使用 `pathname` 手动分发路由（`/applications`、`/jobs`、`/editor`、`/share/*`），未匹配时默认渲染 `ResumeListPage`，即 `/` 是简历列表的隐式默认页。后端已有 `JobSyncScheduler` cron 模式（`backend/internal/cron/sync_jobs.go`），招聘数据每小时同步一次。投递数据中，笔试时间为 `job_applications.written_test_at`，面试时间为 `job_applications_interviews.scheduled_at`（含 `scheduled_end`），均可作为待办数据源。

## Goals / Non-Goals

**Goals:**

- `/` 变为首页工作台，简历列表迁移到 `/resumes`，两处互不干扰、可正常跳转。
- 首页待办聚合全部投递岗位的笔试/面试时间并按天分组，点击可跳回 `/applications` 对应记录。
- 后端新增 AI 新闻与 GitHub 项目两张表及定时同步，首页按天/最新展示，接口轻量。
- 页面保持项目现有 Flat 蓝灰设计体系（`primary`/`canvas`/`surface`/`line`/`ink`/`muted` 令牌），与 `/jobs`、`/applications` 视觉一致。
- 移动端单列可用，桌面端三栏工作台布局。

**Non-Goals:**

- 不引入 React Router，继续沿用 `App.tsx` 手动 pathname 分发。
- 不改造简历编辑器 `AppShell` 的编辑逻辑，只调整其跳转目标。
- 不做新闻/GitHub 的用户订阅、收藏、评论等扩展功能。
- 不在首页展示未登录用户数据（沿用登录门禁）。
- 不引入第三方 RSS/HTTP 库与新的 UI 依赖。
- 不修改 `GET /api/applications` 现有分页与字段契约。

## Decisions

### 1. 路由迁移：`/resumes` 承接简历列表，`/` 渲染首页

`App.tsx` 增加 `isResumesPage = pathname === '/resumes'` 分支，命中时渲染 `ResumeListPage`（参数与现状完全一致）；未命中任何已知路径时渲染新 `HomePage`。`ResumeListPage` 页头把「投递管理」「招聘聚合」入口保留，新增「首页」入口。

受影响的旧入口（原指向 `/`）统一改为 `/resumes`：`JobPostingsPage` 的「我的简历」、`ApplicationsPage` 的返回按钮、`LeftPanel` 的 logo 链接；`ShareViewPage` 的「返回首页」保持指向 `/`（新首页）。

### 2. 待办：新增轻量接口 `GET /api/home/todos`

不再复用 `GET /api/applications`（分页上限会导致待办不全），新增专用接口一次返回扁平待办列表：

```json
{
  "items": [
    {
      "id": "interview-{interviewId}",       // 唯一键，前端用作 React key
      "type": "interview" | "written_test",  // 面试 / 笔试
      "applicationId": "…",
      "companyName": "…",
      "targetTitle": "…",
      "department": "…",
      "round": "一面",                        // 仅面试
      "scheduledAt": 1754300000000,
      "scheduledEnd": 1754303600000,          // 可选
      "status": "interview" | "written_test", // 应用状态，用于状态标签
      "applicationUrl": "…"                   // 可选外链
    }
  ]
}
```

数据来源：`job_applications_interviews` 中 `scheduled_at IS NOT NULL` 的记录（取 `round` 非空优先）+ `job_applications` 中 `written_test_at IS NOT NULL` 的记录。按 `scheduledAt` 升序，单用户隔离。前端按天分组（今天/明天/本周/更远），点击跳转 `/applications?focus={applicationId}` 并打开对应记录详情（`ApplicationsPage` 现有 URL 参数解析能力若不足，则保留现状仅跳转列表页，待办跳转属于增强项，见任务清单）。

### 3. AI 新闻：RSS 聚合 + 去重 + 每小时同步

- 数据表 `ai_news`：`id`(bigserial PK)、`title`、`url`（唯一索引，去重键）、`source`（媒体名）、`summary`（摘要，截断 500 字）、`published_at`、`created_at`。不使用外键（项目规范）。
- 数据源：固定源列表（OpenAI Newsroom、Anthropic News、Google DeepMind Blog、Hugging Face Blog、机器之心等官方 RSS/Atom），存于服务配置，单源解析失败跳过并记日志，不影响其他源。
- 同步：新增 `NewsSyncScheduler`（复用 `JobSyncScheduler` 模式），默认每小时执行，`NEWS_SYNC_INTERVAL` 可覆盖；`INSERT ... ON CONFLICT (url) DO NOTHING` 幂等去重。
- 接口 `GET /api/home/news?days=30&limit=50`：按 `published_at` 倒序返回，`days` 过滤近 N 天，前端按日期累加分组渲染。

### 4. GitHub 项目：Search API + 每 6 小时同步

- 数据表 `github_projects`：`id`(bigserial PK)、`full_name`（唯一索引）、`html_url`、`description`、`language`、`stars`、`forks`、`topics`(text[])、`synced_at`。不使用外键。
- 数据源：GitHub Search API `GET https://api.github.com/search/repositories?q=ai+created:>YYYY-MM-DD&sort=stars&order=desc&per_page=30`，取最近 7 天创建、star 排序的 AI 项目；公开接口限速 10 次/分钟，同步间隔 6 小时绰绰有余。需配置 User-Agent 头（GitHub API 要求）。
- 同步：新增 `GithubSyncScheduler`，默认每 6 小时执行，`GITHUB_SYNC_INTERVAL` 可覆盖，`ON CONFLICT (full_name) DO UPDATE` 刷新 star/forks 等动态字段。
- 接口 `GET /api/home/github-projects?limit=30`：按 `stars` 降序返回。

### 5. 首页布局：桌面三栏工作台，移动端单列堆叠

桌面（`>=1280px`）三栏网格：左栏「待办时间线」（占 1 份）、中栏「AI 新闻速递」（占 1.4 份）、右栏「GitHub 最新项目」（占 1 份）；`768-1279px` 两栏（待办全宽 + 新闻/GitHub 左右）；`<768px` 单列堆叠。顶部为固定导航栏（首页 / 简历 / 投递管理 / 招聘聚合 / 用户菜单）。三个区块内部各自独立滚动或随页面滚动（采用整页滚动，区块用卡片包裹，避免嵌套滚动复杂度）。

### 6. 视觉：沿用项目 Flat 蓝灰体系，不引入检索输出的紫色方案

ui-ux-pro-max 检索建议了「Predictive Analytics」风格与紫色系（`#7C3AED`）配色，但依据项目既定原则（见 `optimize-job-list-viewport-layout/ui-spec.md`：跨页一致性优先），首页继续使用现有令牌：页面底 `canvas #F6F8FB`、卡片 `surface #FFF` + `line #E2E8F0` 边框 + 16px 圆角、主文字 `ink`、次文字 `muted`、品牌色 `primary #1A56DB`。区块标题用「图标 + 标题 + 轻量统计徽标」，状态标签使用语义色（笔试/面试主色、offer 绿、rejected 红）。采纳检索中的 UX 规则：skeleton 加载态、惰性渲染、避免杂乱布局、hover 反馈 150-300ms。

## Risks / Trade-offs

- [RSS 源结构差异（Atom/RSS 2.0）] → 解析器同时兼容 `entry`/`item` 与 `updated`/`pubDate` 字段，缺字段源跳过。
- [GitHub Search API 限速 10 次/分钟] → 同步间隔 6 小时 + 单次请求，远离限速阈值；失败保留旧数据并记日志。
- [外部网络不稳定导致首页区块空] → 三个接口独立失败，前端区块级错误态 + 重试按钮，不影响其他区块。
- [路由迁移破坏历史书签/外链] → `/resumes` 为新路径，`/` 语义变为首页符合预期；`ShareViewPage` 返回链接仍指向 `/`。
- [待办与投递页数据可能短暂不一致] → 首页待办每次进入页面实时请求，无缓存；与投递页共用同一数据表，天然一致。
- [首页三栏在 768px 中间档拥挤] → 中间档降为两栏，新闻摘要与 GitHub 卡片做行截断，避免无限增高。
