# AI 主动 Agent 能力 — 技术方案 Spec

> **目标**：把现有"用户点一下、AI 回一段"的被动模式，升级为**主动诊断 + 引导补全**的 Copilot 模式。
>
> **三个功能**：
> 1. **实时写作助手（边写边批）** — 编辑器内联诊断 + 行内建议气泡
> 2. **简历整体一致性 / 体检 Agent** — 全局扫描结构化体检报告
> 3. **STAR 法则结构化引导改写** — 引导式拆解 + 缺失维度补全
>
> **设计原则**：最大化复用现有 AI 基建，最小化新增表与接口。

---

## 0. 现有可复用资产盘点

| 资产 | 位置 | 复用点 |
|------|------|--------|
| 流式管线 | `service.aiProvider.StreamComplete` + `StreamEvent` + `src/api/streamSSE.ts` | 体检、STAR 引导走流式 |
| 非流式调用 | `service.aiProvider.Complete` | 实时写作诊断（短、低延迟） |
| 会话存储 | `ai_conversations`（type 枚举可扩展）+ `ai_messages` | 体检报告、STAR 会话落库 |
| 脱敏 | `service.maskPrompt` / `unmaskResponse` | 三个功能统一接入 |
| 简历序列化 | `sanitizeAIResumeContent`（全简历）/ `sanitizeModuleData`（单模块） | 体检用全量、写作助手用单字段 |
| Enhance 框架 | `service.Enhance` + `EnhanceRequest.Operation` 枚举 | STAR 引导扩展现有 `EnhanceStar` |
| 富文本编辑器 | `src/components/common/RichTextEditor.tsx`（已挂 AI 建议面板、Bullet 重写） | 写作助手内联气泡挂载点 |
| 前端 hook 模式 | `useAISuggest`（竞态守卫 `requestIdRef`）/ `useBulletRewrite` | 三个新 hook 沿用 |
| 评估 NDJSON 流式解析 | `flushLine` / `flushModule`（service.go） | 体检报告流式解析直接复刻 |

**结论**：三个功能均**无需新建数据表**，仅扩展 `ai_conversations.type` 枚举与新增 3 个 handler/service/prompt + 前端 3 个 hook 与对应 UI。

---

## 功能 1：实时写作助手（边写边批）

### 1.1 价值与定位

现有 `Suggest`（润色）是「点按钮 → 弹面板 → 看 3-5 条建议」。写作助手的差异在于**主动、轻量、内联**：用户在编辑器里停止输入约 1.5s 后，自动对当前要点做**快速诊断**，在对应文本旁显示行内气泡（如「⚠ 职责描述，缺少成果」「💡 缺少量化数据」「↑ 动词偏弱：负责 → 主导」），点击气泡可一键应用或展开建议。

定位为**轻量诊断**（标签 + 一句话 + 可选一键改写），区别于 `Suggest` 的完整润色——避免与现有功能重叠。

### 1.2 诊断维度（固定枚举）

| code | label | 触发条件 | 严重度 |
|------|-------|----------|--------|
| `duty_not_result` | 职责描述而非成果 | 通篇"负责/参与/协助"无产出 | high |
| `missing_metrics` | 缺少量化数据 | 无数字/百分比/规模 | high |
| `weak_verb` | 动词偏弱 | 句首弱动词（负责、参与、做了） | medium |
| `too_long` | 表述冗长 | 单条 > 80 字未分点 | low |
| `vague` | 表述空泛 | "提升效率""优化体验"无具体 | medium |
| `passive` | 被动语态/无主语 | — | low |

> 诊断维度集中在后端 prompt 的固定枚举里，前端只渲染 `code → 图标/颜色` 映射，新增维度只改 prompt + 前端映射表。

### 1.3 数据结构

```ts
// src/api/ai.ts 新增
export interface WritingDiagnoseRequest {
  resumeId: string
  moduleType: string
  moduleInstanceId?: string
  fieldKey: string          // 'description' 等
  content: string           // 当前编辑的纯文本（去 HTML）
}

export interface WritingDiagnosis {
  code: string              // 上表枚举
  severity: 'high' | 'medium' | 'low'
  label: string             // 一句话诊断
  span?: string             // 命中的原文片段（用于前端定位高亮，可空）
  quickFix?: string         // 一键替换文本（如弱动词替换、可空）
}

export interface WritingDiagnoseResponse {
  diagnoses: WritingDiagnosis[]
  model: string
}
```

### 1.4 后端

