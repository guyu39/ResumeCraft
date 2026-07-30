## ADDED Requirements

### Requirement: Access Token 主动刷新
系统 MUST 在 Access Token 到期前 90 秒触发 Refresh Token 轮换，并在页面恢复可见或鉴权请求发出前重新检查是否需要刷新。

#### Scenario: 到期前自动轮换
- **WHEN** 已登录用户的 Access Token 进入到期前 90 秒窗口
- **THEN** 前端发起一次刷新并原子替换本地 Access Token 与 Refresh Token

#### Scenario: 页面恢复时补充检查
- **WHEN** 已登录页面从后台恢复可见且 Token 已进入刷新窗口
- **THEN** 前端立即尝试刷新而不是等待下一次业务请求返回 401

### Requirement: 鉴权请求统一刷新与重试
系统 SHALL 为 JSON、FormData、Blob、上传、导出和 SSE 建立请求提供统一鉴权传输，并在首次收到 401 时最多刷新和重试一次。

#### Scenario: 上传请求遇到 Access Token 过期
- **WHEN** FormData 上传请求首次返回 401 且 Refresh Token 有效
- **THEN** 系统刷新 Token 并使用原请求体重试一次

#### Scenario: SSE 建立前遇到 Access Token 过期
- **WHEN** SSE 请求建立时首次返回 401 且尚未消费流事件
- **THEN** 系统刷新 Token 并重新建立一次流式请求

#### Scenario: 重试后仍未授权
- **WHEN** 鉴权请求刷新成功后重试仍返回 401
- **THEN** 系统终止本地会话且 MUST NOT 继续重试

### Requirement: 刷新失败分类
系统 MUST 区分 Refresh Token 终态失效与临时网络或服务异常，只有终态失效才能清理本地认证状态。

#### Scenario: Refresh Token 已撤销
- **WHEN** Refresh 接口明确返回 Token 已撤销、非法或过期
- **THEN** 前端清理认证状态并进入登录页

#### Scenario: 刷新期间断网
- **WHEN** Refresh 请求因网络不可达而失败
- **THEN** 前端保留 Token 和用户状态，且后续恢复网络时可再次刷新

#### Scenario: 刷新服务暂不可用
- **WHEN** Refresh 接口返回 429、502、503、504 或其他 5xx
- **THEN** 前端保留登录态且 MUST NOT 显示会话已失效

### Requirement: 会话终止与返回路径
系统 SHALL 在会话终态失效时保存当前站内路径并统一更新 Token、认证 Store 和登录页状态。

#### Scenario: 普通会话过期
- **WHEN** Refresh Token 终态失效且当前页面需要登录
- **THEN** 系统进入登录页、显示登录状态失效提示，并在重新登录成功后返回原站内路径

#### Scenario: 单设备会话被顶
- **WHEN** 任一鉴权请求返回 `SESSION_KICKED`
- **THEN** 系统进入登录页并显示其他设备登录提示

### Requirement: 多标签页刷新协调
系统 MUST 在同一标签页共享刷新任务，并在支持 Web Locks 的浏览器中串行化跨标签页 Refresh Token 轮换。

#### Scenario: 同标签页并发 401
- **WHEN** 同一标签页多个请求同时因 Token 过期返回 401
- **THEN** 所有请求等待同一个刷新任务

#### Scenario: 多标签页同时需要刷新
- **WHEN** 两个标签页同时尝试使用同一个 Refresh Token 刷新
- **THEN** 获得锁的标签页执行轮换，后获得锁的标签页复用已更新的 Token

#### Scenario: 其他标签页终止会话
- **WHEN** 一个标签页确认会话终态失效
- **THEN** 其他标签页同步清理认证状态并进入登录态

### Requirement: Refresh Token 原子消费
后端 MUST 确保同一 Refresh Token 最多成功轮换一次，Redis 和 PostgreSQL 路径均不得采用可并发通过的先查后改流程。

#### Scenario: Redis 并发轮换
- **WHEN** 两个请求并发提交同一个有效 Refresh Token 且 Redis 可用
- **THEN** 仅一个请求成功消费旧会话，另一个请求返回 Token 已撤销

#### Scenario: PostgreSQL 并发轮换
- **WHEN** Redis 未启用且两个请求并发提交同一个有效 Refresh Token
- **THEN** 仅更新到未撤销会话行的请求成功，另一个请求返回 Token 已撤销

#### Scenario: Redis 执行异常
- **WHEN** Redis 已配置但原子消费脚本执行失败
- **THEN** Refresh 接口返回可重试的服务异常且 MUST NOT 绕过校验签发新 Token

### Requirement: Token TTL 部署配置
部署编排 MUST 将 Access Token 和 Refresh Token TTL 环境变量显式传入应用容器，并在未配置时保持当前默认值。

#### Scenario: 服务器配置自定义 TTL
- **WHEN** 服务器根 `.env` 配置 `AUTH_ACCESS_TTL_MIN` 或 `AUTH_REFRESH_TTL_MIN`
- **THEN** Compose 创建的应用容器接收到对应值

### Requirement: 卸载保存兜底
系统 SHALL 在页面卸载阶段使用当前 Access Token 尝试 `keepalive` 保存，并 MUST 保留本地草稿用于未确认请求的恢复，不得在卸载阶段等待刷新。

#### Scenario: 卸载时 Token 已过期
- **WHEN** 页面卸载保存因 Access Token 过期未被服务端确认
- **THEN** 本地草稿保持未确认状态，并在下次进入页面后由正常同步链路重试
