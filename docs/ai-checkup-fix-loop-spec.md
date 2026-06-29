# 体检 → 修复闭环 技术方案 Spec

## Context

一致性体检 Agent 目前只「报问题」——每条 finding 给出 title/detail/suggestion，用户看到后还得自己回到对应模块手动改。诊断与修复是断开的。

本方案把两者打通：**每条 finding 直接挂「一键修复」**，按问题类型走不同修复动作（自动规则 / LLM 定向改写 / 跳转引导），让用户在体检面板里就能闭环解决问题。

**核心障碍**（来自调研）：finding 当前只携带 `modules: moduleType[]`，缺少定位到具体经历条目/字段的信息；且改写接口无「修复指令」入口，无法把"消除与 XX 的矛盾"这类约束传给 LLM。本方案解决这两个缺口。

## 决策（已确认）

1. **后端回填定位信息**：扩展体检 prompt 与 `CheckupFinding`，让模型回填 `moduleInstanceTitle`/`itemIndex`/`fieldKey`/`anchorText`（命中原文片段），参考 `WritingDiagnosis.span` 的设计。
2. **分档修复**：按 finding code 分三档动作——自动规则 / LLM 定向改写 / 跳转引导。
3. **后端加修复指令字段**：`BulletRewriteRequest` 增加 `fixInstruction`，prompt 增「针对性修复」段，把 finding 的 detail+suggestion 作为约束传入。

## 修复分档（按 code）

| 档位 | code | 动作 |
|------|------|------|
| **A 自动规则**（不调 LLM） | `date_format_inconsistent` | 前端统一日期格式，直接写回 store，可撤回 |
| **B LLM 定向改写** | `skill_evidence_missing`、`experience_skill_missing`、`metric_conflict`、`title_mismatch` | 定位到目标条目 → 调 `/ai/rewrite/bullet`（带 `fixInstruction`）→ diff 预览 → 采纳写回 |
| **C 跳转引导**（需用户补事实） | `timeline_gap`、`timeline_overlap`、`i18n_mismatch` | 跳转到相关模块 + 把 suggestion 作为提示，由用户手动补充（AI 不编造） |

> 未知 code 一律降级为 C 档（跳转引导），前端兜底。

## 实现方案

### 后端

**1. 扩展 `CheckupFinding`**（[backend/internal/model/ai.go:552](ResumeCraft/backend/internal/model/ai.go)）
```go
type CheckupFinding struct {
    Code       string   `json:"code"`
    Severity   string   `json:"severity"`
    Title      string   `json:"title"`
    Detail     string   `json:"detail"`
    Modules    []string `json:"modules"`
    Suggestion string   `json:"suggestion"`
    // 新增定位字段（修复闭环用，模型尽力回填，可空）
    TargetModule string `json:"targetModule"` // moduleType，主修复目标
    AnchorText   string `json:"anchorText"`   // 命中的原文片段，用于前端反查具体条目
    FixHint      string `json:"fixHint"`      // 给改写 LLM 的修复方向（比 suggestion 更聚焦）
}
```
前端镜像同步 [src/api/ai.ts:767](ResumeCraft/src/api/ai.ts)。

> 不强制模型回填 `moduleInstanceId/itemIndex`（模型不可靠），改为回填 `anchorText`（原文片段），由**前端确定性反查** item index——更稳。`targetModule` 单值（主目标），`modules` 数组保留作跳转。

**2. 体检 prompt 增定位要求**（[proactive_agent.go](ResumeCraft/backend/internal/service/ai/proactive_agent.go) `buildCheckupPrompt`）
- finding_item 结构增加 `targetModule`/`anchorText`/`fixHint` 字段说明。
- 约束：`anchorText` 必须逐字摘自原文（用于前端匹配），不得改写；`fixHint` 给出可执行的修复方向。
- 解析处 [proactive_agent.go:349](ResumeCraft/backend/internal/service/ai/proactive_agent.go)、[:526](ResumeCraft/backend/internal/service/ai/proactive_agent.go) 同步读取新字段（`getString` 兜底空值）。

