# 实施任务清单 — enhance-application-analytics

## 后端

- [ ] `internal/model/job_application.go`：新增 `TrendPoint`（bucketStart / submitted / interview / offer / replyRate / offerRate）、`TrendResponse`、`InterviewRoundsStats`（avg / median / max / distribution[]）、`StageDurationStats`（transition / medianDays / maxDays）响应结构。
- [ ] `internal/storage/job_application/repository.go`：
  - [ ] `TrendStats(ctx, userID, bucket, from, to)`：`date_trunc(bucket, submitted_at)` 分桶 GROUP BY，统计投递数；面试数与 offer 数分别按 `job_application_interviews.scheduled_at` 与 `status='offer'` 的状态事件时间分桶（参数化查询）。
  - [ ] `InterviewRoundsStats(ctx, userID)`：per-application 面试记录计数，聚合 avg/median/max + 分布桶（1/2/3/4+）。
  - [ ] `StageDurationStats(ctx, userID)`：从 `job_application_status_events` 自连接相邻转换，`percentile_cont(0.5)` 求中位数天数。
- [ ] `internal/service/job_application/service.go`：`GetTrendStats` / `GetInterviewRoundsStats`（含 bucket/时间范围校验，默认 week + 近 3 个月）。
- [ ] `internal/handler/job_application.go`：`GetApplicationTrend`、`GetApplicationInterviewRounds`（解析 query，复用 `getUserID` 与 `handleApplicationError`）。
- [ ] `internal/router/router.go`：`GET /applications/stats/trend`、`GET /applications/stats/interview-rounds`（挂在现有 applications 分组内，鉴权中间件不变）。

## 前端

- [ ] `src/api/applications.ts`：新增 `TrendPoint`/`TrendResponse`/`InterviewRoundsResponse`/`StageDurationResponse` 类型与 `getTrend(params)`、`getInterviewRounds()` 方法。
- [ ] `src/components/applications/FunnelAnalytics.tsx`：新增 ③漏斗趋势、④面试轮次、⑤阶段停留三个卡片模块（按 ui-spec 布局），各自独立 loading/error/empty；分桶与时间范围通过 URL 参数受控。

## 测试与验证

- [ ] `internal/storage/job_application/repository_test.go`：为 3 个聚合查询补集成测试（沿用现有 repository_test 模式，构造多状态样本）。
- [ ] `internal/service/job_application/service_test.go`：校验默认参数、非法 bucket 兜底。
- [ ] `cd backend && go build ./... && go test ./internal/...` 通过。
- [ ] `npm run build`（tsc + vite）通过。
- [ ] `/browse` 实际核验：造 ≥ 4 周投递样本，确认趋势图、轮次直方图、停留时长渲染与空态。

## 成功标准

- 趋势接口在近 3 个月按周返回连续桶（无数据桶补 0），前端曲线连续无断点。
- 平均面试轮次与阶段停留中位数与手工核算一致（用测试样本对拍）。
- 原 `/stats` 与 `FunnelAnalytics` 既有内容零回归。
