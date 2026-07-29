## Context

当前 `resumes.content` 与 `resume_versions.content_snapshot` 都可能保存编辑正文。最近的自动保存实现通过 `resumes.version` 做整份 JSON 的 CAS 更新，并在存在 `based_on_snapshot_id` 时尝试同步对应快照正文。这使手动快照兼具“历史版本”和“可变编辑载体”两种冲突语义；删除、恢复或请求失败后，前端也无法稳定判断应以哪份内容为准。

项目是单设备登录的私人编辑工具，但同一页面仍存在防抖、切后台、打印和恢复操作之间的异步竞态。数据库迁移必须兼容现有数据和已部署旧代码，且按项目规则不得新增外键。

## Goals / Non-Goals

**Goals:**

- 每份有效简历始终有且仅有一个 `current` 版本，作为当前正文唯一编辑载体。
- 手动快照是可继续编辑的命名分支；只有当前选中的分支随普通编辑更新。
- 创建、恢复、删除快照和自动保存具有明确的事务边界与用户归属校验。
- 在不立即删除 `resumes.content` 的情况下完成可回滚的数据迁移。
- 保留现有整份 JSON 自动保存和前端串行 revision 队列。

**Non-Goals:**

- 本次不引入 Redis write-behind、后台 flush worker 或新的保存成功语义。
- 本次不拆分简历模块表，不实现区块级 PATCH。
- 本次不物理删除 `resumes.content`、`resumes.version` 或旧快照类型。
- 本次不新增历史版本浏览页面或新的快照视觉布局。

## Decisions

### 1. `current` 是工作副本，`manual` 是可编辑命名分支

`resumes.current_version_id` 指向唯一的 `resume_versions.current` 工作副本。自动保存以 `current.version` 做 CAS，更新 current 的 `content_snapshot`、`version` 和 `updated_at`。当 `resumes.based_on_snapshot_id` 指向 manual 时，同一事务还要更新该 manual 的 `content_snapshot`、`version` 和 `updated_at`；其他未选中的 manual 不变。

只更新 current 会导致用户在 A 中编辑、切到 B、再切回 A 时丢失 A 的修改，并且“已自动保存”提示与用户理解不一致，因此不采用。投递记录关联的是可编辑命名版本；需要冻结投递时版本应显式复制新快照，而不是让保存提示隐含不可变语义。

### 2. 新建简历事务内创建 current

Repository 在一个事务中插入 `resumes`、插入初始 current、回写 `current_version_id` 并追加审计记录。任何一步失败都回滚，避免存在无 current 的新记录。

迁移后的应用层仍保留 `ensureCurrentVersion` 兼容路径：遇到旧简历没有 current 时，从 `resumes.content` 创建并绑定 current。该路径必须具备并发幂等性，依赖部分唯一索引解决重复创建。

### 3. 兼容期双读、单主写

读取简历优先使用 current 的正文；没有 current 时回退 `resumes.content`。新代码的正文主写只更新 current，同时在第一阶段继续镜像写 `resumes.content`，用于旧客户端与快速回滚。镜像列不参与权威版本判断，待线上验证后通过独立变更停止镜像写并最终删列。

这样牺牲短期存储重复，换取数据库与应用可独立回滚。若直接停止写旧列，回滚到旧后端会读取陈旧正文，因此本次不采用。

### 4. current CAS 版本与 resumes 兼容版本同步递增

`resume_versions.version` 是 current 正文的权威 CAS。兼容期继续维护 `resumes.version`，两者在迁移时取同一初始值，单事务保存时同步递增。API 暂时沿用现有 `version` 字段，值对应 current version，避免一次性改动所有调用方。

`created_at` 表示版本创建时间；`updated_at` 表示正文或标签最后修改时间，不能替代 CAS version。

### 5. 手动快照作为可编辑分支

- 创建：事务锁定用户拥有的 resume/current，从 PostgreSQL current 复制出 manual。
- 恢复：校验 manual 与 resume 归属，将 manual 内容复制到 current，递增 current CAS，并更新 `based_on_snapshot_id`。
- 普通编辑：更新 current；存在 `based_on_snapshot_id` 时同步更新该命名快照，确保分支修改可在切换后恢复。
- 删除当前基准 manual：直接返回 `SNAPSHOT_ACTIVE`，不修改 current、基准关联或任何快照；用户必须先显式切换到其他分支。
- 删除非当前 manual：在事务内检查投递记录引用；被引用时返回 `SNAPSHOT_IN_USE`，未被引用时才删除。

