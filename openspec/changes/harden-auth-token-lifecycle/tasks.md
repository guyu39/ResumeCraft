## 1. 前端认证会话基础设施

- [x] 1.1 新增 Auth Session Manager，集中实现 Token 读写、JWT 到期判断、刷新错误分类与同标签页 Promise 复用
- [x] 1.2 实现到期前 90 秒主动刷新、页面可见性恢复检查和生命周期清理
- [x] 1.3 使用 Web Locks、BroadcastChannel 与 storage 事件协调多标签页刷新和终态退出
- [x] 1.4 实现会话终态事件、站内返回路径校验及 `kicked`/`expired` 登录跳转

## 2. 统一鉴权传输

- [x] 2.1 新增支持标准 RequestInit、FormData 与 Blob 响应的 `authenticatedFetch`，实现一次 401 刷新重试
- [x] 2.2 重构 `apiClient` 使用统一鉴权传输并保持现有 ApiError 契约
- [x] 2.3 迁移头像、简历解析、面试录音与职位导出请求到统一鉴权传输
- [x] 2.4 将 SSE 改为 Fetch Stream 并保留分片解析、取消、超时和 done 结果语义
- [x] 2.5 保留云同步卸载 `keepalive` 当前 Token 发送方式，并确认本地草稿仍作为失败兜底

## 3. 认证状态与登录反馈

- [x] 3.1 修改 authStore 启动检查，仅在会话终态失效时清理用户状态
- [x] 3.2 在 App 初始化/销毁认证生命周期，并让跨标签页终态事件同步 Zustand 状态
- [x] 3.3 按 ui-spec 扩展登录页过期提示并校验登录成功返回路径

## 4. 后端原子轮换

- [x] 4.1 使用 Redis Lua 原子校验并消费 Refresh Session、旧 Access Token 和会话索引
- [x] 4.2 Redis 执行异常返回可重试服务错误，Refresh Handler 区分服务异常与 Token 终态失效
- [x] 4.3 PostgreSQL 回退路径使用条件 UPDATE RETURNING 原子消费并保留 IP/UA

## 5. 配置与验证

- [x] 5.1 在保留现有 SMTP 修改的前提下为 Compose 增加 Access/Refresh TTL 环境变量映射
- [x] 5.2 补充 Refresh Token 过期、撤销与 Redis 并发原子消费测试
- [x] 5.3 运行 Go 测试、前端构建、OpenSpec 校验和 `git diff --check`
- [x] 5.4 使用浏览器验证过期提示、返回路径、移动端布局及关键鉴权请求
- [x] 5.5 独立执行 verification 与 code-review，记录无法验证项和剩余风险
