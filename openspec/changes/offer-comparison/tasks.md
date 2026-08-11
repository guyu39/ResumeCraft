# 实施任务清单 — offer-comparison

## 数据库

- [ ] 新增迁移 `migrations/2026-08-13-create-job-application-offers.sql`：
  ```sql
  CREATE TABLE IF NOT EXISTS job_application_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL,
    user_id UUID NOT NULL,
    base_salary NUMERIC(12,2),
    floating_salary NUMERIC(12,2),
    equity NUMERIC(12,2),
    signing_bonus NUMERIC(12,2),
    currency VARCHAR(8) DEFAULT 'CNY',
    city VARCHAR(100),
    onboard_date DATE,
    deadline DATE,
    rating_growth SMALLINT CHECK (rating_growth BETWEEN 1 AND 5),
    rating_team SMALLINT CHECK (rating_team BETWEEN 1 AND 5),
    rating_workload SMALLINT CHECK (rating_workload BETWEEN 1 AND 5),
    rating_commute SMALLINT CHECK (rating_commute BETWEEN 1 AND 5),
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX idx_job_application_offers_app ON job_application_offers (application_id);
  CREATE INDEX idx_job_application_offers_user ON job_application_offers (user_id);
  ```
  **无外键**。application_id / user_id 由 service 层校验归属。

## 后端

- [ ] `internal/model/job_application.go`：新增 `JobApplicationOffer` struct（含全字段 json tag）、`CreateOfferRequest`、`UpdateOfferRequest`。
- [ ] `internal/storage/job_application/repository.go`：`GetOffer(ctx, appID)`、`UpsertOffer(ctx, params)`、`ListOffersByUser(ctx, userID)` — 按 application_id 唯一约束 upsert。
- [ ] `internal/service/job_application/service.go`：`GetOffer`、`UpsertOffer`（校验 application 归属 + status=offer）、`ListOffers`（返回用户全部 offer 明细列表，附 companyName/targetTitle 从 job_applications 关联）。
- [ ] `internal/handler/job_application.go`：`GetOffer` / `UpsertOffer` / `ListOffers`。
- [ ] `internal/router/router.go`：
  - `GET /applications/:id/offer` — 单条
  - `PUT /applications/:id/offer` — 创建或更新
  - `GET /applications/offers` — 当前用户全部 offer 列表

## 前端

- [ ] `src/api/applications.ts`：新增 `JobApplicationOffer` / `OfferListItem`（含 companyName/targetTitle）类型与 `getOffer(id)` / `upsertOffer(id, data)` / `listOffers()` 方法。
- [ ] 新增 `src/components/applications/OfferForm.tsx`：offer 明细表单（内嵌在投递详情抽屉 status=offer 区域），薪资 `inputmode="decimal"`，自评 1–5 星交互（可点击星星或数字）。
- [ ] 新增 `src/components/applications/OfferComparison.tsx`：
  - ① 卡片行 + ② 权重滑块 + ③ 水平条形 + ④ 雷达图(≤3) + ⑤ 明细对比表。
  - 加权评分算法纯前端（min-max 归一化 + 加权和）。
  - 权重 localStorage 持久化。
- [ ] `src/pages/ApplicationsPage.tsx`：视图切换 Tab 新增「Offer 对比」（`view=offers`），条件渲染 `OfferComparison`；详情抽屉 status=offer 时渲染 `OfferForm`。

## 测试与验证

- [ ] `internal/storage/job_application/repository_test.go`：offer upsert 幂等性 + list 返回 companyName。
- [ ] `cd backend && go build ./... && go test ./internal/...` 通过。
- [ ] `npm run build` 通过。
- [ ] `/browse` 核验：造 3 条 offer，验证对比表、权重调节实时响应、最优值高亮、有效期倒计时。

## 成功标准

- upsert 幂等：同一 application_id 多次 PUT 只有一行记录，updated_at 更新。
- 加权评分在调节权重时实时变化，推荐首位卡片正确高亮。
- 明细表最优值高亮正确（薪资越大越优，强度分高=轻松=优）。
- 未录入 offer 明细的投递在列表中显示「未录入」且不参与评分排序，但在卡片中可见并提示补全。
- 原列表/日程/分析视图零回归。
