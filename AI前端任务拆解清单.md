# AI 前端任务拆解清单（按文件到函数级别）

日期：2026-04-09  
范围：仅前端改造（不改后端）  
前置文档：AI前端接入方案-仅前端.md

## 1. 实施顺序（建议）

1. 先搭 AI 抽象层与 Mock（保证界面可联调）。
2. 再接入富文本“AI建议”。
3. 再接入“简历综合评估入口”。
4. 最后接真实模型 provider、错误处理与体验收尾。

## 2. 任务总览（里程碑）

### M1：AI 基础层（Provider + Prompt + 类型）

1. 新建 `src/ai/types.ts`
2. 新建 `src/ai/prompts.ts`
3. 新建 `src/ai/provider.ts`
4. 新建 `src/ai/mockProvider.ts`
5. 新建 `src/ai/openaiCompatibleProvider.ts`
6. 新建 `src/ai/index.ts`

### M2：富文本 AI 建议

1. 修改 `src/components/common/RichTextEditor.tsx`
2. 新建 `src/components/common/ai/AISuggestionPanel.tsx`
3. 新建 `src/hooks/useAISuggest.ts`

### M3：简历综合评估入口

1. 修改 `src/components/layout/RightPanel.tsx`
2. 新建 `src/components/layout/ai/ResumeScoreDrawer.tsx`
3. 新建 `src/hooks/useResumeEvaluation.ts`

### M4：配置、降级与体验

1. 新建 `src/ai/config.ts`
2. 修改 `src/main.tsx` 或等效入口（注入全局配置）
3. 补齐 loading/error/retry 与本地缓存

## 3. 文件级任务清单（含函数级）

## 3.1 `src/ai/types.ts`

目标：统一 AI 输入输出类型，隔离业务组件与模型厂商差异。

新增内容：
1. 类型 `AIProviderMode = 'mock' | 'openai-compatible'`
2. 类型 `RichTextSuggestInput`
3. 类型 `RichTextSuggestionItem`
4. 类型 `RichTextSuggestOutput`
5. 类型 `ResumeEvaluateInput`
6. 类型 `ResumeEvaluationDimension`
7. 类型 `ResumeEvaluationIssue`
8. 类型 `ResumeEvaluateOutput`
9. 接口 `AIProvider`

验收：
1. 业务层不直接使用 `fetch` 的原始响应类型。
2. 组件仅依赖 `types.ts` 的结构。

## 3.2 `src/ai/prompts.ts`

目标：集中维护 Prompt 文本，避免散落组件。

新增函数：
1. `buildRichTextSuggestPrompt(input)`
2. `buildResumeEvaluatePrompt(input)`
3. `sanitizeAIText(text)`

注意点：
1. Prompt 强制要求 JSON 输出。
2. 根据 `resume.locale` 注入中英文要求。

验收：
1. `mock` 与真实 provider 都使用同一套 prompt 入口。

## 3.3 `src/ai/provider.ts`

目标：统一 provider 创建逻辑。

新增函数：
1. `createAIProvider(config)`
2. `assertProviderConfig(config)`

验收：
1. `mode=mock` 时不依赖任何远程配置。
2. 配置缺失时抛出可读错误信息。

## 3.4 `src/ai/mockProvider.ts`

目标：先跑通 UI，无需真实模型。

新增函数：
1. `suggestForRichText(input)`
2. `evaluateResume(input)`

验收：
1. 返回固定结构 mock 数据，字段完整。
2. 可模拟延迟（例如 800-1200ms）。

## 3.5 `src/ai/openaiCompatibleProvider.ts`

目标：对接兼容 OpenAI 的前端直连能力（仅开发/内测）。

新增函数：
1. `callChatCompletions(payload)`
2. `parseSuggestResponse(responseText)`
3. `parseEvaluateResponse(responseText)`
4. `suggestForRichText(input)`
5. `evaluateResume(input)`

验收：
1. 非法 JSON 响应能识别并返回统一错误。
2. 超时、网络错误、429 均有可读错误码映射。

## 3.6 `src/ai/index.ts`

目标：聚合对外导出，减少业务导入路径。

新增内容：
1. 导出 `types`
2. 导出 `createAIProvider`

验收：
1. 业务代码仅从 `src/ai/index.ts` 引用。

## 3.7 `src/hooks/useAISuggest.ts`

目标：承载富文本建议请求状态与频控。

新增函数/状态：
1. `useAISuggest(provider)`
2. 状态：`loading`, `error`, `data`
3. 方法：`runSuggest(input)`, `resetSuggest()`
4. 2 秒重复触发拦截（可选）

