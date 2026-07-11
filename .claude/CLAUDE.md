# 开发协作体系规范（最高优先级）

本规范为所有开发协作的**最高优先级规则**，所有开发动作不得违背上述约束。遇到规则未覆盖的场景，按「最短路径 + 证据优先」原则处理，并同步更新规范文档。

## 一、整体架构

本开发协作体系由「三层核心插件 + 一项专项规范」组成，所有需求与开发动作必须严格遵循分层职责与流程约束，禁止跨层越权：

- **OpenSpec** —— 规范与需求层，负责产出 proposal / design / tasks 文档
- **superpowers** —— 思考与流程层，负责 plan / brainstorm / debug / TDD / review / verify 全流程
- **gstack** —— 执行与外部世界层，负责 browser / QA / ship / deploy / canary / 安全护栏
- **UI/UX 专项规范** —— 所有页面类变更的强制前置约束

类比定位：OpenSpec 是蓝图，superpowers 是大脑，gstack 是手脚，UI/UX 规范是前端实现的强制标准。

## 二、核心原则

- **规范先行**：任何需求变更必须先过 OpenSpec，调用 `/opsx:propose`，产出 proposal.md + design.md + tasks.md 后，才可动手编写代码。
- **流程归 superpowers**：brainstorm、plan、debug、TDD、verify、code review 默认走 superpowers，不走 OMC /feature-dev 等同名第三方 skill。
- **执行归 gstack**：浏览器、QA、ship、deploy、canary、retro 全量走 gstack。
- **独立 reviewer 通道**：verification 和 code-review 分两个独立 pass，禁止在同一上下文里合并执行。
- **证据优先**：没有测试结果、截图、QA 报告等实锤证据，不算任务完成。
- **歧义先 brainstorm**：任何创造性工作、方案不明确的任务，先启动 brainstorming 对齐共识，再进入执行。
- **最短路径优先**：能用一个 skill 解决的任务，不升级为完整闭环流程。

## 三、OpenSpec 规范工作流

### 双文件夹模型

```plaintext
openspec/
  specs/     # 当前系统的事实来源，存放生效的系统规范文件
  changes/   # 每次变更的完整提案，按变更独立存放
```

### 单份变更标准产出

每一次需求变更，必须完整产出三份文档：

- **proposal.md** —— 为什么做：背景、目标、成功标准、不做的影响、边界与非目标
- **design.md** —— 怎么做：架构决策、接口设计、数据流、依赖关系、技术选型
- **tasks.md** —— 做什么：可执行的具体任务清单，作为 superpowers 执行的唯一输入

### 职责边界

- OpenSpec 只产出规范文档，不编写任何业务代码。
- Superpowers 只按 tasks.md 执行编码流程，不得私自修改 OpenSpec 规范。
- gstack 只做验证和交付动作，不参与需求分析或架构决策。
- 三者之间仅通过文件和命令传递信息，不通过共享内存或隐式状态流转。

### 规范与执行的衔接

需求输入 → OpenSpec 输出 tasks.md → tasks.md 作为 superpowers 的输入，启动对应开发流程。编码执行中如发现规范遗漏、错误或不可行，必须回退到 OpenSpec 更新 design.md/tasks.md，对齐后再继续执行，禁止边改规范边写代码。

## 四、任务分流规则

- **只读任务**：分析、解释、架构说明、代码阅读类需求，直接处理，无需走完整流程。
- **真实 bug 排查但尚未修改代码**：使用 systematic-debugging。
- **轻量任务**：单文件或小范围修改、明确 bug 修复、配置 / 文案调整、小测试补充。
  - 跳过完整 brainstorming / writing-plans / worktrees / 重 review 链路
  - 直接实现 + 定向验证 + 必要时 `/browse` 核验效果
- **中任务**：多文件但边界清晰、新增功能或明确的重构。
  - 强制流程：OpenSpec `/opsx:propose` → 简短 brainstorming + 短 writing-plans → 代码实现 → `/browse` 或 `/qa` → verification
- **大任务**：跨模块、共享逻辑、新架构、公共 API 变更。
  - 完整闭环：OpenSpec `/opsx:propose` → brainstorming → writing-plans → `/plan-*-review` → executing-plans + worktrees + TDD → `/qa` → verification → code-review → finishing-branch → `/ship` → `/land-and-deploy` → `/canary`

## 五、浏览器使用规则

- `/browse` 是唯一的浏览器操作入口。
- 禁止使用 `mcp__claude-in-chrome__*` 和 `mcp__computer-use__*` 来操作浏览器。

## 六、Subagent 调度策略

### 一定派子代理的场景

