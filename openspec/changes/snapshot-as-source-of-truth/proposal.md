## Why

ResumeCraft 的简历正文权威当前落在 `resumes.content`，`resume_versions.content_snapshot` 只在"创建快照"时从 `resumes.content` 拷贝一次、之后永不更新。因此用户修改某个快照时，编辑只落到 `resumes`，对应 `resume_versions` 行始终是创建时的旧值——快照内容不变，快照功能实际失效。

需要把正文权威下沉到 `resume_versions`，让"修改指定快照"真正更新该快照行；`resumes` 只保留当前激活快照引用与共享元数据，`resumes.content` 降为镜像用于读优化。

## What Changes

- `resume_versions.content_snapshot` 升为正文唯一权威；新增 `resume_versions.version`（乐观锁 CAS）。
- `resumes.content` 降为"当前激活快照内容的镜像"；`resumes.based_on_snapshot_id` 复用为"当前激活快照id"。
- 后端 `Update`（PUT /api/resumes/:id）改为单事务：更新 `resume_versions[id=based_on_snapshot_id].content_snapshot`（带 version CAS）+ 同步 `resumes.content` 镜像 + 更新 `resumes` 的 title/template/locale/personal_data。409 由 `resume_versions.version` 触发。
- `snapshot_type` 增加 `'current'`；新建简历自动建一个 `current` 快照作为编辑载体，`based_on_snapshot_id` 指向它。
- 创建手动快照 = 从当前快照 `content_snapshot` 拷贝一份 `manual`。
- 废弃 `snapshot_drafts` / `snapshot_drafts_version`：列保留不删，代码停止读写。
- `personal_data` 留在 `resumes`，多快照共享（当前行为不变）。
- 数据迁移：为每份 `resumes` 保障 `based_on_snapshot_id` 指向一个 `current` 快照，缺失则用 `resumes.content` 建一个 `current` 快照回填。

## Capabilities

### New Capabilities
- `resume-snapshot-source`：以 `resume_versions` 为正文权威，`resumes` 持有激活快照引用与镜像，编辑按快照落点。

### Modified Capabilities
- `resume-autosave`（6df95cf 引入）：保存载荷语义不变（仍 PUT /api/resumes/:id），但后端落点从 `resumes.content` 改为 `resume_versions` + 镜像同步；前端 revision 队列不动。

## Impact

- 数据库：`resume_versions` 加 `version` 列、`snapshot_type` check 加 `'current'`；`resumes` 列不变（snapshot_drafts 保留不删）；新增数据回填迁移。
- 后端：`repository.Update` 重写落点；`CreateManualSnapshot` 改为从当前快照拷贝；新建简历流程建 `current` 快照；切换快照改 `based_on_snapshot_id` + 同步镜像。
- 前端：自动保存载荷/revision 队列不动；移除 `snapshotDrafts` 读写与 localStorage 草稿中转；切换快照逻辑简化。
- 兼容：旧客户端 PUT 仍可用（后端转换落点）；`snapshot_drafts` 列保留，旧数据不丢。
