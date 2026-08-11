# 实施任务清单 — application-calendar-view

## 数据库

- [ ] 新增迁移 `migrations/2026-08-12-add-interview-scheduled-index.sql`：`CREATE INDEX IF NOT EXISTS idx_job_application_interviews_scheduled ON job_application_interviews (scheduled_at)`。无外键。

## 后端

- [ ] `internal/model/job_application.go`：新增 `CalendarEvent`（id / applicationId / companyName / targetTitle / eventType[writtenTest|interview] / round / scheduledAt / scheduledEnd / conflictGroupId）、`CalendarResponse`（events[] / conflicts int）。
- [ ] `internal/storage/job_application/repository.go`：`CalendarEvents(ctx, userID, from, to)`：
  - UNION：`SELECT ... FROM job_applications WHERE written_test_at BETWEEN $from AND $to` 
  - UNION `SELECT ... FROM job_application_interviews i JOIN job_applications a ON a.id=i.application_id WHERE a.user_id=$1 AND i.scheduled_at BETWEEN $2 AND $3`。
  - 按 `scheduledAt` ASC 排序返回。
- [ ] `internal/service/job_application/service.go`：`GetCalendar(ctx, userID, from, to)`：
  - 调用 repository 取事件。
  - 冲突检测：按 scheduledAt 排序后，扫描每对相邻事件，若 A.scheduledEnd > B.scheduledAt 则归入同一冲突组（递增 conflictGroupId）。无 scheduledEnd 时按 startTime+1h 兜底。
  - 返回 `CalendarResponse`。
- [ ] `internal/handler/job_application.go`：`GetApplicationCalendar`（解析 from/to query params，默认当前月 ±7 天）。
- [ ] `internal/router/router.go`：`GET /applications/calendar`。

## 前端

- [ ] `src/api/applications.ts`：新增 `CalendarEvent` / `CalendarResponse` 类型与 `getCalendar(from, to)` 方法。
- [ ] 新增 `src/components/applications/ApplicationCalendar.tsx`：
  - 月视图（CSS Grid 7x6）+ 周视图（时间轴 Grid）。
  - 冲突告警条。
  - 工具栏（前后导航/今天/月周切换）。
  - 事件块点击 → emit 事件 ID → `ApplicationsPage` 打开详情抽屉。
  - URL 参数同步：mode / date。
- [ ] `src/pages/ApplicationsPage.tsx`：视图切换 Tab 新增「日程」（`view=calendar`），条件渲染 `ApplicationCalendar`。

## 测试与验证

- [ ] `internal/service/job_application/service_test.go`：冲突算法单测（无冲突/两两冲突/三场连环冲突/无 scheduledEnd 兜底）。
- [ ] `cd backend && go build ./... && go test ./internal/...` 通过。
- [ ] `npm run build` 通过。
- [ ] `/browse` 核验：造 5 条投递含面试，其中 2 条时间重叠，验证冲突告警与并排渲染。

## 成功标准

- 月视图每格正确展示事件色点，超 3 条折叠。
- 周视图时间块高度与实际时长匹配，冲突块并排且红色左边框。
- 冲突告警条正确计数，「定位冲突」按钮滚动生效。
- URL 可直接分享跳转到指定日期与视图模式。
- 原「列表」和「数据分析」视图零回归。
