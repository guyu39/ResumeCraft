## ADDED Requirements

### Requirement: 投递记录允许不关联快照
系统 SHALL 要求投递记录关联用户拥有的简历，但 SHALL NOT 要求创建时必须关联简历快照。

#### Scenario: 新简历没有命名快照
- **WHEN** 用户使用只有内部 current 工作版本的简历创建投递记录且未提供 snapshotVersionId
- **THEN** 系统创建投递记录并将 snapshotVersionId 保存为 NULL

#### Scenario: 创建时选择有效快照
- **WHEN** 用户提供属于关联简历和当前用户的非 current 快照
- **THEN** 系统创建投递记录并保存该快照关联

#### Scenario: 创建时选择非法快照
- **WHEN** 用户提供其他用户、其他简历或 current 类型的快照
- **THEN** 系统拒绝创建且不写入投递记录

### Requirement: 用户可以维护可选快照关联
系统 SHALL 允许用户在投递记录创建后绑定、替换或清除快照关联。

#### Scenario: 后续绑定快照
- **WHEN** 未关联快照的投递记录更新为属于目标简历的有效快照
- **THEN** 系统保存该快照关联

#### Scenario: 显式清除快照
- **WHEN** 更新请求显式提供空 snapshotVersionId
- **THEN** 系统将 snapshotVersionId 更新为 NULL

#### Scenario: 更换简历但未提供新快照
- **WHEN** 更新请求更换 resumeId 且未提供 snapshotVersionId
- **THEN** 系统更新简历并清空旧快照关联

#### Scenario: 仅更新其他字段
- **WHEN** 更新请求未提供 resumeId 和 snapshotVersionId
- **THEN** 系统保留现有简历与快照关联

### Requirement: 未关联快照不阻断投递工作流
系统 SHALL 允许未关联快照的投递记录完成检查清单、状态流转、面试记录和导出操作。

#### Scenario: 未关联版本生成检查清单
- **WHEN** 用户使用当前简历正文和 JD 创建或重新生成检查清单且投递记录未关联快照
- **THEN** 系统生成检查清单并将来源快照保存为空

#### Scenario: 未关联版本切换状态
- **WHEN** 未关联快照的投递记录切换到已投递或后续状态
- **THEN** 系统完成状态流转且不自动创建快照

### Requirement: 未关联版本具有一致展示和统计口径
系统 MUST 在响应、导出和转化统计中稳定处理空快照关联。

#### Scenario: 查询未关联记录
- **WHEN** 客户端查询 snapshotVersionId 为 NULL 的投递记录
- **THEN** API 返回可空快照 ID，且页面显示“未关联版本”或等价空关联状态

#### Scenario: 导出未关联记录
- **WHEN** 用户导出包含未关联快照的投递记录
- **THEN** 导出文件的关联快照列显示“未关联版本”

#### Scenario: 统计未关联记录
- **WHEN** 转化统计包含一个或多个未关联快照的投递记录
- **THEN** 系统将这些记录聚合到“未关联版本”分组且不从总数中丢失
