## Why

当前简历正文同时存在于 `resumes.content` 与 `resume_versions.content_snapshot`，自动保存、快照恢复和删除后的权威来源不一致，已经造成选中快照后修改被旧云端内容覆盖、手动快照可能被持续编辑污染等问题。同时，快照详情、列表和对比接口缺少完整的用户归属约束，新建简历写入 `snapshot_type='current'` 也与现有数据库约束冲突。

本变更建立唯一、可验证的编辑数据流：每份简历创建时同步创建唯一的可变 `current` 版本，手动快照作为可编辑命名分支，PostgreSQL 仍为保存成功的唯一权威来源。

## What Changes

- 新建简历时在同一事务中创建 `resumes` 元数据和唯一的 `resume_versions.current`，并回写 `current_version_id`。
- 自动保存更新 `current` 的完整 JSON 和 CAS `version`；存在选中的命名快照时，在同一事务中同步更新该快照，使其成为可继续编辑的命名分支。
- 创建手动快照时从已落库的 `current` 复制；选择手动快照时将其内容复制到 `current`，并更新 `based_on_snapshot_id`。
- 为 `resume_versions` 增加 `updated_at` 和正文版本号，并修复 `snapshot_type` 约束及每份简历唯一 `current` 的部分唯一索引。
- 快照列表、详情、更新、删除、恢复和对比统一校验 `userID + resumeID + snapshotID`，跨用户或跨简历访问返回未找到。
- 当前正在编辑的命名分支禁止删除，用户必须先切换到其他分支；切换后删除非当前分支时，再检查投递记录引用并决定是否允许删除。
- `resumes.content` 进入兼容迁移期：旧数据回填 `current`，新代码优先读写 `current`，暂不物理删除旧字段。
- 前端快照选择改为服务端恢复到 `current` 后重新初始化，并正确维护本地 revision、server version 和当前命名分支关联。
- 底部版本线仅在存在至少两个命名分支时显示；零个或一个分支时隐藏。
- Redis 不进入本次权威写入链路；仅保留后续基于指标单独提案的扩展边界。
- **BREAKING**：`current` 成为当前工作副本；选中 manual 后，保存会同时更新工作副本和该命名分支，未选中的其他快照保持不变。

## Capabilities

### New Capabilities

- `resume-current-version`: 定义当前编辑版本、手动快照、创建、保存、恢复、删除、迁移和所有权校验的完整契约。

### Modified Capabilities

- 无。当前 `openspec/specs` 尚无已归档的简历版本能力规范。

## Impact

- 数据库：`resume_versions`、`resumes` 结构、约束、索引和旧数据回填迁移。
- 后端：简历 model、repository、service、snapshot handler，以及投递记录对快照引用的删除校验。
- 前端：resume API 类型、`resumeStore`、云端保存队列、快照创建/选择/删除交互。
- 测试：Repository 事务与授权集成测试、Service/Handler 行为测试、前端 revision 与快照切换测试。
- 部署：先执行兼容迁移，再发布后端和前端；Redis 不是部署依赖。