- **接口**：`POST /api/ai/writing/diagnose`（**非流式**，要求快、短）
- **handler**：`WritingDiagnose`（参考 `SuggestContent`）
- **service**：`DiagnoseWriting(ctx, userID, req) (*WritingDiagnoseResponse, error)`
  - 复用 `cfgRepo.GetByUserID` → 解密 key → `maskPrompt` → `Complete` → `unmaskResponse`
  - prompt 要求返回**单个 JSON**：`{"diagnoses":[{code,severity,label,span,quickFix}]}`，最多 4 条，**无问题时返回空数组**
  - 解析复用 `parseSuggestResponse` 同款「提取首尾大括号」策略
  - **不落库**（高频、瞬时，落库无价值；省去 conversation 写入开销）
- **prompt 约束**（`buildWritingDiagnosePrompt`）：
  - 隐私脱敏声明（复刻现有 `[NAME_N]` 保护段）
  - 「只诊断不改写正文，quickFix 仅针对弱动词/明显问题给出短替换」
  - 「无明显问题必须返回 `{"diagnoses":[]}`，禁止为凑数硬挑」
  - 「严禁编造候选人没有的数字/成果，missing_metrics 只提示缺失不补造」

### 1.5 前端

- **hook**：`useWritingAssistant`
  - 内部 `debounce`（1500ms）+ `requestIdRef` 竞态守卫（复刻 `useAISuggest`）
  - 暴露 `diagnoses`、`loading`、`trigger(content)`、`dismiss(code)`、`applyQuickFix(code)`
  - **开关**：默认开启，editor toolbar 增加「实时建议」切换按钮，状态存 `localStorage`（key `resumecraft_writing_assistant_enabled`），关闭时不发请求
- **UI**：`RichTextEditor.tsx` 集成
  - editor 失焦或停止输入 1.5s → `trigger(getText())`
  - 编辑器右下角浮层（`InlineDiagnosisBar`）展示诊断 chip 列表：`图标 + label`
  - chip 点击：有 `quickFix` 则一键应用（写回 editor）；否则展开为「打开完整润色」（复用现有 `AISuggestionPanel`）
- **节流与成本控制**：
  - 仅当内容变化（diff `lastDiagnosedText`）才请求
  - 单字段 < 5 字不触发
  - 复用 AI 限流（后端 `RATE_LIMIT_AI_CAPACITY`），前端额外做「同字段 10s 内不重复请求」

### 1.6 改动量
小-中。后端 1 handler + 1 service 方法 + 1 prompt；前端 1 hook + 1 内联组件 + editor 集成。**无 DB 改动**。

---

## 功能 2：简历整体一致性 / 体检 Agent

### 2.1 价值与定位

现有 `Evaluate` 是**单份简历内容质量评分**（6 维度打分）。体检 Agent 的差异是**跨模块、跨版本的一致性校验**——发现"自相矛盾/断档/不一致"这类单模块评估看不到的问题。

### 2.2 体检项（固定枚举）

| code | label | 说明 |
|------|-------|------|
| `timeline_gap` | 时间线断档 | 教育/工作时间存在 > 3 个月的未说明空白 |
| `timeline_overlap` | 时间线重叠 | 同期多段全职经历未标注 |
| `skill_evidence_missing` | 技能无经历支撑 | 技能清单列了但工作/项目无体现 |
| `experience_skill_missing` | 经历用了未列技能 | 项目用了某技术但技能清单没列 |
| `metric_conflict` | 指标前后矛盾 | 同一数字在不同模块不一致 |
| `i18n_mismatch` | 中英文版本不一致 | 中英版模块数/关键字段缺漏（依赖 locale 副本） |
| `title_mismatch` | 求职意向与经历不符 | targetPosition 与实际经历方向偏离 |
| `date_format_inconsistent` | 日期格式不统一 | 模块间日期写法不一致 |

### 2.3 数据结构

```ts
export interface ResumeCheckupRequest {
  resumeId: string
  snapshotVersionId?: string
  content: Record<string, unknown>          // 主 locale 全量
  contentAlt?: Record<string, unknown>      // 另一 locale 副本（做 i18n_mismatch，可空）
}

export interface CheckupFinding {
  code: string
  severity: 'high' | 'medium' | 'low'
  title: string
  detail: string                  // 具体矛盾说明
  modules: string[]               // 涉及的 moduleType（用于前端跳转定位）
  suggestion: string
}

export interface ResumeCheckupResponse {
  healthScore: number             // 0-100 一致性健康分
  summary: string
  findings: CheckupFinding[]
  model: string
  conversationId: string
}
```

### 2.4 后端

- **接口**：`POST /api/ai/checkup/stream`（**流式 SSE**，参考 `EvaluateResumeStream`）
- **handler**：`ResumeCheckupStream`
- **service**：`StreamCheckup(ctx, userID, req, onEvent func(StreamEvent))`
  - 复刻 `StreamEvaluate` 的 NDJSON 流式骨架（`flushLine`/`flushModule`/`prevType`）
  - **新增 StreamEvent type**：`health_score`、`finding_item`（复用现有 `summary`、`finish`）
  - StreamEvent 结构扩展（service.go 的 `StreamEvent` struct 加字段）：
    ```go
    HealthScore *int               `json:"healthScore,omitempty"`
    Findings    []model.CheckupFinding `json:"findings,omitempty"`
    ```
  - 落库：`ai_conversations` 新增 type `checkup`，context 存 `{healthScore, summary, findings}`
