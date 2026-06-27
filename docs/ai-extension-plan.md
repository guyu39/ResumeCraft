# AI 能力延伸 — 实现方案

> 基于现有 AI 基建（`ai_conversations`/`ai_messages` 表、`streamSSE` 流式、`useAIRequest`/`useAIStream` hook、`maskPrompt` 脱敏、`aiCacheKey` 缓存、快照系统）设计，最大化复用、最小化新增。

现有可复用资产：
- **流式管道**：`src/api/streamSSE.ts`（含 abort/timeout）+ 后端 `StreamComplete`
- **会话存储**：`ai_conversations`（已有 type 枚举可扩展）+ `ai_messages`
- **脱敏**：`service.maskPrompt`/`unmaskResponse`（隐私保护）
- **快照**：`resume_versions`（manual/default）+ `RestoreFromVersion`
- **前端 hook 抽象**：`useAIRequest`（非流式三件套 + 竞态守卫 + 缓存）

---

## 功能 1：整模块批量 STAR 改写 + diff 采纳

**价值**：现有 `RewriteBullet` 只能逐条改写单个字段，用户改一段完整工作经历要点很多次。批量改写一次性优化整个模块的所有要点，配 diff 预览选择性采纳。

### 数据模型
- **不需要新表**。复用 `ai_conversations`，新增 type `module_rewrite`。
- 复用现有 `bullet_rewrites` 表记录（已有 `all_versions jsonb`）。

### 后端
- 新增 `POST /api/ai/rewrite/module`（handler `RewriteModule`）
- 请求：`{ resumeId, moduleType, moduleInstanceId, jdText?, targetTitle? }`
- service：取该模块所有可改写字段 → 构造批量 prompt（要求 LLM 返回 `items: [{fieldKey, original, rewritten, highlights}]`）→ 流式逐条 emit
- 复用 `maskPrompt`、`buildBulletRewritePrompt`（扩展为多条）

### 前端
- 新增 `useModuleRewrite`（复用 `useAIStream` 模式）
- 改写结果在 RightPanel 模块表单上方插入 **diff 卡片**：每条 `原文 → 改写`，带「采纳/忽略」按钮
- 采纳 → 调用 `updateModuleData` 写入对应字段（复用现有 store action）

**改动量**：中。后端 1 handler + 1 service + prompt 扩展；前端 1 hook + 1 diff 组件。

---

## 功能 2：JD 定向优化（生成优化后的简历快照）

**价值**：现有 JD 匹配只给"评分 + 建议清单"，用户还得自己改。本功能直接产出一份**针对该 JD 优化后的简历副本**，存为新快照，用户对比采纳。

### 数据模型
- **复用快照系统**：优化结果写入 `resume_versions`，`snapshot_type='manual'`，label 如「JD优化-前端工程师」。
- 复用 `ai_conversations` type `jd_optimize`。

### 后端
- 新增 `POST /api/ai/jd-optimize`（流式）
- service：当前简历 content + JD → prompt（要求 LLM 在**不编造**前提下，重写 summary/各经历要点/技能排序以贴合 JD）→ 返回完整 content JSON
- 关键约束：prompt 强调「只能基于已有事实重组/突出，禁止虚构经历」（复用现有隐私+反编造 prompt 规则）
- 落库：调用现有 `CreateManualSnapshot` 写新快照（不覆盖当前编辑）

### 前端
- JDMatchPanel 增加「生成优化版」按钮
- 完成后跳到**快照对比视图**（复用现有 `DiffSnapshots`），左当前/右优化版
- 用户「采纳」→ `RestoreFromVersion` 切到优化版（已有乐观锁保护）

**改动量**：中偏大。复用快照/diff 基建，主要工作在 prompt 质量与 content JSON 结构校验（防 LLM 破坏结构）。

---

## 功能 3：面试追问多轮对话

**价值**：现有面试是一次性出题 + 一次性评估。真实面试有追问。本功能让用户答完某题后，AI 基于回答继续追问 2-3 层，更真实。

### 数据模型
- **复用 `ai_conversations`（type=`interview_prep` 已有）+ `ai_messages`**：每轮追问是一条 message。
- `interview_sessions` 已存在，追问对话挂到对应 session 的 conversation_id。

### 后端
- 新增 `POST /api/ai/interview/followup`（流式）
- 请求：`{ sessionId, questionId, userAnswer, history: [{role, content}] }`
- service：把题目 + 历史问答 + 本次回答拼成 messages → 流式返回追问问题或「本题结束」
- 存 `ai_messages`（role user/assistant 交替）

### 前端
- 答题界面每题下方加「继续追问」交互区，展示多轮对话气泡
- 新增 `useInterviewFollowup`（流式，复用 streamSSE）
- 追问轮数上限（如 3 轮）防止无限循环 + token 失控

**改动量**：中。复用对话表与流式，主要是前端多轮对话 UI。

---

## 功能 4：简历体检报告导出 PDF

**价值**：评估结果目前只在抽屉里看，无法留存/分享。导出成独立 PDF 报告（评分卡 + 维度雷达 + 问题清单 + 改进项），可发给导师/朋友看。

### 数据模型
- **无需新表**。评估结果已存在 `ai_conversations.context`（evaluate 类型）。

### 后端
- 复用现有**导出服务 + chromedp 渲染器**（`internal/service/export` + `renderer/chromedp_renderer.go`）
- 新增 `POST /api/ai/evaluate/:conversationId/report`：取评估 context → 渲染成报告 HTML → 走现有 PDF 渲染管道
- 或更轻：前端用现有评估展示组件生成 HTML → 调现有 `/share/:token/pdf` 同款 PDF 接口

### 前端
- ResumeScoreDrawer 结果区加「导出报告」按钮
- 复用 `useExportPDF` 的 DOM→PDF 流程（已有）

**改动量**：小。几乎全复用导出基建，主要是报告 HTML 模板。

---

## 优先级建议

| 功能 | 价值 | 改动量 | 复用度 | 建议顺序 |
|------|------|--------|--------|----------|
| 4 体检报告导出 | 中 | 小 | 极高 | **先做**（快速见效） |
| 1 整模块改写 | 高 | 中 | 高 | 次之（高频刚需） |
| 3 面试追问 | 中高 | 中 | 高 | 第三 |
| 2 JD定向优化 | 高 | 中大 | 中 | 最后（prompt 质量是难点，需多轮调优） |

## 通用注意事项（所有功能）
- **token 成本**：批量/多轮功能务必接 `aiCacheKey` 缓存 + 轮数/字数上限。
- **结构安全**（功能 2）：LLM 返回的 content JSON 必须严格校验（字段缺失/类型错误时拒绝写库），防止破坏简历结构。
- **脱敏**：所有 prompt 走 `maskPrompt`，回填走 `unmaskResponse`（已有）。
- **竞态/取消**：前端 hook 统一用 `useAIRequest`/`useAIStream` 的 abort 守卫（已有）。
- **移动端**：这些都是创作类功能，按上轮结论留桌面，移动端只读查看结果。