前端在创建和恢复前继续调用现有 `flushToCloud`，后端操作只读取 PostgreSQL，避免从浏览器或未来 Redis 缓存生成不完整快照。前端点击删除当前分支时直接提示先切换，不打开无效的删除确认；底部版本线仅在存在至少两个命名分支时显示。

### 6. 所有快照资源使用复合归属条件

Repository 方法统一接收 `userID`、`resumeID` 和必要的 `snapshotID`。列表先验证 resume 归属；详情、更新、删除和恢复使用复合条件；对比要求两个快照都属于同一指定 resume 和当前用户。越权与不存在统一映射 404。

### 7. Redis 作为独立后续提案

当前 PostgreSQL 直写已经具备前端防抖、串行队列和 CAS。Redis write-behind 会引入“已暂存”和“已落库”的双重状态、可靠队列与 worker 运维面，不能用于修复当前权威数据模型。本次只保持保存服务边界可替换，不增加 Redis key、Stream 或 feature flag。

### 8. 失败保存不得通过 payload hash 立即自旋

保存请求失败后保留 pending revision，并只允许既有退避计时器触发重试。`finally` 只有在本次保存成功且期间产生了更高 revision，或 409 处理明确设置立即重试标记时才能再次调用保存。payload hash 仅用于判断内容是否已经确认，不能单独作为失败后的立即重试条件。

快照切换只在 `localRevision > ackedRevision` 时执行 flush；本地没有未确认编辑时直接调用服务端 restore，避免无操作切换被无关的保存错误阻断。

保存错误只在预览工具栏中央显示一次，并由同一位置提供重试操作。workspace notice 不再为相同的 `saveStatus=error` 生成第二条“云端同步异常”，其他解析和数据校验通知保持不变。

## Risks / Trade-offs

- **旧数据中 current 与 resumes.content 不一致** -> 迁移按当前 `resumes.content` 回填缺失 current；已有 current 由校验脚本列出差异，不静默覆盖。
- **唯一索引创建前已有多个 current** -> 迁移先为每份简历保留更新时间最新的一条，其余降级为 `auto`，再创建索引。
- **兼容镜像写再次出现双源误读** -> 新代码所有读取明确优先 current；镜像列只用于旧版本回滚，并增加一致性查询。
- **旧客户端继续按 resumes.version 保存** -> 兼容期同步 current.version 与 resumes.version；服务端响应仍返回统一 version。
- **恢复快照时并发自动保存** -> 使用 expectedVersion CAS 和事务行锁；切换前先 flush 当前分支，冲突返回 409，由现有前端队列重新拉取或重试。
- **投递关联快照后继续编辑** -> 这是当前产品允许的“关联快照支持修改”语义；需要冻结时由用户新建独立快照。
- **删除当前分支后页面与数据库不一致** -> 前后端都禁止删除 `based_on_snapshot_id` 指向的分支，避免产生无分支但仍保留已删除分支正文的悬空状态。
- **保存接口持续失败导致前端自旋** -> 失败路径不根据 hash 立即递归；使用有限退避并保持错误状态可见。
- **迁移时间较长** -> 分离结构变更、数据回填与最终约束，SQL 保持幂等并分批验证。

## Migration Plan

1. 增加 `resume_versions.updated_at`、`resume_versions.version`、`resumes.current_version_id`，放宽 snapshot type 约束，不删除旧列。
2. 处理可能重复的 current，为缺失 current 的历史简历从 `resumes.content` 回填，并回写指针。
3. 创建每份简历唯一 current 的部分唯一索引和必要的查询索引。
4. 发布后端：新建事务创建 current，读取 current 优先，保存 current 并镜像旧列，所有快照接口收紧授权。
5. 发布前端：恢复使用 current 返回内容，快照关联变更进入 revision 保存链路。
6. 运行一致性查询，核对无缺失 current、无重复 current、指针归属正确、current 与兼容 content 一致。
7. 稳定观察后另提变更，停止镜像写并删除 `resumes.content`。

回滚时可退回旧应用版本，因为兼容期仍镜像维护 `resumes.content` 和 `resumes.version`；新增字段和索引保留不会阻断旧代码。

## Open Questions

- 无阻断问题。Redis 是否启用必须基于自动保存延迟、请求体大小和数据库写入指标另行决策。