**3. `BulletRewriteRequest` 加修复指令**（[ai.go:301](ResumeCraft/backend/internal/model/ai.go)）
```go
FixInstruction string `json:"fixInstruction"` // 修复闭环：针对性修复约束，可空
```
[bullet_rewrite.go](ResumeCraft/backend/internal/service/ai/bullet_rewrite.go) `buildBulletRewritePrompt` 增加可选段：
```
【针对性修复 — 若提供则优先满足】
本次改写需解决以下一致性问题：{fixInstruction}
在不编造事实的前提下，重写时必须消除该问题。
```
仅当 `fixInstruction != ""` 时注入，不影响现有调用。

### 前端

**4. 修复分档逻辑**（新增 `src/utils/checkupFix.ts`）
- `getFixTier(code): 'auto' | 'rewrite' | 'guide'` — code → 档位映射，未知 code 归 `guide`。
- `fixDateFormat(modules, finding)` — A 档纯函数：统一日期格式（复用项目现有日期处理工具，若有）。
- `locateItem(resume, finding)` — 用 `anchorText` 在目标模块 items 的 `description`/`content` 里做包含匹配，返回 `{ moduleId, itemIndex, fieldKey, original }`，匹配失败返回 null（降级为 guide）。

**5. `ResumeCheckupPanel` 增「一键修复」按钮**（[ResumeCheckupPanel.tsx:129](ResumeCraft/src/components/layout/ai/ResumeCheckupPanel.tsx)）
每条 finding 卡片底部按档位渲染：
- A 档：「一键统一」按钮 → 调 `fixDateFormat` → `updateModuleData` 写回 → 标记「已修复」+ 撤回。
- B 档：「AI 修复」按钮 → 定位 item → 调 `useBulletRewrite`（带 `fixInstruction = finding.fixHint || finding.suggestion`）→ 在卡片内嵌 diff（原文 → 改写）→ 采纳走 `updateModuleData`（复用 [ModuleRewritePanel.tsx:100](ResumeCraft/src/components/layout/ai/ModuleRewritePanel.tsx) 的 `acceptItem` 写回模式）。
- C 档：「去修改」按钮 → `onJumpToModule`（现有）。

**6. 写回复用**（关键：不依赖编辑器聚焦态）
- 复用 `store.updateModuleData(moduleId, fn)`（[resumeStore.ts:668](ResumeCraft/src/store/resumeStore.ts)）按 `moduleId + itemIndex` 改 `description`/`content`。
- 抽 `ModuleRewritePanel` 的 `acceptItem`/`undoItem` 写回逻辑为可复用工具（或在 panel 内重写一份轻量版），体检面板和批量改写共用「按 index 写回 + 撤回」。

### 修复状态管理
- `ResumeCheckupPanel` 内维护 `fixStates: Record<findingKey, 'pending'|'fixing'|'fixed'|'ignored'>`，findingKey 用 `code + index`。
- 修复后 finding 卡片置灰标「已修复」，提供撤回。

## 非目标
- 不做批量「一键全修」（逐条修复，避免不可控的大范围改动）。
- C 档（timeline/i18n）不自动改，AI 不编造空白期/双语内容。
- 不改 STAR 接口（其只吃纯文本，不适合定向修复）。
- 修复不强制重新体检（用户可手动再跑确认）。

## 验证
1. **后端**：`go build ./...` + `go vet`；构造含 metric_conflict 的简历，确认 finding 回填了 `anchorText`/`fixHint`。
2. **前端**：`tsc --noEmit` + `build`。
3. **手动**（起服务）：
   - A 档：造日期格式不一致 → 一键统一 → 各模块日期格式一致 + 可撤回。
   - B 档：造技能矛盾 → AI 修复 → diff 合理（不编造）→ 采纳后 store 更新、再体检该问题消失。
   - B 档定位失败（anchorText 匹配不到）→ 优雅降级为「去修改」跳转。
   - C 档：时间断档 → 仅跳转引导，无自动改写。

## 改动量
中。后端：`CheckupFinding` 扩字段 + 体检 prompt + `BulletRewriteRequest.fixInstruction` + bullet prompt（约 4 处）。前端：1 工具文件 + `ResumeCheckupPanel` 增修复 UI 与状态 + 复用写回。**无新表、无新接口**（复用 `/ai/rewrite/bullet`）。
