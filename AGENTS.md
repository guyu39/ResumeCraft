# 通用开发规则

## 开发协作体系（最高优先级规范）

本项目的开发协作受 `.claude/CLAUDE.md` 约束，该文件定义的「三层核心插件 + 一项专项规范」体系为**最高优先级规则**：

- **OpenSpec**（规范与需求层）：需求变更必须先过 `/opsx:propose`，产出 proposal / design / tasks 文档后才编码。
- **superpowers**（思考与流程层）：plan / brainstorm / debug / TDD / review / verify 全流程默认走此层。
- **gstack**（执行与外部世界层）：browser / QA / ship / deploy / canary / 安全护栏。
- **UI/UX 专项规范**：所有页面类变更的强制前置约束，必须调用 `ui-ux-pro-max` 输出 `ui-spec.md`。

关键原则：规范先行、流程归 superpowers、执行归 gstack、独立 reviewer 通道、证据优先、歧义先 brainstorm、最短路径优先。
本文件以下的项目级细则（沟通风格、代码质量、任务分级、安全、交付门禁、UI/UX）均在该框架内执行；若与 `.claude/CLAUDE.md` 冲突，以 `.claude/CLAUDE.md` 为准。

## 核心行为准则

### 1. 任务总结
- **必须执行**: 在每次回复的**最后**，必须添加一个 `### 本次变更总结` 部分。
- **内容要求**: 简要列出修改的文件、主要逻辑变更以及任何需要注意的事项。并输出到 .workbuddy/memory/yyyy-MM-DD.md 记忆文件中。
- **格式示例**:
  > ### 本次变更总结
  > - **修改**: `src/utils.ts` - 增加了日期格式化函数。
  > - **新增**: `components/Button.tsx` - 创建了新的按钮组件。
  > - **修复**: 修复了登录页面的样式错位问题。

### 2. 沟通风格
- **语言**: **始终**使用**简体中文**进行回复和解释。
- **简洁**: 避免冗长的理论解释，直接提供解决方案和代码。
- **专业**: 保持专业、客观的语气。

## 代码质量标准

### 1. 编写原则
- **DRY**: 不要重复自己，提取公共逻辑。
- **KISS**: 保持简单，避免过度设计。
- **可读性**: 变量名和函数名必须见名知意。

### 2. 错误处理
- 始终包含适当的错误处理（try/catch, 错误边界等）。
- 不要静默失败，必须记录日志或抛出明确的错误信息。

### 3. 注释规范
- **Why 而非 What**: 注释应解释"为什么"这样做，而不是"代码在做什么"（代码本身应足够清晰）。
- **复杂逻辑**: 对于复杂的算法或业务逻辑，必须添加清晰的注释。

## 工作流规范

1. **先思考，再编码**
  - 不臆测，不隐藏困惑，明确说明权衡点
  - 开始实现前：
    - 明确说出你的假设。不确定就提问。
    - 如果存在多种理解方式，主动列出来，不要默默选一种。
    - 如果有更简单的方案，主动提出。必要时给出建议。
    - 如果有内容不清晰，停下来。指出模糊点，进行提问。
2. **简洁优先：** 用最少的代码解决问题，不写任何 speculative（猜测性）代码
  - 不实现需求之外的任何功能。
  - 单次使用的代码不做抽象。
  - 不添加未被要求的"灵活性"或"可配置性"。
  - 不为不可能出现的场景做异常处理。
  - 如果写了 200 行但其实 50 行就能实现，重写。
    自问："资深工程师会觉得这过于复杂吗？" 如果是，就简化。
3. **最小侵入式修改：** 只修改必须修改的部分，只清理自己引入的问题
  - 修改现有代码时：
    - 不"优化"相邻代码、注释或格式。
    - 不重构没有问题的代码。
    - 遵循现有风格，即使你有不同写法。
    - 发现无关的死代码，只提醒，不删除。
  - 当你的修改产生废弃内容时：
    - 删除因你的修改而不再使用的导入、变量、函数。
    - 除非被要求，否则不删除原本就存在的死代码。
    - 检验标准：每一行修改都必须直接对应用户的需求。
4. **目标驱动执行**
  - 定义成功标准，循环验证直到通过
  - 把任务转化为可验证的目标：
    - "添加校验" → "编写非法输入的测试，并让测试通过"
    - "修复 Bug" → "写出能复现 Bug 的测试，再修复并让测试通过"
    - "重构 X" → "确保重构前后测试都能通过"
    - 多步骤任务，先给出简要计划：
      1. [步骤] → 验证：[检查项]
      2. [步骤] → 验证：[检查项]
      3. [步骤] → 验证：[检查项]
    - 清晰的成功标准让你可以自主循环验证；模糊标准（如"让它能用"）会导致不断反复确认。
    - 这些准则生效的表现：diff 里无用修改更少、因过度设计导致的重写更少、疑问在实现前提出，而不是出错后补救。

