## Context

ResumeCraft 简历存储分两表：
- `resumes`：`content`(jsonb 正文)、`based_on_snapshot_id`(当前编辑基于的快照)、`version`(content CAS)、`snapshot_drafts`+`snapshot_drafts_version`(快照草稿)、`personal_data`(共享)、title/template/locale 等。
- `resume_versions`：`content_snapshot`(jsonb)、`snapshot_type`('auto'/'manual'/'default')、`label`，**无 version 列**。

当前正文权威在 `resumes.content`：编辑（自动保存 PUT）只写 `resumes.content`；`resume_versions.content_snapshot` 仅在 `CreateManualSnapshot` 时从 `resumes.content` 拷贝一次。故修改某快照时编辑不回写该快照行，快照内容恒为创建时旧值 → 快照失效。切换快照靠 localStorage 草稿 + `snapshot_drafts` 中转兜底，但快照本体从不更新。

## Goals / Non-Goals

**Goals**
- 正文权威下沉到 `resume_versions.content_snapshot`，编辑按 `based_on_snapshot_id` 落到对应快照行。
- `resumes.content` 保留作镜像（读优化），与激活快照内容一致。
- `personal_data` 多快照共享，留在 `resumes`。
- 后端单事务保证"快照权威写 + 镜像同步"一致；乐观锁 CAS 移到 `resume_versions.version`。
- 前端自动保存链路（6df95cf revision 队列）不动，载荷语义不变。

**Non-Goals**
- 不删 `snapshot_drafts` 列（保留向后兼容，仅停止读写）。
- 不引入区块级 PATCH；继续整份 PUT。
- 不改 `personal_data` 共享语义。
- 不在本变更引入 Redis 或新表。

## Decisions

### 1. resume_versions 升为权威，新增 version CAS
- 迁移：`ALTER TABLE resume_versions ADD COLUMN version bigint NOT NULL DEFAULT 0;`
- `snapshot_type` check 增加 `'current'`：`ARRAY['auto','manual','default','current']`。
- 编辑带 `version` 做 CAS；冲突返回 409。

### 2. resumes.content 降为镜像，based_on_snapshot_id 复用为激活快照引用
- `resumes.content` 始终 = `based_on_snapshot_id` 指向快照的 `content_snapshot`。
- `resumes.version` 保留（镜像版本号，仍递增便于客户端对齐），但 CAS 权威在 `resume_versions.version`。
- `based_on_snapshot_id` 语义：当前激活/编辑的快照id。

### 3. 后端 Update 单事务落点
PUT /api/resumes/:id 在一个事务内：
1. 取 `based_on_snapshot_id`（= NULL 则视为异常，应已由迁移/新建保障非空）。
2. `UPDATE resume_versions SET content_snapshot=$payload, version=version+1 WHERE id=$based AND user_id=$uid AND version=$clientVersion`（CAS，0 行影响→409）。
3. `UPDATE resumes SET content=$payload, title=…, template=…, locale=…, personal_data=…, version=version+1, updated_at=NOW() WHERE id=$rid AND user_id=$uid`。
4. 返回 `{ version: resumes.version, snapshotVersion: resume_versions.version, snapshotDraftsVersion: … }`。

modules/themeColor/styleSettings 写入 `content_snapshot`（与现 content 结构一致）；title/template/locale/personal_data 写 resumes 独立列。

### 4. 新建简历建 current 快照
`CreateResume` 流程：建 `resumes` 行 + 立即建一个 `current` 快照（content_snapshot=初始 content）+ `resumes.based_on_snapshot_id` 指向它。

### 5. 创建手动快照
`CreateManualSnapshot`：从 `based_on_snapshot_id` 指向的 `resume_versions.content_snapshot` 拷贝一份 `manual` 快照（不再从 `resumes.content` 读，但二者镜像一致，等价）。可选拷新快照设为激活。

### 6. 切换快照
改 `resumes.based_on_snapshot_id = $newSid` + `resumes.content = 该快照 content_snapshot`（镜像同步）。前端从 getSnapshotDetail 加载内容到 store（现有逻辑），后端落点对齐。

### 7. 废弃 snapshot_drafts
列保留；后端 Update 不再读写 `snapshot_drafts`/`snapshot_drafts_version`；前端移除 collectSnapshotDrafts / snapshotDrafts 载荷字段 / App.tsx 草稿恢复 / CenterPanel localStorage 草稿中转。离线兜底改由本地草稿（resumeStore localStorage）承担。

### 8. 数据迁移
幂等迁移：对每份 `resumes`（deleted_at IS NULL）：
- 若 `based_on_snapshot_id` 非空且指向行存在 → 将该行 `snapshot_type` 置为 `'current'`（若原为 default/auto）。
- 否则用 `resumes.content` INSERT 一个 `current` 快照，回填 `resumes.based_on_snapshot_id`。

## Risks / Trade-offs

- **双写一致性**：靠单事务保证快照权威与镜像同步；任一失败整体回滚。
- **based_on_snapshot_id 为空**：迁移保障非空；运行时若遇空，Update 返回明确错误而非崩溃。
- **旧客户端 version 语义**：旧客户端带 `resumes.version`，新逻辑用 `resume_versions.version` CAS；过渡期允许 `version==nil` 不阻塞但无保护（与 6df95cf 兼容策略一致）。
- **迁移回填量**：全表扫描，按 resume_id 批处理；幂等可重跑。

## Migration Plan

1. schema 迁移：`resume_versions` 加 `version`、`snapshot_type` 加 `current`。
2. 数据迁移：回填 `current` 快照 + `based_on_snapshot_id`。
3. 后端 Update/CreateManualSnapshot/CreateResume 改写。
4. 前端移除 snapshotDrafts 读写。
5. 验证：go build + tsc + 手动场景（编辑落快照、切换快照、创建快照、409）。