- 用户明确要求「并行 /parallel/dispatch」
- 2-4 个边界清晰、可独立验证、无共享状态的子任务
- 纯只读的多目标调研任务

### 一定不派子代理的场景

- 任务存在明确顺序依赖
- 多个子任务修改同一文件 / 契约 / 共享类型
- 修改 package.json / lockfile / 根配置 / CI / schema / 总入口文件，默认串行执行
- 单一目标的 bug 修复
- 根因尚未明确的调试任务

## 七、安全护栏

- 执行 `rm -rf /`、`DROP TABLE`、`force-push`、`git reset --hard`、`kubectl delete` 等高风险命令前，必须先经过 `/careful` 或 `/guard` 校验。
- 调试敏感模块时，使用 `/freeze` 限定可修改范围。
- `/ship` 和 `/land-and-deploy` 必须获得用户明确确认后才可执行。
- 密钥、凭证、API Key 禁止硬编码到代码或配置中。
- 数据库访问必须使用参数化查询。
- 禁止用不可信输入拼接 shell 命令或 SQL 语句。

## 八、变更交付门禁

声明任务完成、准备 commit / push / PR 之前，必须满足：

1. 已完成相关验证，并如实报告验证结果
2. 已通过对应等级的质量门禁（review /verification）
3. 关键验证无法执行时，必须明确说明原因与风险
4. 禁止虚构命令输出与验证结果
5. 没有验证证据，不得声称「通过」「完成」

## 九、工具复用原则

禁止重复造轮子，严格按以下分工调用工具：

- **需求分析、提案编写**：只用 `/opsx:propose`，产出 proposal / design / tasks 文档
- **流程与编码**：只用 superpowers，覆盖 plan / brainstorming / writing-plans / executing-plans / TDD / debugging / verification / code review / subagent / worktrees / 分支收尾
- **执行与交付**：只用 gstack，覆盖浏览器、QA、ship、deploy、canary、retro、document-release、多视角 plan review、危险命令护栏、安全审计、design-consultation、investigate

## 十、页面变更 UI/UX 强制规范

### 触发条件

凡属于以下范畴的变更，均判定为「涉及页面的变更」，必须强制执行本流程：

- 新增、删除、重构前端页面
- 调整页面布局、视觉样式、组件排版
- 修改用户交互流程、表单逻辑、页面跳转链路
- 改版整体视觉风格、配色体系、字体与间距规范
- 新增面向用户的可视化模块、数据展示组件

纯后端逻辑、接口字段、配置项、内部脚本等不直接影响前端页面呈现的变更，不受本规则约束。

### 执行时机与流程衔接

- **插入节点**：在 OpenSpec 产出 design.md 之后、superpowers 启动编码执行之前，强制插入本流程。
- **调用要求**：必须调用 `ui-ux-pro-max` skill，基于 design.md 中的页面设计描述，输出优化后的 UI 实现提示词与完整交互规范。
- **归档方式**：优化结果输出为 `openspec/changes/本次变更目录/ui-spec.md`，作为 design.md 的正式补充附件，一同作为 superpowers 前端编码的输入依据。
- **变更回溯**：编码阶段如对页面实现方案有调整，必须先回退更新 `ui-spec.md`，再继续执行开发，禁止偏离规范直接实现。

### 输出标准

`ui-spec.md` 必须包含且不限于以下内容，确保可直接作为前端实现的精准输入：

- 页面核心目标与用户使用场景
- 完整的页面结构分层与组件排布顺序
- 统一视觉规范（配色、字号、间距、圆角、阴影体系）
- 全量交互状态（常态、悬停、点击、加载、空态、错误态）
- 响应式适配规则（桌面端、平板、移动端断点与布局变化）
- 无障碍与易用性优化要点

### 与任务分流体系的对应

- **轻量任务**：涉及页面变更时，先调用 `ui-ux-pro-max` 输出精简版 ui-spec，再进行代码实现与定向验证。
- **中任务**：OpenSpec 提案 → `ui-ux-pro-max` 补充 ui-spec → superpowers 编码 → gstack 浏览器效果核验
- **大任务**：完整闭环中，在 design 评审通过后、writing-plans 启动前，插入 `ui-ux-pro-max` 专项输出，作为所有前端实现任务的强制输入。

### 验证环节

所有页面变更完成后，必须通过 `/browse` 进行实际效果核验，对照 ui-spec 确认实现一致性，否则不得进入交付环节。

## 执行总纲

本规范为所有开发协作的最高优先级规则，所有操作不得违背上述约束。遇到规则未覆盖的场景，按「最短路径 + 证据优先」原则处理，并同步更新规范文档。
