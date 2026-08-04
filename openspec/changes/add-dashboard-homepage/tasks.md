## 1. 数据库迁移

- [x] 1.1 编写 `migrations/2026-08-04-create-home-tables.sql`，创建 `ai_news` 表（`url` 唯一索引，无外键）
- [x] 1.2 同一迁移中创建 `github_projects` 表（`full_name` 唯一索引，无外键）
- [ ] 1.3 在本地数据库执行迁移并验证两张表结构（本机无 psql/Docker，由后端启动自动迁移 `migrate.RunMigrations` 在部署时应用）

## 2. 后端：待办接口

- [x] 2.1 定义 `internal/model/home.go`：`TodoItem`、`AiNewsItem`、`GithubProjectItem` 模型
- [x] 2.2 实现 `internal/storage/home/repository.go` 待办查询（面试 `scheduled_at` + 笔试 `written_test_at`，按时间升序合并）
- [x] 2.3 实现 `internal/handler/home.go` 的 `GET /api/home/todos`，单用户隔离
- [x] 2.4 注册路由（`router.go` `/home` 组，挂认证）

## 3. 后端：AI 新闻同步

- [x] 3.1 实现 `internal/storage/news/repository.go`（`Upsert` 用 `ON CONFLICT (url) DO NOTHING`、`ListRecent`）
- [x] 3.2 实现 `internal/service/home/service.go`：RSS/Atom 解析（兼容 `entry/item`、`updated/pubDate`）、固定源列表、单源失败隔离、摘要截断
- [x] 3.3 实现 `internal/cron/home_sync.go` 中 `NewsSyncScheduler`（默认每小时，`NEWS_SYNC_INTERVAL` 可覆盖，启动立即执行一次）
- [x] 3.4 在 `internal/app/server.go` 注册调度器与 `GET /api/home/news?days=&limit=` 路由
- [x] 3.5 补充同步与解析的 Go 测试（`service_test.go`：时间解析 / RSS / Atom / 摘要工具）

## 4. 后端：GitHub 项目同步

- [x] 4.1 实现 `internal/storage/github/repository.go`（`Upsert` 用 `ON CONFLICT (full_name) DO UPDATE` 刷新 star/forks、`ListTop`）
- [x] 4.2 实现 `internal/service/home/service.go`：Search API 调用（User-Agent 头、最近 7 天、star 排序、per_page=30）
- [x] 4.3 实现 `GithubSyncScheduler`（默认每 6 小时，`GITHUB_SYNC_INTERVAL` 可覆盖）
- [x] 4.4 注册 `GET /api/home/github-projects?limit=` 路由
- [x] 4.5 补充同步测试（mock HTTP：成功解析 + 403 错误路径）

## 5. 前端：路由迁移与导航

- [x] 5.1 `src/App.tsx` 增加 `isResumesPage` 分支渲染 `ResumeListPage`，未匹配路径渲染新 `HomePage`
- [x] 5.2 将 `ApplicationsPage`、`JobPostingsPage`、`LeftPanel` 中指向 `/` 的跳转改为 `/resumes`
- [x] 5.3 `ResumeListPage` 页头新增「首页」入口，保留投递管理/招聘聚合入口

## 6. 前端：首页工作台

- [x] 6.1 实现 `src/api/home.ts`（todos/news/github-projects 三个接口封装）
- [x] 6.2 实现 `src/components/home/HomeHeader.tsx` 顶部导航（首页 / 简历 / 投递管理 / 招聘聚合 / 用户菜单）
- [x] 6.3 实现 `src/components/home/TodoTimeline.tsx`：按天分组（今天/明天/本周/更远）、笔试/面试类型徽标、时间、公司/岗位/轮次、跳转投递管理（`/applications?id=`）
- [x] 6.4 实现 `src/components/home/AiNewsFeed.tsx`：按发布日期分组的时间线，标题 + 来源 + 相对时间，点击新窗口打开原文，默认展开最近 2 天
- [x] 6.5 实现 `src/components/home/GithubProjects.tsx`：仓库卡片列表（名称、描述、语言、star、forks、更新距今天数）
- [x] 6.6 实现 `src/pages/HomePage.tsx` 组装三区块，桌面三栏 / 平板两栏 / 移动单列响应式，含 skeleton、空态、错误态与重试

## 7. 验证

- [x] 7.1 前端 `npm run build`（tsc + vite）通过；后端 `go build ./...` 与 `go test ./...` 因本机无 Go/Docker 工具链无法执行（需部署环境验证）
- [ ] 7.2 `/resumes` 正常展示简历列表并可创建/编辑/删除/重命名（需后端环境核验）
- [ ] 7.3 首页三区块数据正确：待办按天分组、新闻按天累加、GitHub 按 star 排序（需后端环境核验）
- [ ] 7.4 桌面 1440px / 平板 1024px / 移动 375px 布局无重叠，导航跳转正确（需浏览器核验）
- [ ] 7.5 通过 `/browse` 核验首页实际效果与 `ui-spec.md` 一致（本会话无浏览器工具，待部署后核验）
