# 功能2：JD 定向优化（生成优化快照）— 实现方案

> 现状：JD 匹配（`StreamJDMatch`）只给「匹配分 + 关键词 + 缺口 + 修改建议清单」，用户仍要自己逐条改。
> 目标：基于目标 JD，**一键产出一份针对该岗位优化后的简历副本**，存为新的 manual 快照；用户在快照对比视图里左右对照（当前 vs 优化版），满意则恢复采纳。

---

## 一、设计原则

1. **不覆盖当前简历**：优化结果写入新 `resume_versions`（snapshot_type=manual），当前编辑内容不动；用户对比后主动「恢复」才生效（复用现有乐观锁保护的 `RestoreFromVersion`）。
2. **绝不编造**：prompt 严格约束「只能基于已有事实重组、突出、改写措辞，禁止虚构经历/公司/数字」。这是与「整模块改写（功能1）」一致的底线。
3. **结构安全**：LLM 返回的是完整 content JSON（含 modules 数组），必须严格校验——模块数量、模块 id、模块 type 不允许变；只允许改各模块内部的文本字段（description/content）。任何结构破坏直接拒绝写库，避免毁掉简历。
4. **最大化复用**：快照表、`CreateManualSnapshot`、`DiffSnapshots`、`RestoreVersion`、`maskPrompt` 脱敏、`useAIRequest`、JDMatchPanel 的 JD 输入区，全部复用。

---

## 二、数据流

```
用户在 JD 匹配面板填 JD/岗位
  → 点「生成优化版」
  → POST /api/ai/jd-optimize  { resumeId, content, jdText, targetTitle, companyName }
  → service.OptimizeForJD:
       1. 取当前 content（modules）
       2. 构造 prompt（带 JD + 当前简历结构 + 反编造/保结构约束）
       3. LLM 返回优化后的 modules（仅文本字段变）
       4. 严格校验结构（模块 id/type/数量一致）→ 不一致则拒绝
       5. 用优化后的 content 调 CreateOptimizedSnapshot 落库为 manual 快照
       6. 返回 { snapshotId, label, diffSummary }
  → 前端拿 snapshotId，跳转/打开快照对比视图（复用 DiffSnapshots）
       左：当前简历   右：优化快照
  → 用户「采纳」→ RestoreVersion(snapshotId)（带乐观锁）→ 切到优化版
```

---

## 三、后端改动

### 3.1 model（backend/internal/model/ai.go）

```go
// JDOptimizeRequest JD 定向优化请求
type JDOptimizeRequest struct {
    ResumeID    string                 `json:"resumeId" binding:"required"`
    Content     map[string]interface{} `json:"content" binding:"required"` // 当前简历完整 content（含 modules）
    JDText      string                 `json:"jdText" binding:"required"`
    TargetTitle string                 `json:"targetTitle"`
    CompanyName string                 `json:"companyName"`
}

// JDOptimizeResponse JD 定向优化响应
type JDOptimizeResponse struct {
    SnapshotID   string   `json:"snapshotId"`   // 生成的优化快照 id，供前端对比/恢复
    Label        string   `json:"label"`        // 快照标签，如「JD优化-后端开发」
    ChangedCount int      `json:"changedCount"` // 改动的模块/条目数
    Notes        []string `json:"notes"`        // 优化要点说明（给用户看「为什么这么改」）
    Model        string   `json:"model"`
}
```

### 3.2 service（新文件 backend/internal/service/ai/jd_optimize.go）

核心逻辑：
- 复用 `cfgRepo` 取配置、`maskPrompt`/`unmaskResponse` 脱敏
- `buildJDOptimizePrompt`：输入当前 modules（仅含可改文本）+ JD，要求 LLM 返回 `{"modules":[{"id":"...","fields":{"description":"新文本"}}], "notes":[...]}` —— **只回改动的字段，不回整份 content**，降低 LLM 破坏结构的概率
- `applyOptimization(currentContent, llmResult)`：在后端把 LLM 给的字段**合并回当前 content**（按 module id 定位，只覆盖 description/content 文本字段），LLM 碰不到的字段（id/type/日期/公司名等）原样保留 → 结构 100% 安全
- 合并后的 content 调用新 repo 方法 `CreateOptimizedSnapshot` 落库

接口签名（service.go 的 AIService 接口加一行）：
```go
OptimizeForJD(ctx context.Context, userID string, req model.JDOptimizeRequest) (*model.JDOptimizeResponse, error)
```

### 3.3 repo（backend/internal/storage/resume/repository.go）

`CreateManualSnapshot` 是「快照当前 content」，这里需要「用**指定 content** 建快照」，新增：
```go
// CreateSnapshotWithContent 用给定 content 直接建 manual 快照（用于 AI 优化产出），
// 不读当前简历 content。返回快照 id。
CreateSnapshotWithContent(ctx, userID, resumeID string, contentJSON []byte, label string) (snapshotID string, err error)
```
实现：INSERT resume_versions (resume_id, user_id, content_snapshot, snapshot_type='manual', label)（与 CreateManualSnapshot 同表同结构，只是 content 来自参数）。**注意**复用功能已修过的事务/列名规范（无 version_no）。

> 跨服务调用：AI service 需要能调 resume repo。当前 ai.service 没持有 resumeRepo。两种接法：
> - **A（推荐）**：handler 层编排——ai handler 调 aiService.OptimizeForJD 拿到优化 content，再调 resumeService.CreateSnapshotWithContent 落库。service 之间不耦合。
> - B：给 ai.service 注入 resumeRepo。耦合更重。
> 选 A：OptimizeForJD 只返回优化后的 content + notes，快照落库在 handler 用 resumeService 完成。

