## 1. 数据库结构与迁移

- [x] 1.1 新增幂等迁移：允许 `current`、增加 `resume_versions.updated_at/version` 和 `resumes.current_version_id`。
- [x] 1.2 在迁移中清理重复 current、回填缺失 current 和指针，并建立每份简历唯一 current 的部分索引。
- [x] 1.3 同步更新 `init.sql`，且不新增外键。

## 2. Current 持久化模型

- [x] 2.1 扩展后端 model 与扫描逻辑，返回 current ID、current version 和版本更新时间。
- [x] 2.2 将新建简历改为事务内创建 resume 与唯一 current。
- [x] 2.3 将详情读取改为 current 优先、旧 content 兼容回退。
- [x] 2.4 将自动保存改为 current CAS 主写并兼容镜像 `resumes.content/version`。

## 3. 手动快照事务与授权

- [x] 3.1 创建 manual 时从 PostgreSQL current 复制，不再从可变旧源读取。
- [x] 3.2 恢复 manual 时复制到 current、递增版本并更新基准，不修改 manual。
- [x] 3.3 删除当前基准 manual 时返回 `SNAPSHOT_ACTIVE`；切换后删除非当前分支时再检查投递引用并决定是否允许删除。
- [x] 3.4 列表、详情、改名、删除、恢复和对比统一使用 userID + resumeID 归属条件并返回 404。

## 4. 前端快照与 revision

- [x] 4.1 扩展 API 类型和 store 状态，接收 current version 元数据。
- [x] 4.2 快照恢复后以服务端 current 初始化内容，并同步对齐 store 与保存队列内部的 server version。
- [x] 4.3 快照基准关联修改进入持久化 revision 与自动保存链路。
- [x] 4.4 保持现有保存状态区域和视觉布局不变，错误时不误报“已自动保存”。
- [x] 4.5 修复失败保存的立即自旋，并让无未确认 revision 的快照切换跳过 flush。
- [x] 4.6 修复 UUID 基准字段更新类型，并去除重复的云端保存错误提示。
- [x] 4.7 将选中快照改为可编辑命名分支，自动保存事务同步 current 与当前分支。
- [x] 4.8 删除当前分支时提示先切换且不发删除请求，并仅在至少两个命名分支时显示版本线。

## 5. 测试与验证

- [ ] 5.1 增加 Repository/Service 测试，覆盖新建 current、CAS、当前命名分支同步更新和删除基准。
- [x] 5.2 增加 Handler/Service 授权契约测试，覆盖列表、详情和对比的用户与父简历作用域。
- [ ] 5.3 增加前端测试，覆盖快照恢复 revision、关联持久化和保存失败恢复。
- [x] 5.4 运行迁移静态护栏、Go 全量测试、前端生产构建和 `git diff --check`；真实 PostgreSQL 迁移执行留待有数据库环境时验证。
- [x] 5.5 核对 OpenSpec 任务状态并记录 Redis 未进入本次部署依赖。
