## Why

职位进入“待适配”时，用户通常尚未确定最终投递哪一个简历版本。当前创建投递记录强制要求 `snapshotVersionId`，导致只有内部 `current` 工作版本的新简历无法保存职位，并以泛化的“参数错误”失败。

## What Changes

- 投递记录仍必须关联用户拥有的简历，但关联快照改为可选，可在创建后绑定、替换或清除。
- 未关联快照时，JD 匹配、评分和投递前检查清单继续使用请求携带的当前简历正文，来源快照保持为空。
- 状态切换到“已投递”及后续阶段时不因缺少快照而阻断，也不自动创建快照。
- 投递列表、详情、编辑、导出和版本转化统计统一显示或聚合为“未关联版本”。
- 更换关联简历时，如果请求没有同时提供属于新简历的快照，则清空原快照关联，避免跨简历悬空引用。
- `current` 继续作为内部工作副本，不能作为投递快照写入；现有非空快照关联保持不变。
- **BREAKING**：`job_applications.snapshot_version_id`、API `snapshotVersionId` 和响应模型由必填改为可空。

## Capabilities

### New Capabilities

- `optional-application-snapshot`: 定义投递记录创建、编辑、AI 来源、状态流转、展示和统计中的可选快照关联契约。

### Modified Capabilities

- 无。当前 `openspec/specs` 尚无已归档的投递记录能力规范。

## Impact

- 数据库：`job_applications.snapshot_version_id` 去除非空约束，`init.sql` 同步可空定义。
- 后端：投递 model、service、repository 的创建/更新/扫描、Excel 导出和按快照转化统计。
- 前端：投递 API 类型、创建/编辑表单、列表与详情的未关联状态展示。
- 测试：Service 可选参数、Repository SQL 契约、前端表单提交和统计空值行为。