修正后的接口：
```go
// service 只负责生成优化 content，不落库
OptimizeForJD(ctx, userID, req) (optimizedContent map[string]interface{}, notes []string, model string, err error)
```
handler 编排：调 `OptimizeForJD` → 调 `resumeService.CreateSnapshotWithContent` → 返回 snapshotId。

### 3.4 handler（backend/internal/handler/ai.go）+ router

```
POST /api/ai/jd-optimize  （挂 aiLimiter）→ h.OptimizeForJD
```
handler：校验 → 调 ai OptimizeForJD → 调 resume CreateSnapshotWithContent → 返回 JDOptimizeResponse。

### 3.5 prompt 关键约束

```
你是资深简历优化顾问。基于目标 JD，优化候选人简历中各模块的文字表述，使其更贴合岗位要求。

【强制规则】
1. 只返回一个 JSON，禁止 Markdown/注释。
2. 严禁编造：不得新增/虚构经历、公司、项目、技术栈、奖项、数字。只能对【已有内容】做重组、突出、措辞优化、关键词对齐。
3. 只改文本字段（description / content），禁止改动模块结构、id、type、公司名、时间。
4. 保留原文 HTML 结构（<ul><li><p>）与隐私脱敏标记（[NAME_N] 等）。
5. 按模块 id 返回改动；未改动的模块不必返回。
6. notes 用 3-5 条说明优化思路（如「将'参与'改为量化成果动词」「突出与 JD 匹配的 Redis/Kafka 经验」）。

【返回格式】
{"modules":[{"id":"work-xxx","fields":{"description":"优化后文本"}}],"notes":["..."]}

【目标 JD】...
【当前简历模块（仅可改文本）】...
```

---

## 四、前端改动

### 4.1 api（src/api/ai.ts）
```ts
optimizeForJD: (data: { resumeId; content; jdText; targetTitle?; companyName? }) =>
  apiClient.post<{ snapshotId: string; label: string; changedCount: number; notes: string[]; model: string }>(
    '/ai/jd-optimize', data, { auth: true })
```

### 4.2 JDMatchPanel（src/components/layout/ai/JDMatchPanel.tsx）
- 现有「快速匹配 / 深度评分」按钮组旁，加第三个按钮「**生成优化版**」
- 点击 → 调 optimizeForJD → 拿到 snapshotId + notes
- 结果区展示：notes 优化说明 + 两个按钮「查看对比」「采纳优化版」
  - 「查看对比」：复用 CenterPanel 已有的 `diffSnapshots`（当前 modules vs 优化快照），打开 diff 弹窗
  - 「采纳优化版」：调 `resumeApi.restoreFromSnapshot(resumeId, snapshotId, version)`（带乐观锁），成功后刷新简历 + 快照时间轴

### 4.3 复用对比视图
CenterPanel 已有快照 diff 弹窗（`diffResult` 状态 + `resumeApi.diffSnapshots`）。优化快照本质就是一个 manual 快照，直接走现有「快照时间轴点击 → 对比」链路即可，无需新组件。

---

## 五、安全 / 成本 / 体验

- **结构安全**：LLM 只回「模块 id → 文本字段」增量，后端按 id 合并，结构字段 LLM 完全碰不到 → 不可能破坏简历结构。这是本方案最关键的设计。
- **反编造**：prompt 强约束 + 「只改措辞不增内容」；可选加后端校验——优化后文本若新增了原文没有的数字，标记提示（二期）。
- **成本**：优化是单次非流式 Complete（不流式，因为要等完整 JSON 才能校验合并）；接 `aiCacheKey`（hash(jdText+resumeUpdatedAt)）缓存，相同 JD+简历不重复烧。
- **快照膨胀**：每次优化产生一个 manual 快照。可在 label 标注来源「AI优化-时间」，并依赖现有快照列表上限/清理。
- **乐观锁**：采纳走 `RestoreVersion(expectedVersion)`，与并发编辑冲突时返回 409（已实现）。

---

## 六、改动清单与工作量

| 层 | 文件 | 改动 | 量 |
|----|------|------|----|
| model | model/ai.go | JDOptimizeRequest/Response | 小 |
| service | service/ai/jd_optimize.go（新） | OptimizeForJD + prompt + 字段合并 + 结构校验 | 中 |
| service | service/ai/service.go | 接口加 OptimizeForJD | 小 |
| repo | storage/resume/repository.go | CreateSnapshotWithContent | 小 |
| service | service/resume/service.go | 暴露 CreateSnapshotWithContent | 小 |
| handler | handler/ai.go + router.go | /ai/jd-optimize 编排 | 小 |
| 前端 api | api/ai.ts | optimizeForJD | 小 |
| 前端 UI | ai/JDMatchPanel.tsx | 生成优化版按钮 + notes + 对比/采纳 | 中 |

总体**中等**，核心难点和工作量都在 `jd_optimize.go` 的 **prompt 质量 + 字段合并/结构校验**——这是保证「优化有效」且「不毁简历」的关键，需要拿真实简历多轮调 prompt。

---

## 七、分阶段落地建议

1. **第一阶段（MVP）**：后端 OptimizeForJD（增量字段合并 + 结构校验）+ CreateSnapshotWithContent + handler；前端 JDMatchPanel 加「生成优化版」→ 生成快照 → 复用现有时间轴对比 → 采纳。打通主链路。
2. **第二阶段（打磨）**：notes 优化说明展示、缓存接入、编造检测提示、对比视图高亮改动模块。

建议先做第一阶段，用真实简历验证 prompt 效果，再迭代。
