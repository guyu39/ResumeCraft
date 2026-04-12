# ResumeCraft AI 接入方案（仅前端）

文档版本：v1.0  
日期：2026-04-09  
范围：仅前端接入，不改后端代码

## 1. 目标

1. 在富文本编辑时提供实时写作建议（语句优化、量化表达、专业术语替换）。
2. 在简历填写后提供一个统一入口，触发 AI 综合评估“专业度”，并给出可执行优化建议。
3. 在不改后端的前提下完成前端可运行方案，支持后续无缝切换到后端代理模式。

## 2. 非目标

1. 不在本期实现后端 AI 网关。
2. 不实现服务端缓存、审计、计费和权限控制。
3. 不实现简历自动改写落库（先给建议，不自动覆盖）。

## 3. 当前项目接入点（基于现有代码）

1. 富文本编辑组件：`src/components/common/RichTextEditor.tsx`
2. 表单主入口与全局操作栏：`src/components/layout/RightPanel.tsx`
3. 简历数据结构：`src/types/resume.ts`
4. 状态来源：`src/store/resumeStore.ts`

## 4. 前端架构设计

### 4.1 AI 适配层（Provider 抽象）

新增前端服务层，统一封装 AI 调用，避免业务组件直接依赖具体模型厂商。

建议文件：

```text
src/ai/
  types.ts
  prompts.ts
  provider.ts
  openaiCompatibleProvider.ts
  mockProvider.ts
  index.ts
```

核心接口（示意）：

```ts
interface AIProvider {
  suggestForRichText(input: RichTextSuggestInput): Promise<RichTextSuggestOutput>
  evaluateResume(input: ResumeEvaluateInput): Promise<ResumeEvaluateOutput>
}
```

### 4.2 模式切换

1. `mock`：本地假数据，供 UI 联调。
2. `openai-compatible`：前端直连兼容接口（仅开发期可用）。
3. 后续可扩展：`backend-proxy`（切到后端网关时零侵入）。

建议环境变量：

```env
VITE_AI_MODE=mock
VITE_AI_BASE_URL=
VITE_AI_MODEL=
```

说明：
1. 若是前端直连第三方接口，不建议内置固定密钥。开发联调可使用“用户自行输入 API Key（仅本地存储）”。
2. 生产环境应迁移到后端代理，避免密钥泄露和滥用。

## 5. 功能一：富文本编辑 AI 建议

### 5.1 交互位置

在 `RichTextEditor` 工具栏右侧新增“AI建议”按钮。

### 5.2 触发方式

1. 选中文本后点击：针对选区优化。
2. 未选中时点击：针对当前整段优化。

### 5.3 建议展示

1. 侧边浮层（推荐）：显示 3-5 条建议，每条含“原因 + 改写结果”。
2. 支持“替换选中内容”“插入到光标处”“复制建议”。

### 5.4 请求输入（前端）

```json
{
  "moduleType": "work|project|summary|custom",
  "rawText": "...",
  "targetPosition": "前端开发",
  "tone": "professional",
  "language": "zh-CN"
}
```

### 5.5 返回输出（前端统一结构）

```json
{
  "suggestions": [
    {
      "title": "强化结果导向",
      "reason": "原句偏描述过程，缺少产出指标",
      "rewrite": "负责xxx，推动xxx，最终将xxx提升30%"
    }
  ]
}
```

### 5.6 节流与防抖

1. 点击触发，不做每次输入自动请求（避免抖动和成本飙升）。
2. 同一模块 2 秒内重复请求直接拦截。

## 6. 功能二：简历综合评估入口

### 6.1 入口位置

在 `RightPanel` 顶部操作区新增按钮：`AI评估`（与“预览/导出PDF”同级）。

### 6.2 评估内容

1. 专业度总分（0-100）
2. 分维度评分：
   - 信息完整度
   - 表达专业度
   - 量化成果度
   - 结构清晰度
   - 岗位匹配度
3. Top 问题清单（按优先级）
4. 可执行建议（可落地到模块）

### 6.3 输出结构（前端统一）

```json
{
  "score": 78,
  "level": "良好",
  "dimensions": [
    { "name": "信息完整度", "score": 82 },
    { "name": "量化成果度", "score": 63 }
  ],
  "highlights": ["项目经历较完整", "模板风格统一"],
  "issues": [
    {
      "severity": "high",
      "moduleType": "work",
      "title": "缺少量化指标",
      "advice": "每段经历补充1-2个可验证数字"
    }
  ],
  "nextActions": [
    "将最近一段工作经历改为 STAR 结构",
    "在项目经历补充性能/效率数据"
  ]
}
```

### 6.4 评估面板

建议使用弹窗或抽屉：
1. 顶部展示总分与等级。
2. 中间展示维度雷达/条形图（可后续增强）。
3. 底部建议支持“跳转模块编辑”。

## 7. Prompt 规范（前端维护）

在 `src/ai/prompts.ts` 统一管理：
1. 富文本建议 Prompt：强调“简历语境、结果导向、避免空话”。
2. 综合评估 Prompt：输出强制 JSON，字段固定，避免自然语言散乱。
3. 语言参数：根据 `resume.locale` 注入 `zh-CN / en-US`。

约束：
1. 只返回建议，不生成虚构经历。
2. 不修改候选人事实信息。
3. 避免绝对化结论。

## 8. 前端状态与数据流

1. 建议不直接写入 store，先由组件内临时状态承载。
2. 用户确认后再调用现有 `onChange` 写回模块字段。
3. 综合评估结果可临时缓存（`sessionStorage`），避免重复请求。

## 9. 错误处理与降级

1. 超时：10-20 秒超时，提示“AI繁忙，请重试”。
2. 非法响应：JSON 解析失败时显示“结果格式异常”。
3. 配置缺失：无可用 AI 配置时自动回退 `mock`。
4. 手动重试：所有失败提示均提供“重试”按钮。

## 10. 安全与隐私（前端阶段）

1. 默认不记录 AI 原始响应到持久化简历数据。
2. 若用户手动提供 API Key，只存本地（`localStorage`）并提供“一键清除”。
3. 明示提示：当前为前端直连模式，仅用于开发/内测。

## 11. 分阶段落地计划（仅前端）

### Phase A（UI 骨架）

1. 接入 `mockProvider`。
2. `RichTextEditor` 增加“AI建议”按钮与建议面板。
3. `RightPanel` 增加“AI评估”入口与评估弹层。

### Phase B（真实模型接入）

1. 增加 `openai-compatible provider`。
2. 增加模型请求超时、重试、格式校验。
3. 增加建议应用回写逻辑（替换/插入）。

### Phase C（体验打磨）

1. 建议可按“严谨/简洁/结果导向”切换风格。
2. 评估结果支持“跳转定位到对应模块”。
3. 增加调用频控与本地缓存。

## 12. 验收标准

1. 在任一富文本模块可触发 AI 建议并展示结果。
2. 用户可将建议一键应用到编辑器内容。
3. 点击 `AI评估` 可得到总分、维度分和建议列表。
4. 接口异常时有明确错误提示且不影响原有编辑流程。
5. 在 `mock` 和 `openai-compatible` 两种模式可切换运行。

## 13. 后续迁移建议（非本期）

1. 把 AI 调用迁移到后端代理，隐藏密钥。
2. 增加日志审计、配额控制、敏感词过滤。
3. 引入缓存与模板化 Prompt 管理平台。
