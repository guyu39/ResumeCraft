## 1. Schema 迁移
- [ ] 1.1 `resume_versions` 加 `version bigint NOT NULL DEFAULT 0`（幂等）。
- [ ] 1.2 `snapshot_type` check 增加 `'current'`（幂等：DROP + ADD CONSTRAINT）。
- [ ] 1.3 验证：迁移可重跑、不破坏现有数据。

## 2. 数据迁移
- [ ] 2.1 对每份 `resumes`（deleted_at IS NULL）：`based_on_snapshot_id` 指向行存在则置该行 `snapshot_type='current'`；否则用 `resumes.content` 建 `current` 快照并回填 `based_on_snapshot_id`。
- [ ] 2.2 幂等：重复执行不产生副作用（已 current 不改、已回填不重建）。

## 3. 后端 repository 改写
- [ ] 3.1 `Update`：单事务落点 `resume_versions[id=based_on_snapshot_id]`（content_snapshot + version CAS）+ 同步 `resumes.content` 镜像 + resumes 独立列（title/template/locale/personal_data）；409 由 `resume_versions.version` 触发。
- [ ] 3.2 `Update` 返回值含 `snapshotVersion`（resume_versions.version）与 `version`（resumes.version）。
- [ ] 3.3 `based_on_snapshot_id` 为空时返回明确错误（不崩溃）。
- [ ] 3.4 `CreateResume`：建 `resumes` + 建 `current` 快照 + 回填 `based_on_snapshot_id`。
- [ ] 3.5 `CreateManualSnapshot`：从 `based_on_snapshot_id` 指向快照的 `content_snapshot` 拷贝 `manual`。
- [ ] 3.6 切换快照逻辑：改 `based_on_snapshot_id` + 同步 `resumes.content` 镜像。

## 4. 前端清理
- [ ] 4.1 移除 `useCloudSync` 的 `snapshotDrafts` 载荷字段与 `collectSnapshotDrafts`。
- [ ] 4.2 移除 `App.tsx` 的 `snapshotDrafts` 草稿恢复逻辑。
- [ ] 4.3 简化 `CenterPanel` 切换快照：移除 localStorage 草稿中转，直接从云端快照加载。
- [ ] 4.4 `resumeStore` 移除 `snapshotDrafts` 相关状态/持久化（若存在）。

## 5. 验证
- [ ] 5.1 `go build ./...` 通过。
- [ ] 5.2 `tsc --noEmit` 通过。
- [ ] 5.3 场景：编辑某快照 → 该 `resume_versions.content_snapshot` 更新；切换快照 → 内容正确；创建手动快照 → 内容为当前；409 触发与恢复。
