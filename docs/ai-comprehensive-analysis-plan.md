# AI 综合分析方案（JD + 面试记录 + 简历）

> 状态：方案设计阶段，待确认决策点后进入实施
> 关联功能：求职漏斗转化分析（已上线 `GET /api/applications/stats` + 投递页「数据分析」tab）

## 1. 背景与目标

数据分析 tab 已提供漏斗转化率与简历版本 A/B 对比的**统计视角**。用户进一步希望：
- 基于 **JD + 多次面试记录 + 简历** 做综合 AI 复盘，回答"技术面不行还是 HR 面谈薪不行""简历不行还是大环境不行"的本质判断。
- 跨投递汇总出能力短板、亮点、行动建议。

核心障碍：**多简历 × 多公司 × 多面试的数据量会导致 LLM 上下文溢出**，本方案的核心是解决溢出。

## 2. 数据现状（关键数字）

来自代码探索，量化溢出风险：

| 场景 | 单投递喂给 AI 的字符量 | 折算 token |
|---|---|---|
| 极简（演示种子） | ~10–15 KB | ~3–5K |
| 典型真实（2–3 轮面试 + 完整简历） | ~30–40 KB | ~10–12K |
| 重度（含录音转写 notes） | ~150–200 KB | ~40–60K |
| 跨投递全量（30+ 投递） | MB 级 | 100K+ |

潜在膨胀字段（均为无界 `text`/`jsonb`）：
- `job_applications.jd_text` — DB 无限制，其他端点上限 30000–50000 字符
- `job_application_interviews.questions / notes` — 投递接口**完全无长度校验**
- `resume_versions.content_snapshot` — 详细简历 30–80 KB
- 面试录音附件 — 实为转写文本（.txt/.docx ≤ 2MB / ≤50000 字符），可直接喂 AI

现有 AI 设施的缺口：
- provider（`backend/internal/service/ai/provider.go`）**不支持 system role**，指令挤占 user prompt
- **无 token 计数 / 截断 / 摘要工具**
- `AnalyzeTranscript` 端点**主动丢弃 JD**（`interview_prompt.go:281` `_ = jdText`），对 transcript 零截断——已有的 TODO 状态
- 多数用户模型上下文 8K–32K → 典型场景即溢出

## 3. 架构方案：分层 + Map-Reduce

根本思路：**不让原始 notes/JD/简历直接进 reduce 层，只让 Stage 1 的结构化小结进**。

```
┌─ Stage 1：单投递复盘（直接拼装 + 摘要压缩）──────┐
│  输入：1 份简历快照 + 1 条 JD + 该投递 N 轮面试   │
│  1. 每轮 notes 超 ~1500 字先过摘要器压缩          │
│  2. 简历走 sanitizeAIResumeContent 精简           │
│  3. 拼进单次 prompt → LLM 调用 → 流式返回小结     │
│  控制总输入 ≤ 12K tokens                          │
│  产出：结构化小结 JSON（亮点/短板/匹配度/建议）   │
└──────────────────────────────────────────────────┘
          ↓ 每投递产出的「小结」(~500 字)
┌─ Stage 2：跨投递综合（map-reduce）───────────────┐
│  Map:    按筛选条件纳入 N 条投递，逐条跑 Stage 1  │
│  Reduce: N 个小结 + 漏斗统计数据 → 汇总 prompt    │
│  → 输出「求职复盘报告」（瓶颈/能力图谱/行动建议）│
│  小结本身轻量，N=50 也只 ~25K tokens              │
└──────────────────────────────────────────────────┘
```

## 4. 上下文预算与截断（横切能力）

新建 `backend/internal/service/ai/budget.go`：

| 工具 | 作用 |
|---|---|
| `EstimateTokens(s)` | 中文 `len(rune)/1.5` + 英文 `len/4` 混合估算，零依赖 |
| `TruncateToBudget(s, budget)` | 超限时按段落/句子边界截断 + "…(已截断)" |
| `SummarizeChunk(ctx, text, targetWords)` | 复用现有 `SummarizeInterviewNotes` 模式压缩长文本 |

**单投递预算分配**：指令 1K + 简历精简 3K + JD 2K + 每轮面试摘要 1K×N + 输出 2K ≈ 总输入 ≤ 12K。

**面试 notes 处理**：每轮超 ~1500 字先 `SummarizeChunk`；多轮只喂"轮次摘要"而非原文。

**简历精简**：复用 `sanitizeAIResumeContent`（`service.go:1283`），再叠加整体 budget 截断。

