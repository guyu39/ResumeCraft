# 实施任务清单 — application-email-integration

## 数据库

- [ ] 新增迁移 `migrations/2026-08-14-create-email-tables.sql`：
  - `email_accounts`：user_id UUID NOT NULL UNIQUE, imap_host VARCHAR(255), imap_port INT DEFAULT 993, email VARCHAR(320), encrypted_password BYTEA, last_synced_at TIMESTAMPTZ, enabled BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()。
  - `email_interview_drafts`：id UUID PK DEFAULT gen_random_uuid(), user_id UUID NOT NULL, message_uid VARCHAR(255) NOT NULL, from_addr VARCHAR(320), subject VARCHAR(500), raw_snippet TEXT DEFAULT '', extracted JSONB DEFAULT '{}', matched_application_id UUID, status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','confirmed','ignored')), created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()。
  - 唯一索引 `(user_id, message_uid)` 防重复导入。
  - **无外键**。

## 后端

- [ ] `internal/model/email.go`：`EmailAccount`、`EmailInterviewDraft`（含 Extracted struct: company / position / round / scheduledAt / scheduledEnd / location / meetingLink / contact / contactInfo）、`CreateEmailAccountRequest`、`UpdateEmailAccountRequest`、`TestConnectionResponse`、`ConfirmDraftRequest`。
- [ ] `internal/storage/email/repository.go`：
  - `GetAccount(ctx, userID)` / `UpsertAccount(ctx, params)` / `DeleteAccount(ctx, userID)`
  - `ListDrafts(ctx, userID, status)` / `GetDraft(ctx, userID, draftID)` / `UpsertDraft(ctx, params)` / `UpdateDraftStatus(ctx, userID, draftID, status)`
  - AES 加密/解密 password 沿用 `internal/storage/ai/` 的 `encrypt/decrypt` 工具方法。
- [ ] `internal/service/email/service.go`：
  - `TestConnection(ctx, userID, host, port, email, password)` — 临时 IMAP 连接 + SELECT INBOX + LOGOUT。
  - `SaveAccount(ctx, userID, req)` — 加密存储。
  - `SyncMail(ctx, userID)` — IMAP 拉取近 7 天 UNSEEN，规则粗筛，AI 抽取（复用 AIService.Complete），生成草稿（upsert by message_uid 去重）。
  - `ConfirmDraft(ctx, userID, draftID, applicationID)` — 匹配/新建投递 → 创建 `job_application_interviews` → 草稿状态设 confirmed。
  - `IgnoreDraft(ctx, userID, draftID)` — 草稿状态设 ignored。
  - `DeleteAccount(ctx, userID)` — 删凭证 + 删全部草稿（需用户二次确认后调用）。
- [ ] `internal/handler/email.go`：`TestConnection` / `SaveAccount` / `GetAccount`（不返回明文密码）/ `DeleteAccount` / `SyncNow` / `ListDrafts` / `ConfirmDraft` / `IgnoreDraft`。
- [ ] `internal/router/router.go`：注册 `/api/email/account`（GET/PUT/DELETE）、`/api/email/test-connection`（POST）、`/api/email/sync`（POST）、`/api/email/drafts`（GET）、`/api/email/drafts/:id/confirm`（POST）、`/api/email/drafts/:id/ignore`（POST）。
- [ ] `internal/cron/email_sync.go`：`EmailSyncScheduler`（默认 30 分钟，仅对 enabled=true 的账户运行）。
- [ ] `internal/app/server.go`：注册 `EmailService` + `EmailSyncScheduler` + 路由。
- [ ] `go.mod`：新增 `github.com/emersion/go-imap/v2`（pin 指定版本）。

## 前端

- [ ] `src/api/emailIntegration.ts`：类型定义 + API 方法（testConnection / saveAccount / getAccount / deleteAccount / syncNow / listDrafts / confirmDraft / ignoreDraft）。
- [ ] 新增 `src/components/layout/EmailAccountDialog.tsx`：配置弹窗（表单 + 测试连接 + 预设按钮 + 解绑）。
- [ ] 新增 `src/components/applications/EmailInbox.tsx`：草稿收件箱（左右二栏/移动端 push 导航 + 详情面板 + 确认/忽略操作）。
- [ ] `src/pages/ApplicationsPage.tsx`：视图切换 Tab 新增「收件箱」（仅邮箱已启用时显示）。
- [ ] 设置面板（`SettingsPanel.tsx`）入口：「邮箱集成」按钮。

## 测试与验证

- [ ] `internal/service/email/service_test.go`：
  - AI 抽取 prompt 构造验证。
  - ConfirmDraft 幂等性（重复确认同一草稿不重复创建面试记录）。
  - message_uid 去重：同一 UID 重复 sync 不新增草稿。
- [ ] `cd backend && go build ./... && go test ./internal/...` 通过。
- [ ] `npm run build` 通过。
- [ ] 端到端验证（需在**测试邮箱**上手动执行）：
  - [ ] 绑定测试邮箱 → 测试连接成功 → 保存。
  - [ ] 向测试邮箱发一封模拟面试邀请 → 立即同步 → 草稿出现。
  - [ ] 确认草稿 → 面试记录出现在投递详情 + 日历视图中。
  - [ ] 忽略草稿 → 不影响投递数据。

## 成功标准

- 授权码始终加密存储，API 不回传明文，日志脱敏验证通过。
- IMAP 连接强制 TLS（非 TLS 连接报明确错误）。
- 自动识别准确率在 10 封测试邮件上 ≥ 80%（含中英文邮件样本）。
- 绝不自动写库：无用户点击「确认」时，`job_application_interviews` 无新增行。
- 未配置邮箱的用户看不到收件箱 Tab，整体零影响。
- 原列表/日程/分析/Offer 视图零回归。