验收：
1. 组件内无复杂异步逻辑。
2. 请求取消或重复触发有保护。

## 3.8 `src/components/common/ai/AISuggestionPanel.tsx`

目标：展示建议列表并支持“应用建议”。

新增 Props：
1. `open`
2. `suggestions`
3. `onApplySuggestion(rewrite)`
4. `onClose`
5. `loading` / `error`

新增交互函数：
1. `handleApply(item)`
2. `handleRetry()`

验收：
1. 最少支持“替换选中内容”和“复制建议”。
2. 面板关闭后不污染编辑器内容。

## 3.9 `src/components/common/RichTextEditor.tsx`

目标：接入 AI 建议入口。

修改点（建议函数级）：
1. 扩展 `RichTextEditorProps`：
   - `enableAISuggest?: boolean`
   - `aiContext?: { moduleType?: string; targetPosition?: string; language?: string }`
2. 新增状态：
   - `aiPanelOpen`
   - `aiRequestText`
3. 新增函数：
   - `getSelectionOrFullText()`
   - `handleOpenAISuggest()`
   - `handleApplyAISuggestion(rewrite)`
4. 工具栏追加“AI建议”按钮。

验收：
1. 点击“AI建议”可弹出建议面板。
2. 应用建议后触发原有 `onChange`，不破坏现有富文本功能（加粗/链接等）。

## 3.10 `src/hooks/useResumeEvaluation.ts`

目标：承载整份简历评估请求。

新增函数/状态：
1. `useResumeEvaluation(provider)`
2. 状态：`loading`, `error`, `result`
3. 方法：`runEvaluate(resume)`, `resetEvaluate()`

验收：
1. 重复点击评估时可防抖或忽略并发。
2. 错误信息可给 UI 直接显示。

## 3.11 `src/components/layout/ai/ResumeScoreDrawer.tsx`

目标：展示综合评分结果。

新增 Props：
1. `open`
2. `result`
3. `loading` / `error`
4. `onClose`
5. `onJumpToModule(moduleType)`

新增展示块：
1. 总分 + 等级
2. 维度评分
3. 问题列表
4. 优化建议行动项

验收：
1. 无结果时有空态。
2. 错误时有重试入口。

## 3.12 `src/components/layout/RightPanel.tsx`

目标：提供统一“AI评估”入口。

修改点：
1. 顶部操作栏新增“AI评估”按钮（与“预览/导出PDF”同级）。
2. 引入 `useResumeEvaluation`。
3. 引入 `ResumeScoreDrawer`。
4. 新增函数：
   - `handleEvaluateResume()`
   - `handleJumpToIssueModule(moduleType)`（触发 `setActiveModule`）

验收：
1. 任意时刻可触发综合评估。
2. 抽屉中点击问题可跳转对应模块编辑。

## 3.13 `src/ai/config.ts`

目标：集中读取 Vite 环境变量。

新增函数：
1. `getAIConfigFromEnv()`
2. `validateAIConfig(config)`

环境变量建议：
1. `VITE_AI_MODE=mock|openai-compatible`
2. `VITE_AI_BASE_URL=`
3. `VITE_AI_MODEL=`
4. `VITE_AI_API_KEY=`（仅开发测试）

验收：
1. 缺省配置自动降级到 `mock`。

## 3.14 `src/main.tsx`（或等效入口）

目标：初始化 AI provider（可通过 Context 提供）。

修改点：
1. 创建 `aiProvider` 实例。
2. 挂载 `AIProviderContext`。

验收：
1. 所有 AI 组件统一获取 provider，不重复初始化。

## 4. 联调检查清单

1. `mock` 模式：
   - 富文本建议可触发、可应用。
   - 综合评估可展示完整结构。
2. `openai-compatible` 模式：
   - 请求可发出并能解析 JSON。
   - 异常时正确提示。
3. 回归点：
   - 富文本原有格式按钮不受影响。
   - 右栏“设置/预览/导出”功能不受影响。

## 5. DoD（完成定义）

1. 至少完成 `M1 + M2 + M3` 的主流程可用。
2. 所有新组件具备空态、加载态、错误态。
3. AI 输出仅在用户确认后写回表单，不自动覆盖。
4. 代码通过现有构建与类型检查。

## 6. 建议工时（仅前端）

1. M1：0.5 - 1 人日
2. M2：1 - 1.5 人日
3. M3：1 - 1.5 人日
4. M4：0.5 - 1 人日

总计：约 3 - 5 人日