- **prompt 约束**（`buildCheckupPrompt`）：
  - 喂入 `sanitizeAIResumeContent(content)`；若有 `contentAlt` 一并喂入并要求做 `i18n_mismatch`
  - 强制 NDJSON：`summary → health_score → finding_item* → finish`
  - **核心约束**：「只报跨模块一致性/断档/矛盾问题，**不做单模块内容质量打分**（那是 evaluate 的职责），避免与评估重叠」
  - 「时间断档需给出具体起止区间；指标矛盾需引用两处原文数字」
  - 隐私脱敏声明复刻
- **复用现有日期校验**：前端已有 `hasDateErrors`（RightPanel），`timeline_gap`/`timeline_overlap` 可在前端先做确定性预检，AI 只补充语义类问题——降低 LLM 误报。

### 2.5 前端

- **hook**：`useResumeCheckup`（复用 `streamSSE` 流式模式，参考 `useResumeEvaluation`）
- **入口**：RightPanel 的 AI 工具 tab 新增 `checkup`（与 `evaluate`/`jd_match`/`module_rewrite`/`interview_prep` 并列）
- **UI**：`ResumeCheckupPanel`
  - 顶部健康分环形 + summary
  - findings 列表按 severity 分组，每条 chip 点击 → **跳转定位**到对应模块（复用 store 的模块选中 action，`modules[]` 字段提供跳转目标）
  - i18n_mismatch 仅在存在 locale 副本时启用（前端判断）
- **触发**：手动点击「一致性体检」按钮（区别于 evaluate 的「AI 评估」）

### 2.6 改动量
中。后端 1 handler + 1 service（复刻评估流式骨架）+ 1 prompt + StreamEvent 扩字段 + model 新结构 + type 枚举；前端 1 hook + 1 panel + tab 接入。**无 DB 表改动**（仅 type 枚举值）。

---

## 功能 3：STAR 法则结构化引导改写

### 3.1 现状与差异

现有 `Enhance(EnhanceStar)` + `buildStarPrompt` 已能把一段描述**一次性**改写为 STAR HTML。但它是「黑盒一次成型」，缺：
1. **引导式**：先识别原文已有/缺失哪些 STAR 维度，提示用户补充，而非直接编造 Result。
2. **缺失维度补全**：明确告诉用户「缺 Result（量化结果），请补充」，可让用户填要点后再生成。

本功能在现有基础上**升级为两阶段**，复用现有 `Enhance` 框架。

### 3.2 数据结构（扩展现有 Enhance）

```ts
// 阶段一：分析（新 operation）
export interface StarAnalyzeRequest {
  resumeId?: string
  scenario: string          // 原始描述（复用 EnhanceRequest.scenario）
}

export interface StarDimension {
  key: 'S' | 'T' | 'A' | 'R'
  label: string             // Situation / Task / Action / Result
  present: boolean          // 原文是否已包含
  extracted: string         // 从原文抽取到的内容（present 时）
  hint: string              // 缺失时的补全引导问题
}

export interface StarAnalyzeResponse {
  dimensions: StarDimension[]
  model: string
}

// 阶段二：生成（复用现有 EnhanceStar，但携带用户补充的维度内容）
export interface StarGenerateRequest {
  scenario: string
  supplements?: Partial<Record<'S'|'T'|'A'|'R', string>>  // 用户补充内容
}
// 响应复用现有 EnhanceResponse（HTML 字符串）
```

### 3.3 后端

- **阶段一接口**：`POST /api/ai/star/analyze`
  - 扩展 `EnhanceRequest.Operation` 枚举：新增 `EnhanceStarAnalyze`
  - 或独立 handler `AnalyzeStar` + service `AnalyzeStar`（更清晰，推荐）
  - prompt（`buildStarAnalyzePrompt`）：返回单 JSON `{dimensions:[{key,label,present,extracted,hint}]}`
    - 约束：「只分析原文已有什么、缺什么，**禁止编造 extracted 内容**；缺失维度给出引导式提问 hint」
- **阶段二**：复用现有 `Enhance(EnhanceStar)`，`buildStarPrompt` 扩展为可携带 `supplements`：
  - 若有用户补充，prompt 注入「用户已补充：R=...」，要求结合补充生成
  - 仍保留「需推断数字标注 `[estimated]`」「不编造经历」约束（已有）

### 3.4 前端