## 5. API 设计（SSE 流式，复用现有 StreamEvent 协议）

```
POST /api/applications/:id/ai-review           # Stage 1 单投递复盘
POST /api/applications/ai-review/aggregate     # Stage 2 跨投递综合
```

- 请求体（aggregate）支持过滤：`resumeId?` / `statuses?` / `from?` / `to?`，控制纳入投递范围
- 响应复用 `StreamEvent`（`summary` / `issue_item` / `action_item` / `finish`），前端无需新协议
- aggregate 的 Map 阶段串行执行，流式回显进度"正在分析第 X/N 条"

## 6. Provider 改进（可选优化）

扩展 `CompleteRequest` 增加 `SystemPrompt string`，provider 层拼 `[{role:"system"},{role:"user"}]`。

- **非必须**：不改时指令塞 user prompt 也能跑
- **收益**：system role 让指令不被数据稀释，对综合分析质量有正向收益
- **影响面**：改动惠及所有现有 AI 端点（evaluate / jd_match / checkup 等）

## 7. UI 集成

`src/components/applications/FunnelAnalytics.tsx` 底部新增「AI 求职复盘」卡片：

- **单投递模式**：下拉选投递 → 「生成复盘」→ 流式输出（JD/简历匹配度、各轮面试表现、改进点）
- **综合模式**：按当前 tab 筛选条件（状态/简历/时间）→ 「生成综合报告」→ 流式输出（漏斗瓶颈、能力短板、版本对比结论、下一步建议）
- 流式渲染参考 `ResumeScoreDrawer` 的消费模式

## 8. 分阶段实施

| 阶段 | 内容 | 风险 |
|---|---|---|
| **P1** 横切能力 | `budget.go`（token 估算/截断/摘要复用） | 低，纯工具 |
| **P2** 单投递复盘 | Stage 1 API + UI 单投递模式；**顺手修复 `AnalyzeTranscript` 丢弃 JD** | 中，prompt 调优 |
| **P3** 跨投递综合 | Stage 2 map-reduce + UI 综合模式 | 中高，N 次调用成本/耗时 |
| **P4** 体验优化 | provider system role、并发 map、缓存小结 | 低 |

## 9. 数据校验缺口（顺手补）

`CreateJobApplicationRequest.JDText` 和 `CreateInterviewRequest.notes` 当前**完全无长度校验**。建议在 P1 一并对齐现有端点上限（JD ≤ 30000、notes ≤ 50000），避免极端值击穿预算。

## 10. 风险与取舍

| 风险 | 取舍 |
|---|---|
| Stage 2 N 次串行调用慢（30 投递 ~1–2 分钟） | 接受串行 + 流式进度提示；并发有用户 token 限流风险 |
| 摘要压缩损失面试细节 | 单投递模式保留原文（仅超长才摘要）；综合模式本就需要抽象 |
| 跨投递综合成本（token 费用） | UI 明确提示"将分析 N 条投递"，二次确认 |
| provider system role 改动影响所有端点 | 作为 P4 可选项，灰度验证 |

## 11. 待确认决策点

1. **优先级**：先做 P2（单投递）还是直接 P3（跨投递综合）？推荐 P2 先行——高频、低风险、可验证 prompt 质量。
2. **provider system role**：是否纳入 P1（改动小、惠及全局）？
3. **Map 阶段执行方式**：串行 + 进度流式（推荐）还是并发（需评估用户模型限流）？

## 12. 关联文件索引

| 关注点 | 路径 |
|---|---|
| AI provider | `backend/internal/service/ai/provider.go` |
| AI service 总入口 | `backend/internal/service/ai/service.go` |
| 面试 AI 端点（参考） | `backend/internal/service/ai/interview.go` + `interview_prompt.go` |
| 简历脱敏工具 | `backend/internal/service/ai/service.go:1283` (`sanitizeAIResumeContent`) |
| 面试 notes 摘要（参考） | `backend/internal/service/ai/service.go:2004` (`SummarizeInterviewNotes`) |
| StreamEvent 协议 | `backend/internal/service/ai/service.go:1011` |
| 投递/JD/面试 model | `backend/internal/model/job_application.go` |
| 漏斗分析（已上线） | `backend/internal/service/job_application/service.go` (`GetFunnelStats`) |
| 前端数据分析面板 | `src/components/applications/FunnelAnalytics.tsx` |
| 流式消费参考 | `src/components/layout/ai/ResumeScoreDrawer.tsx` |
