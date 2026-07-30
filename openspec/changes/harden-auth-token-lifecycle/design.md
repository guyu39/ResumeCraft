## Context

ResumeCraft 当前以 JWT Access Token + 可轮换 Refresh Token 提供单设备登录。前端 `apiClient` 仅在 JSON 请求收到 401 后刷新，上传、文件导出、SSE 和解析请求各自读取 `localStorage`，因而无法共享刷新和会话终止语义。启动认证检查也会把网络错误当作会话失效。

后端 Redis 路径先读取再删除旧会话，PostgreSQL 路径先查询再更新；两个并发请求都可能通过校验。部署容器也未显式接收 `.env` 中的 Token TTL。

## Goals / Non-Goals

**Goals:**

- 前端所有常规鉴权请求共享刷新、错误分类、重试和终态退出逻辑。
- Access Token 到期前 90 秒主动刷新，页面恢复可见时重新检查。
- 同一标签页共享刷新 Promise，多标签页优先通过 `navigator.locks` 串行刷新，并通过 `BroadcastChannel`/storage 事件同步状态。
- Refresh Token 明确过期、撤销或非法时清理认证态，携带当前站内地址进入登录页；网络及 5xx 错误保留认证态。
- 后端保证同一 Refresh Token 最多成功消费一次。
- 保持现有密码、验证码、单设备二次确认和 API 响应格式兼容。

**Non-Goals:**

- 不改为 HttpOnly Cookie，不改变 JWT 签名算法和 Token 默认有效期。
- 不增加登录设备管理、多设备并存或长期离线刷新能力。
- 不在 `beforeunload`/`pagehide` 阶段等待 Token 刷新。
- 不引入新的页面、常驻保存提示或全局网络状态组件。

## Decisions

### 1. 独立 Auth Session Manager 管理 Token 生命周期

新增无 React 依赖的认证会话模块，负责 Token 读写、JWT `exp` 解码、主动刷新、跨标签页协调和终态事件。`authStore` 订阅终态事件并更新 Zustand 状态，避免请求基础设施反向依赖 Store。

刷新结果分为：

- `success`：原子替换两种 Token，广播更新并重排主动刷新计时器。
- `terminal`：Refresh 接口返回 400/401/403 且确认 Token 非法、撤销或缺失；清理 Token，广播终态并跳转登录。
- `transient`：网络异常、429、5xx 或无法确认的代理错误；保留 Token 和 Store 登录态，由后续请求/页面恢复重试。

相比在每个调用点判断 401，这一状态机能让 JSON、上传和流式请求保持一致。相比把 Store 直接导入客户端，事件边界可避免循环依赖。

### 2. 主动刷新与 401 兜底共存

Token 写入或页面初始化后，按 JWT `exp - 90s` 安排一次刷新；标签页恢复可见时再次判断。常规请求发出前若 Token 已进入刷新窗口，也会等待同一刷新任务。

请求仍保留一次 401 兜底：先识别 `SESSION_KICKED`，否则刷新并使用新 Access Token 重试一次。重试后仍为 401 时视为终态，禁止无限重试。

### 3. 多标签页优先使用 Web Locks 串行轮换

标签页内继续共享单个 Promise。支持 Web Locks 时，以固定锁名执行刷新；获得锁后重新读取 `localStorage`，若 Refresh Token 已被其他标签页替换，则直接采用新 Access Token。`BroadcastChannel` 用于通知 Token 更新和会话终止；不支持时由 `storage` 事件和服务端原子消费兜底。

不把 Token 放入广播消息，减少 Token 在额外消息通道中的暴露，标签页只从同源 `localStorage` 读取。

### 4. `authenticatedFetch` 统一传输，SSE 改用 Fetch Stream

`authenticatedFetch` 接收标准 `RequestInit`，不强制设置 `Content-Type`，从而兼容 JSON、FormData 和 Blob 响应。它负责附加 Authorization、刷新和一次重试；上层继续负责解析业务响应。

SSE 从 XHR 改为 Fetch + `ReadableStream`，复用同一鉴权入口，并保留跨分片行缓冲、AbortSignal、120 秒超时和 `event: done` 语义。只在建立流之前重试，不对已经开始消费的流做续传。

云同步卸载兜底保留原始 `fetch(..., keepalive: true)`：卸载阶段没有可靠时间完成刷新。编辑内容先写本地草稿，后续页面恢复再由正常同步链路落库。

### 5. Refresh Token 在存储层原子消费

Redis 使用 Lua 脚本在单次原子操作中读取会话、校验 user/token hash、删除旧 Session 与旧 Access Token，并移除用户会话索引。明确的不存在/不匹配返回撤销或非法；Redis 执行异常返回服务不可用，不再 fail-open 签发新 Refresh Token。

PostgreSQL 回退路径使用带 `revoked_at IS NULL`、hash 和过期条件的 `UPDATE ... RETURNING` 原子认领旧会话。只有成功更新一行的请求才能创建新会话。

先查询用户资料、再消费旧会话，减少消费成功后因用户查询失败导致必须重新登录的窗口。Redis 成功消费后新会话写入失败仍存在极小失败窗口，这是轮换安全性优先于可用性的取舍。

### 6. 终态退出复用登录页现有提示区域

会话终止时记录 `pathname + search` 为站内返回地址。被顶号使用 `reason=kicked`，普通过期使用 `reason=expired`；登录页在同一告警区域显示对应文案。临时网络错误不跳转、不弹会话失效提示。

### 7. 部署配置显式传入容器

在 `docker-compose.yml` 的认证环境变量下增加：

- `AUTH_ACCESS_TTL_MIN: "${AUTH_ACCESS_TTL_MIN:-30}"`
- `AUTH_REFRESH_TTL_MIN: "${AUTH_REFRESH_TTL_MIN:-43200}"`

保留当前默认值和现有 SMTP 配置，不修改服务器密钥管理方式。

## Risks / Trade-offs

- [旧浏览器不支持 Web Locks] → 继续使用单标签页 Promise，跨标签页最终由 BroadcastChannel/storage 同步和后端原子消费保证一致性。
- [主动刷新增加少量请求] → 每个有效期最多一次，且多标签页持锁后会复查 Token，避免重复轮换。
- [SSE 从 XHR 切换到 Fetch Stream 的浏览器差异] → 保持现有解析契约并通过构建与真实流式请求验证；项目目标浏览器需支持 `ReadableStream`。
- [Redis 原子消费后创建新会话异常] → 消费前先完成 JWT 和用户校验；失败时要求重新登录，不恢复已消费的旧 Token。
- [卸载保存时 Token 恰好过期] → 本地草稿作为事实兜底，恢复页面后通过正常鉴权和自动保存重试。

## Migration Plan

1. 先部署后端原子轮换和错误分类，再部署前端统一刷新，避免新前端遇到并发旧后端行为。
2. Compose 重建 `app` 容器，使 TTL 环境变量生效；不需要数据库结构迁移。
3. 发布后验证正常刷新、过期退出、断网恢复、被顶号和 SSE/上传/导出链路。
4. 回滚时前后端应成组回滚；TTL 配置可保留，兼容旧版本。

## Open Questions

无。主动刷新窗口固定为 90 秒，沿用 Access Token 30 分钟、Refresh Token 30 天默认值。
