## Why

当前认证链路主要依赖请求收到 401 后被动刷新，且部分上传、导出、SSE 与页面恢复请求绕过统一刷新逻辑。Refresh Token 失效、临时网络故障及并发轮换之间缺少一致语义，可能造成误登出、请求失败或同一 Token 被并发消费。

## What Changes

- 建立统一的前端认证会话管理器，区分会话终态失效与可恢复的网络/服务异常。
- 在 Access Token 到期前主动刷新，同时保留 401 后刷新并重试一次的兜底行为。
- 使用浏览器跨标签页协调能力，避免多个标签页同时轮换同一个 Refresh Token。
- 提供统一 `authenticatedFetch`，覆盖 JSON、FormData、Blob、上传、导出和 SSE 请求。
- 会话终态失效时统一清理认证状态，保留当前页面地址并跳转登录；临时网络故障不清理登录态。
- 后端以原子操作消费 Refresh Token，确保同一旧 Token 只能成功轮换一次。
- 显式将 Access/Refresh Token TTL 配置传入部署容器，并补充过期、撤销、并发轮换测试。

## Capabilities

### New Capabilities

- `auth-token-lifecycle`: 定义 Access/Refresh Token 的主动刷新、失败分类、跨标签页协调、统一鉴权传输、终态退出和后端原子轮换行为。

### Modified Capabilities

无。

## Impact

- 前端：`src/api` 请求基础设施、认证 Store、应用生命周期监听，以及现有上传、导出、解析、SSE 和云同步调用点。
- 后端：认证 Service 的 Refresh Token Redis/PostgreSQL 消费逻辑及相关测试。
- 部署：`docker-compose.yml` 显式映射认证 TTL 环境变量。
- API 路径和现有登录方式保持兼容；Refresh 成功响应继续返回轮换后的 Access/Refresh Token。