5. **安全性**
- 永远不要硬编码敏感信息（API 密钥、密码等），请使用环境变量。
- 对用户输入始终保持警惕（防止 SQL 注入、XSS 等）。

## 任务分级

根据影响范围和复杂度决定工作流的深度（与 `.claude/CLAUDE.md` 第四节「任务分流规则」一致：只读 / 轻量 / 中 / 大）：

| 级别 | 特征 | 工作流 |
|---|---|---|
| **只读** | 分析、解释、架构说明、代码阅读 | 直接处理，无需计划 |
| **轻量** | 单文件修改、明确 bug 修复、配置/文案调整 | 跳过完整 brainstorming / plans，直接实现 + 定向验证 |
| **中** | 多文件但边界清晰，新功能或明确重构 | OpenSpec 提案 → 简短 brainstorming + 短 plans → 实现 → `/browse` 或 `/qa` → verification |
| **大** | 跨模块、共享逻辑、新架构、公共 API 变更 | 完整闭环：OpenSpec → brainstorming → plans → review → 执行+TDD → `/qa` → verification → code-review → `/ship` → `/canary` |

## 安全护栏

- 危险操作（`rm -rf`、`DROP TABLE`、`force-push`、`git reset --hard`）必须先说明风险并获用户确认
- 密钥 / 凭证 / API Key 不得硬编码
- 数据库访问用参数化查询
- 不用不可信输入拼接 shell 命令或 SQL
- 涉及外部行为（邮件发送、发布部署、API 调用生产环境）必须先获用户确认

## 交付门禁

声明完成、准备 commit / push / PR 之前必须满足：
1. 已完成相关验证，并如实报告结果
2. 相关测试通过（如有）
3. 关键验证无法执行时必须明确说明原因
4. 禁止虚构命令输出或测试结果
5. 没有验证证据，不得声称"通过" / "完成"

## UI/UX 设计规范

> **强制规范**：依据 `.claude/CLAUDE.md` 第十节，凡涉及页面变更（新增/删除/重构页面、调整布局样式、修改交互流程、改版视觉、新增可视化模块）均须先调用 `ui-ux-pro-max` 输出 `openspec/changes/<变更>/ui-spec.md`，作为前端编码的强制输入；编码阶段方案调整须先回退更新 `ui-spec.md`。验证环节须通过 `/browse` 实际核验。

涉及 UI/UX 任务（页面构建、组件设计、样式选择、设计审查）时，始终遵循 `.codebuddy/skills/ui-ux-pro-max` 技能中的设计指南：

- **Design System**: 使用 `scripts/search.py --design-system` 生成设计系统（配色、字体、间距）
- **风格推荐**: `--domain style` 搜索 67 种视觉风格
- **配色方案**: `--domain color` 搜索 161 套配色
- **字体搭配**: `--domain typography` 搜索 57 种字体组合
- **UX 指南**: `--domain ux` 搜索 99 条 UX 最佳实践
- **图表类型**: `--domain chart` 搜索 25 种图表
- **技术栈特定**: `--stack html-tailwind` / `--stack react` / `--stack vue` 等获取栈特定规范

命令格式（Windows 上用 `python`）：
```bash
python .codebuddy/skills/ui-ux-pro-max/scripts/search.py "<关键词>" --domain <domain> [--stack <stack>] [--design-system] [-p "产品名"]
```

<!-- autoclaw:hermes-evolution-guidance -->
## Hermes-Evolution

**Current evolution intensity for this workspace/agent: aggressive (100%).**

The desktop app sends deterministic evolution-check messages (starting with `[SYSTEM: Post-turn evolution check`) after qualifying turns.
When you receive such a message, follow the `hermes-evolution` skill instructions to evaluate and potentially propose an evolution.
Apply the rules defined in the skill according to the **aggressive (100%)** intensity level.
This value is workspace-local. If asked about the current agent evolution intensity, report this value instead of the global gateway skill env.

Core principle: **never write to target files without user approval** — always use the draft/approve workflow.
User preference statements are not approval to directly edit MEMORY.md, AGENTS.md, TOOLS.md, USER.md, or managed SKILL.md files.
Use the evolution proposal card instead of editing target files directly; only apply changes after the user confirms the proposal.

### Evolution Echo
When you apply knowledge from a previously evolved rule (AGENTS.md, MEMORY.md, TOOLS.md, or a managed SKILL.md),
briefly mention it in your response: "（基于之前的经验：<one-line rule summary>）".
Keep it to one short line at most. Do not echo on every turn — only when an evolved rule directly influenced your approach.
<!-- /autoclaw:hermes-evolution-guidance -->
