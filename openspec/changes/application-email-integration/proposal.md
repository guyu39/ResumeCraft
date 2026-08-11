## Why

面试邀请几乎都通过邮件送达，用户需要手动阅读邮件、提取时间/地点/联系方式，再回到系统手工建面试记录——重复、易错、易漏。若能让系统读取邮箱、自动识别面试邀请邮件并结构化提取关键信息生成日程草稿，可显著减少录入成本，并与「投递日历视图」形成闭环。

> **注意（安全前置）**：本变更涉及外部行为——读取用户邮箱（IMAP）与调用 AI 解析邮件正文。依据仓库安全护栏，接入真实邮箱、发送/拉取邮件等操作在实现与联调阶段必须先获用户明确授权，且凭证仅以加密形式存储、不硬编码、不入日志。

## What Changes

- 新增**邮箱连接配置**：用户在设置中填写 IMAP 服务器 / 端口 / 账号 / 授权码（应用专用密码），后端用 AES-256-GCM 加密存储（复用现有 `ai_configs` 的加密方案）。仅支持授权码/应用密码，不接受主密码，不做 OAuth（一期）。
- 新增**面试邮件识别**：后台定时任务（或用户手动「立即同步」）按 IMAP 拉取近 N 天未处理邮件，先用规则（关键词：面试/笔试/邀约/interview/assessment + 发件域名）粗筛，再对候选邮件调用系统 AI 做结构化抽取（公司、职位、面试轮次、时间、地点/会议链接、联系人、联系方式）。
- 抽取结果生成 **「日程草稿」**，在专门的收件箱式列表中展示；用户确认后一键：匹配到已有投递（按公司名模糊匹配）或新建投递，并写入 `job_application_interviews`（与日历视图打通）。**默认不自动写入，必须用户确认**，避免 AI 误识别污染数据。
- 未匹配到投递的草稿允许「忽略」或「新建投递并关联」。

## Capabilities

### New Capabilities

- `email-account-config`: 规定 IMAP 邮箱凭证的录入、加密存储、连接测试与解绑规则。
- `email-interview-detection`: 规定邮件拉取范围、规则粗筛 + AI 抽取的两段式识别流程、去重与失败降级。
- `email-draft-confirmation`: 规定日程草稿的展示、投递匹配、用户确认后写入面试记录的流程，以及"绝不自动写库"的安全约束。

## Impact

- 前端：新增 `src/components/applications/EmailInbox.tsx`（草稿收件箱）、`src/components/layout/EmailAccountDialog.tsx`（邮箱配置与连接测试）；`/applications` 新增入口按钮或视图 `?view=inbox`；`src/api/` 新增 `emailIntegration.ts`。
- 后端：新增 `internal/model/email.go`、`internal/storage/email/repository.go`（`email_accounts`、`email_interview_drafts` 两表）、`internal/service/email/service.go`（IMAP 拉取 + 规则粗筛 + AI 抽取 + 草稿生成 + 确认写入）、`internal/handler/email.go`、`internal/cron/email_sync.go`、`internal/router/router.go`、`internal/app/server.go`（注册调度器与路由）。
- 数据库：新增 `migrations/2026-08-14-create-email-tables.sql`：
  - `email_accounts`（user_id / imap_host / imap_port / email / encrypted_password / last_synced_at / enabled）
  - `email_interview_drafts`（user_id / message_uid / from_addr / subject / raw_snippet / extracted json / matched_application_id / status[pending|confirmed|ignored] / created_at）。**无外键**。
- 依赖：新增 Go 依赖 `github.com/emersion/go-imap/v2`（活跃维护的 IMAP 客户端，pin 具体版本）；AI 抽取复用现有 AI provider，不新增 AI 依赖；前端无新增依赖。
- 安全：
  - 邮箱授权码 AES-256-GCM 加密（密钥来自环境变量，复用现有加密工具），接口不回传明文、日志脱敏。
  - IMAP 连接强制 TLS。
  - 「绝不自动写库」：AI 抽取仅生成草稿，任何面试记录写入都需用户显式确认。
  - 一期不支持 OAuth，明确文档标注仅授权码模式；主流邮箱（Gmail/Outlook/163/QQ）需用户自行开通应用专用密码。
- 兼容性：未配置邮箱的用户完全不受影响；调度器仅对已启用邮箱的用户运行。
- 复杂度提示：本变更为四项中最重，建议独立排期，且必须先在测试邮箱上完成端到端验证再开放。
