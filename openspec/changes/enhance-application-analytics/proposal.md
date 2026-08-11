## Why

现有 `FunnelAnalytics` 已提供投递漏斗、KPI 与简历版本对比，但用户长期求职时缺少**时间维度**的复盘视角：无法回答"我最近三个月每周的投递/面试量是否在增长"、"平均需要多少轮面试才能拿 offer"、"哪个月份 offer 率最高"。仅有横截面快照难以支撑求职策略调整。

## What Changes

- 在 `/applications?view=analytics` 页面新增 **"漏斗趋势"** 面板：按周或月分桶展示"投递数/面试数/Offer 数"三条时序曲线，附整体回复率/Offer 率的线形叠加。
- 新增 **"平均面试轮次"** KPI 卡：统计已进入面试及以上阶段的投递记录的面试轮次均值、中位数、最长轮次；点击卡片展开轮次分布直方图。
- 新增 **"阶段停留时长"** 指标：从 `job_application_status_events` 计算相邻两状态间的中位数天数（投递→面试、面试→Offer 等），以水平条形展示。
- 后端新增 `GET /api/applications/stats/trend?bucket=week|month&from=<ts>&to=<ts>` 与 `GET /api/applications/stats/interview-rounds`；`GetFunnelStats` 现有响应保持不变，新指标以独立接口返回，前端按需加载。
- 数据来源：现有 `job_applications.submitted_at / written_test_at / created_at`、`job_application_interviews.scheduled_at`、`job_application_status_events.created_at` 均已具备，无需新增字段。

## Capabilities

### New Capabilities

- `application-analytics-trend`: 规定投递时序趋势的分桶粒度、时间范围默认值、空态与聚合规则。
- `application-analytics-interview-rounds`: 规定"平均面试轮次"和"阶段停留时长"的计算口径与展示形式。

### Modified Capabilities

- `application-funnel-stats`: 在 `FunnelStatsResponse` 之外新增独立的 trend / interview-rounds 接口，`FunnelAnalytics` 组件负责组合展示。

## Impact

- 前端：`src/components/applications/FunnelAnalytics.tsx`（增加两个卡片模块）、`src/api/applications.ts`（新增 API 客户端方法与 TS 类型）。
- 后端：`internal/handler/job_application.go`（2 个新 handler）、`internal/service/job_application/service.go`（2 个新 service 方法）、`internal/storage/job_application/repository.go`（3 个新 SQL 聚合查询）、`internal/router/router.go`（2 条新路由）、`internal/model/job_application.go`（响应 struct）。
- 数据库：无新表、无字段变更；仅新增读查询。已有索引 `idx_job_applications_user_updated` 覆盖时间范围过滤，SQL 用 `date_trunc('week'/'month', submitted_at)` 分桶。
- 兼容性：新接口独立，不影响 `/stats`；前端组件在新数据加载失败时回退到只显示原有内容。
