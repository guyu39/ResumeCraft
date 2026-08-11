## Why

拿到多个 offer 是求职的高光时刻，也是最纠结的决策点。目前系统在 `status=offer` 后只是把投递记录标记为一个终态色块，**不承载任何 offer 明细**（薪资、城市、发展空间等），用户只能另开表格或凭记忆横向比较。缺少结构化的 offer 数据，也让「统计分析」里的 offer 率停留在计数层面，无法反映 offer 质量。

## What Changes

- 为 `status=offer` 的投递记录新增**结构化 offer 详情**：薪资（base / 浮动 / 股票 / 签字费）、地点城市、到岗时间、offer 有效期（deadline）、发展维度自评（成长空间 / 团队 / 工作强度 / 通勤，1–5 星）、备注。
- `/applications` 新增 **「Offer 对比」** 视图（`?view=offers`）：
  - 所有 offer 以卡片列表 + **横向对比表**两种形态展示。
  - 对比表：行=维度（薪资构成、城市、到岗、各项自评…），列=各 offer，最优值高亮 `emerald`。
  - **加权评分**：用户可为各维度设权重（滑块），系统按归一化后加权算综合分并排序推荐，帮助决策。
  - offer 有效期临近（≤3 天）在卡片上显示红色倒计时角标。
- offer 详情在投递详情抽屉内编辑（`status` 变为 offer 时展开 offer 表单区）。
- 后端新增 `job_application_offers` 表（一对一挂 `job_applications`，逻辑外键，无 FK 约束），及 offer 的增改查接口。

## Capabilities

### New Capabilities

- `application-offer-detail`: 规定 offer 结构化字段、录入时机（status=offer 时）、有效期倒计时规则。
- `application-offer-comparison`: 规定 offer 对比表、加权评分算法、最优值高亮与排序推荐。

### Modified Capabilities

- `application-page-views`: 视图切换增加 `offers` 项（列表 / 日程 / 分析 / Offer 对比）。
- `application-detail-drawer`: 投递详情抽屉在 offer 状态下展开 offer 明细表单。

## Impact

- 前端：新增 `src/components/applications/OfferComparison.tsx`（卡片 + 对比表 + 权重滑块）、`src/components/applications/OfferForm.tsx`（详情抽屉内嵌表单）；修改 `src/pages/ApplicationsPage.tsx`、`src/api/applications.ts`。
- 后端：`internal/model/job_application.go`（`JobApplicationOffer` 及请求体）、新增 `internal/storage/job_application` 中 offer 相关查询、`internal/service/job_application/service.go`（offer CRUD + 加权评分可放前端，后端仅存明细）、`internal/handler/job_application.go`、`internal/router/router.go`。
- 数据库：新增 `migrations/2026-08-13-create-job-application-offers.sql`（`job_application_offers`：application_id / user_id / base_salary / floating_salary / equity / signing_bonus / currency / city / onboard_date / deadline / rating_growth / rating_team / rating_workload / rating_commute / note / created_at / updated_at）。**无外键**，application_id 与 user_id 归属由 service 层校验。
- 加权评分：算法在**前端**实现（纯展示计算，权重是 UI 交互态，不落库），后端只负责存取 offer 明细，符合最小侵入。
- 薪资隐私：offer 薪资属敏感信息，接口仅返回给本人（沿用 `getUserID` 鉴权）；日志不打印薪资字段。
- 兼容性：offer 明细为可选，未填写的 offer 投递在对比表中显示"未录入"，不影响既有 offer 状态流转。
