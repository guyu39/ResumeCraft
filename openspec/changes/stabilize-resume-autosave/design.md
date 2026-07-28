## Context

ResumeCraft 的编辑器把模块集合维护在前端 Zustand store 中，编辑操作通过 localStorage 防抖留存，并由 `useCloudSync` 将内容写入 PostgreSQL。后端的简历记录采用混合存储：模块、主题色和样式在 `content` JSON 中，标题、语言、模板、共享个人信息、当前快照关联和快照草稿在独立列中；正文和快照草稿分别有乐观锁版本号。

当前实现存在四个结构性问题：保存指纹没有覆盖完整持久化对象；保存请求进行中再次编辑会丢弃后续触发；启动恢复依赖客户端与服务端时间比较；`keepalive` 请求无法确认结果。单设备登录消除了正常的多设备人工冲突，但不能消除同一页面的异步竞态。

简历是私人编辑数据，普通编辑应自动生效。手动快照、投递、分享和恢复版本仍是用户主动确认的业务动作。

## Goals / Non-Goals

**Goals:**

- 让本地草稿始终优先可恢复，云端保存具备可确认、可重试和不丢后续编辑的语义。
- 使用客户端 revision 与服务端 CAS version 区分“本地产生了新编辑”和“服务端已确认保存”。
- 保留当前整份简历 PUT 的实现方向，在一个后端事务中更新 JSON 内容和独立字段。
- 自动处理单设备场景下的 409，不显示用户冲突选择弹窗。
- 提供弱打扰但准确的保存状态，不能把本地保存误报为云端已保存。
- 评估 Redis，但保证 PostgreSQL 是权威数据源，Redis 不成为一期数据安全依赖。

**Non-Goals:**

- 不引入正式简历与草稿双表，不增加手动保存按钮。
- 不在每次自动保存时创建历史快照；手动快照继续独立存在。
- 不在一期拆分模块表或引入区块级 PATCH。
- 不把头像、附件或其他二进制内容嵌入简历 JSON。
- 不使用 Redis write-behind 作为唯一落库路径。

## Decisions

### 1. 完整载荷继续使用整份 PUT

客户端构造一个完整的 `PersistedResumePayload`，至少包含：

```text
title, locale, template, themeColor, styleSettings, modules,
personalData, basedOnSnapshotId, snapshotDrafts
```

API 继续使用 `PUT /api/resumes/:id`，但补齐 `locale` 和 `template` 字段，并要求后端在单事务中更新对应 JSON/独立列。整份 JSON 对当前简历规模足够简单可靠；只有请求体、耗时或并发冲突达到明确阈值时才考虑 PATCH。

替代方案：区块级 PATCH。暂不采用，因为它需要模块路径协议、删除语义、快照草稿合并和更多并发测试，不能直接解决当前保存队列问题。

### 2. 客户端采用 revision 驱动的串行保存队列

每份本地简历维护：

- `localRevision`：任何持久化字段改变时递增。
- `ackedRevision`：服务端确认成功的本地 revision。
- `serverVersion`：服务端 CAS 版本。
- `pending`：是否有保存请求结束后产生的新 revision。

编辑操作先更新 store，再以短防抖写入本地草稿；云端保存队列一次只允许一个请求。请求开始时固定 payload 和 revision，响应成功后仅确认该请求对应的 revision；如果当前 store 已有更高 revision，立即再次提交最新完整载荷。

### 3. 本地缓存优先，继续使用 localStorage

一期沿用 localStorage，保存 `{ resumeId, payload, localRevision, ackedRevision, serverVersion, savedAt }`。恢复依据 revision 和确认状态，不再使用本地 `savedAt` 与服务端 `updatedAt` 直接比较。

如果 JSON 体积接近浏览器存储限制，或后续附件需要本地离线缓存，再迁移到 IndexedDB；附件只保存对象存储 key/URL 和元数据。

### 4. Redis 不进入一期的权威保存链路

Redis 适合缓存、短期队列、限流和跨实例协调，但不适合作为当前简历自动保存的唯一中间落库：

- Redis 写入成功不等于 PostgreSQL 事务成功。
- write-behind 进程重启、淘汰或网络分区可能造成用户误以为已保存。
- 当前是单设备、低并发个人工具，PostgreSQL 行锁和 CAS 已足够解决保存竞态。

一期不新增 Redis 依赖。后续若监控证明保存吞吐成为瓶颈，Redis 只能作为以下可选层：

```text
客户端 -> API -> PostgreSQL 权威落库
                  ^
                  |
       Redis 可选做短期合并队列/限流/幂等键
```

即使启用 Redis，API 只有在 PostgreSQL 提交成功后才能返回“已保存”；Redis 丢失只会影响性能，不能影响数据正确性。

### 5. 触发与强一致入口

- 输入：约 500ms 云端防抖；本地草稿先落盘。
- 失焦、模块结构操作、快照切换、切后台：立即 flush。
- 导出、打印、AI、JD 分析：调用 `flushToCloud`，只有目标 revision 获得确认后才视为完成；失败时由调用方决定重试或继续执行不依赖云端的前端操作。
- `beforeunload`：立即落本地，并发送 keepalive 兜底；不据此设置云端已同步。
- `online`：触发待同步 revision 重试。

### 6. 409 自动恢复

服务端返回 409 时客户端先获取最新云端版本：

- 完整持久化 hash 相同：只对齐 serverVersion 和 draftsVersion。
- 本地存在 `localRevision > ackedRevision`：以当前本地 payload 重试。
- 本地没有未确认编辑：采用云端 payload 并重置本地确认状态。

最多自动重试有限次数；持续失败进入错误状态，不弹“本地/云端”选择窗。

### 7. 保存状态 UI

编辑器顶部或现有工作区通知区域显示：`编辑中`、`正在保存`、`已自动保存 HH:mm`、`已保存在本地，等待同步`、`保存失败，重试中`。成功不使用打断式 Toast；失败必须可见并提供重试入口。

## Risks / Trade-offs

- **全量请求体变大** → 记录请求体大小和耗时；超过阈值后再评估 PATCH/IndexedDB。
- **保存队列长时间积压** → 合并中间 revision，只提交最新 payload；保留本地每次 revision 作为恢复依据。
- **同设备其他接口更新 personal_data** → 后端统一返回对应版本或在 409/重新拉取时按持久化域校验，避免陈旧整包覆盖。
- **keepalive 请求失败不可见** → 刷新后读取本地未确认 revision，下一次启动自动补传。
- **Redis 后续被误用为权威缓存** → API 合同明确只有 PostgreSQL commit 成功才能返回 saved；增加故障演练和数据校验。
- **自动覆盖云端内容** → 单设备策略下以未确认本地 revision 为准，并记录 audit 日志；不引入用户冲突弹窗。

## Migration Plan

1. 先补充前后端请求/响应字段和完整载荷序列化，不改变数据库表结构。
2. 发布客户端 revision 与保存队列；旧客户端缺少 revision 时继续兼容现有 version 字段。
3. 发布状态反馈和强一致 `flushToCloud` 调用方。
4. 观察保存成功率、409 比例、重试次数、请求体大小和恢复成功率。
5. 若指标稳定，清理旧的时间戳仲裁分支；若出现异常，回滚客户端队列实现，数据库字段和已有版本号保持兼容。

## Open Questions

- 保存状态最终放在编辑器顶部栏，还是复用现有工作区通知中心，需要结合实际页面空间做一次浏览器核验。
- 自动检查点的保留数量和时间策略属于第二期版本历史需求，本变更只保留接口扩展点。