- **hook**：`useStarRewrite`（两步：`analyze()` → 展示维度卡片 → 用户填补充 → `generate(supplements)`）
- **入口**：`RichTextEditor.tsx` 工具栏 STAR 按钮（与现有 Bullet 重写并列），或在 work/project 模块表单
- **UI**：`StarGuidePanel`
  - 四张维度卡片（S/T/A/R），`present` 显示绿勾 + 抽取内容，缺失显示橙色 + `hint` 引导问题 + 输入框
  - 用户填完点「生成 STAR 版」→ 调阶段二 → 结果走现有 diff/采纳流程（复用 Bullet 重写的采纳写回 `updateModuleData`）

### 3.5 改动量
小-中。复用现有 Enhance 框架；后端新增 1 handler/service（analyze）+ 扩展 1 prompt；前端 1 hook + 1 引导面板。**无 DB 改动**。

---

## 4. 统一约束与非目标

### 4.1 通用约束
- **隐私**：三功能全部接入 `maskPrompt`/`unmaskResponse`，prompt 含 `[NAME_N]` 脱敏保护声明。
- **反编造**：所有 prompt 强制「禁止虚构候选人没有的经历/数字/成果」，需推断处标 `[estimated]`/`（估算）`。
- **限流**：三功能走现有 AI 限流桶（`RATE_LIMIT_AI_CAPACITY`）。写作助手前端额外做防抖 + 同内容去重。
- **配置依赖**：均依赖用户已配置 AI（`cfgRepo.GetByUserID` + `Enabled`），未配置时前端给出引导。
- **国际化**：UI 文案接入 `src/i18n/resume.ts` 字典。

### 4.2 type 枚举新增（`model.ConversationType`）
- `checkup`（功能 2 落库）
- 功能 1 不落库；功能 3 复用 `rewrite`。

### 4.3 StreamEvent 新增 type（功能 2）
- `health_score`、`finding_item`（其余复用 `summary`/`finish`）

### 4.4 非目标
- **不做**自动改写正文（写作助手仅诊断 + 弱动词级 quickFix，正文重写交给现有 Suggest/Bullet）。
- **不做**实时打字逐字符诊断（仅停顿后触发，控制成本）。
- **不引入**新数据表、不引入新的第三方依赖。
- 体检 Agent **不重复** evaluate 的内容质量打分，只做一致性维度。

---

## 5. 落地优先级与里程碑

| 顺序 | 功能 | 改动量 | 理由 |
|------|------|--------|------|
| P0 | 功能 3 STAR 引导 | 小-中 | 复用 Enhance 最多，最快出 MVP |
| P1 | 功能 1 实时写作助手 | 小-中 | 体验差异化最大，无 DB 改动 |
| P2 | 功能 2 体检 Agent | 中 | 流式骨架可复刻评估，价值高但前端 UI 较重 |

### 验证标准（每功能必须通过）
1. **STAR 引导**：原文缺 Result 时，analyze 正确标 `present:false` 且给出 hint；用户补充后 generate 结合补充、不编造。
2. **写作助手**：纯职责描述（"负责后端开发"）能命中 `duty_not_result` + `missing_metrics`；优质要点返回空数组（无误报）；弱动词 quickFix 可一键应用。
3. **体检 Agent**：构造时间断档/技能矛盾的测试简历，能准确报出对应 finding 且 `modules[]` 定位正确；正常简历 healthScore 高、findings 少。
4. 三功能脱敏：含手机号/姓名的输入，请求体经 mask 后不含明文（后端单测覆盖）。

---

## 6. 文件清单（实现时）

### 后端
- `backend/internal/handler/ai.go` — 新增 `WritingDiagnose`、`ResumeCheckupStream`、`AnalyzeStar`
- `backend/internal/service/ai/service.go` — 新增 `DiagnoseWriting`、`StreamCheckup`、`AnalyzeStar` + prompt 构建 + StreamEvent 扩字段
- `backend/internal/model/ai.go` — 新增请求/响应结构体、`CheckupFinding`、`StarDimension`、type 枚举
- `backend/internal/router/*.go` — 注册 3 个路由

### 前端
- `src/api/ai.ts` — 新增类型 + `aiApi.writingDiagnose` / `checkupStream` / `starAnalyze` / `starGenerate`
- `src/hooks/useWritingAssistant.ts`、`useResumeCheckup.ts`、`useStarRewrite.ts`
- `src/components/common/ai/InlineDiagnosisBar.tsx`、`StarGuidePanel.tsx`
- `src/components/layout/ai/ResumeCheckupPanel.tsx`
- `src/components/common/RichTextEditor.tsx` — 集成写作助手 + STAR 入口
- `src/components/layout/RightPanel.tsx` — 新增 checkup tab
- `src/i18n/resume.ts` — 新增文案键
