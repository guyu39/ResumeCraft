## Why

用户同时推进多条求职线时，笔试与面试时间分散在 `job_applications.written_test_at` 与 `job_application_interviews.scheduled_at` 两处，目前只能在投递列表里逐行翻看。首页「待办」区块虽按天分组，但仅展示最近 5 条，且**无法发现时间冲突**——两场面试撞在同一时段是求职期最高频的事故，现在系统完全不提示。

## What Changes

- `/applications` 页面在现有「投递列表 / 数据分析」两个视图之外，新增第三个视图 **「日程」**（`?view=calendar`）。
- 提供两种展示形态，可切换：
  - **月视图**：月历网格，每个日期格显示当天笔试/面试的紧凑标记（类型色点 + 公司简称），格内超过 3 条折叠为「+N」。
  - **周视图（时间轴）**：横轴为日期、纵轴为时间刻度（08:00–22:00），每场面试渲染为一个时间块，块宽按 `scheduledAt → scheduledEnd` 计算；**同一时段重叠的两个块并排显示并加红色左边框标记冲突**。
- **冲突检测**：后端在返回日程数据时标注 `conflictGroupId`，凡时间区间有重叠的事件归入同一冲突组；前端在页面顶部显示「检测到 N 处时间冲突」告警条，点击定位到第一处。
- 事件点击 → 打开现有投递详情抽屉（复用 `ApplicationsPage` 已有的详情面板），不新建详情页。
- 后端新增 `GET /api/applications/calendar?from=<ts>&to=<ts>`，一次返回区间内所有笔试与面试事件（含冲突标记），避免前端 N+1 拉取。

## Capabilities

### New Capabilities

- `application-calendar`: 规定日程视图的月/周两种形态、事件来源与合并规则、冲突检测口径与告警行为、事件点击跳转。

### Modified Capabilities

- `application-page-views`: `/applications` 视图切换由 2 项（列表 / 分析）扩展为 3 项（列表 / 日程 / 分析），URL 参数 `view=list|calendar|analytics`。

## Impact

- 前端：新增 `src/components/applications/ApplicationCalendar.tsx`（月视图 + 周视图 + 冲突告警条）；修改 `src/pages/ApplicationsPage.tsx`（视图切换 Tab 增加一项、复用详情抽屉）；`src/api/applications.ts`（新增 `getCalendar` 与类型）。
- 后端：`internal/model/job_application.go`（`CalendarEvent`、`CalendarResponse`）、`internal/storage/job_application/repository.go`（`CalendarEvents` 查询：`job_applications` 与 `job_application_interviews` 两段 UNION）、`internal/service/job_application/service.go`（`GetCalendar` + 冲突分组算法）、`internal/handler/job_application.go`、`internal/router/router.go`。
- 数据库：无新表、无字段变更。已有索引 `idx_job_application_interviews_application (application_id, scheduled_at)` 覆盖按投递取面试；按时间区间跨用户查询需新增索引 `idx_job_application_interviews_scheduled (scheduled_at)`（迁移文件仅加索引，无外键）。
- 依赖：不引入 `fullcalendar` 等重型日历库。月历网格与周时间轴用原生 CSS Grid 手写（约 200 行），避免 +300KB bundle 与主题定制成本；已有 `react-datepicker` 仅用于表单选择，不承担日程渲染。
- 冲突算法：service 层按 `scheduledAt` 排序后单次扫描（区间合并法，O(n log n)），不落库，每次请求实时计算。
- 兼容性：`view` 参数缺省仍为 `list`，旧链接行为不变。
