## Why

当前 `/` 直接渲染简历列表页（`ResumeListPage`），页面只提供「简历管理」单一功能，与产品实际拥有的能力（投递管理、招聘聚合、AI 工具）不匹配，无法作为产品入口首页。

用户每天打开站点时最关心三件事：**接下来要参加哪些笔面试（待办）**、**AI 行业最新动态（全球 AI 新闻）**、**可以跟进学习的开源项目（GitHub 最新项目）**。这些信息目前分散在 `/applications` 内部，或完全没有数据源，首页没有汇聚展示，导致产品缺少「工作台」定位。

## What Changes

- 将简历列表页从 `/` 迁移到 `/resumes`，`/` 改为全新首页（工作台）。
- 新增首页三个内容区块：
  - **待办**：聚合所有投递岗位的笔试（`writtenTestAt`）与面试（`interviews[].scheduledAt`）时间，按天分组展示（今天 / 明天 / 本周 / 更远）。
  - **全球 AI 新闻速递**：后端定时聚合多个权威 AI 媒体源，按发布日期累加为时间线展示。
  - **最新 GitHub 开源项目**：后端定时同步 GitHub 最新 AI 相关开源项目，按星级/时间展示卡片列表。
- 新增首页顶部导航栏，提供「简历 /resumes」「投递管理 /applications」「招聘聚合 /jobs」「编辑器 /editor」入口与用户菜单，替代各页面零散的手写跳转按钮。
- 修复因路由迁移产生的旧入口：`/applications`、`/jobs`、编辑器 `LeftPanel` 中指向 `/` 的跳转改为指向 `/resumes` 或新首页。
- 后端新增：`ai_news` 与 `github_projects` 两张表、新闻/项目同步调度器、`GET /api/home/todos`（待办）、`GET /api/home/news`（新闻）、`GET /api/home/github-projects`（项目）三个轻量接口。

## Capabilities

### New Capabilities

- `home-dashboard`: 规定首页工作台的布局、待办/新闻/GitHub 三个区块的交互与展示规则、路由迁移与导航行为。
- `home-todos`: 规定投递笔面试待办的按天分组、状态与跳转规则。
- `ai-news-sync`: 规定 AI 新闻数据源的聚合、去重、定时同步与接口规则。
- `github-projects-sync`: 规定 GitHub 开源项目数据源的聚合、去重、定时同步与接口规则。

### Modified Capabilities

- `resume-list-route`: 简历列表页路由由 `/` 迁移至 `/resumes`，旧 `/` 由首页接管。

## Impact

- 前端页面：`src/App.tsx`（路由分发）、新增 `src/pages/HomePage.tsx`、`src/api/home.ts`；修改 `src/pages/ApplicationsPage.tsx`、`src/pages/JobPostingsPage.tsx`、`src/components/layout/LeftPanel.tsx` 中指向 `/` 的跳转；`src/components/layout/ResumeListPage.tsx` 仅调整页头导航。
- 后端：新增 `internal/model/home.go`、`internal/storage/news/repository.go`、`internal/storage/github/repository.go`、`internal/service/news/service.go`、`internal/service/github/service.go`、`internal/handler/home.go`、`internal/cron/home_sync.go`；修改 `internal/app/server.go` 注册调度器与路由。
- 数据库：新增 `migrations/2026-08-04-create-home-tables.sql`（`ai_news`、`github_projects`）。
- 依赖：新闻同步使用标准库 `encoding/xml` + `net/http`（不新增三方源）；GitHub 同步使用 `net/http` 调用公开 Search API（无需 Token，限速 10 次/分钟，同步频率足以覆盖）。前端不新增依赖。
- 兼容性：`/resumes` 为新增路由，保留 `/` 给首页；各旧页面跳转仅改目标 URL，不破坏原有逻辑。未登录用户访问 `/` 仍先进入登录页（沿用现有认证门禁）。
- 外部数据源：AI 新闻采用多个官方博客/新闻 RSS（OpenAI Newsroom、Anthropic News、Google DeepMind、Hugging Face、机器之心等），任一源失败不影响其他源；GitHub 采用 Search API 按创建时间过滤，失败时首页区块显示错误态并可重试。
