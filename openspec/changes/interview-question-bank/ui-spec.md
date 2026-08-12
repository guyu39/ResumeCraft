# 面试题库 UI 规范（interview-question-bank）

> 依据 AGENTS.md 第 10 节：页面级变更前置产物。所有编码以本文件为准，方案调整须先回改本文件。
> 数据源：`job_application_interviews.questions` 自由文本 + 关联 `job_applications` 的公司/岗位/城市。
> 权限：仅自己可见（复用现有 `applications` 路由组 `AuthRequired` + 仓储层 `WHERE user_id = $1`）。

---

## 1. 目标与非目标

**目标**
- 让用户跨所有投递快速回看"我被问过什么、谁问的、什么时候问的"。
- 支持按关键词、公司、轮次、时间段筛选面试题。
- 一屏浏览、一键展开单次面试的完整问题记录与上下文。

**非目标**
- 不做 AI 生成模拟题（那是模拟面试模块的事）。
- 不做题目级 CRUD（问题以自由文本存储，编辑仍走"面试记录"编辑入口）。
- 不做导出/分享/协作（本期只做只读检索）。

---

## 2. 入口与信息架构

**入口**：`ApplicationsPage` 视图切换从 `list / calendar / analytics` 扩展为 `list / calendar / analytics / questions`。

- URL：`/applications?view=questions`
- Tab 名称：**"面试题库"**
- 图标：`lucide-react` 的 `BookOpen`（区别于 `Layers3`/`CalendarClock`/`BarChart3`）

**视图切换 Tab 顺序**（保持现有 `HomeHeader` 下方 tab 条不变）：
`投递列表 · 日程 · 数据分析 · 面试题库`

**空态**：整站从未录过面试记录 → 展示引导卡（"记录一次面试后，它的问题会自动汇总在这里 · 去投递列表添加面试记录"），CTA 跳到 `view=list`。

---

## 3. 页面结构（左筛选 + 右卡片列表）

桌面 ≥1024px：

```
┌ HomeHeader ──────────────────────────────────────────────────┐
├ [投递列表][日程][数据分析][面试题库(active)]  · 共 N 条面试记录 ┤
│                                                              │
│ ┌─ 筛选区（sticky top） ────────────────────────────────┐    │
│ │ [🔍 搜索问题/公司/岗位…] [公司▾] [轮次▾] [时间▾] [重置] │    │
│ └───────────────────────────────────────────────────────┘    │
│                                                              │
│ ┌─ 结果区（卡片流 / 单列） ─────────────────────────────┐    │
│ │ [卡片1]                                                │    │
│ │ [卡片2]                                                │    │
│ │ ...                                                    │    │
│ │ [分页/加载更多]                                        │    │
│ └───────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

窄屏 (<1024px)：筛选区改为可折叠抽屉，顶部保留搜索框 + "筛选" 按钮（带计数徽标）。

---

## 4. 筛选区

**搜索框**（占主宽）
- placeholder：`搜索问题内容、公司或岗位…`
- 触发：输入 400ms 防抖后请求
- 高亮：命中的关键词在卡片正文中用 `bg-primary-light text-primary` 标注
- 清空按钮 `X`（有内容时显示）

**筛选控件**（右侧一排 `StyledSelect`）
- **公司**：动态取自当前用户的 `distinct company_name`，按记录数排序，前 20 + "更多…"
- **轮次**：固定枚举 `全部 / 一面 / 二面 / 三面 / 主管面 / HR面 / 其他`（"其他"匹配 round 为空或非枚举）
- **时间**：`近 30 天 / 近 3 个月 / 近 1 年 / 全部`（默认全部）
- **重置**：仅在存在活动筛选时显示

**结果条**（tab 右侧）："共 **N** 条面试记录 · 覆盖 **M** 家公司"

---

## 5. 卡片（QuestionRecordCard）

单条 = 一次面试记录。卡片默认折叠，点击展开题目正文。

**折叠态**（约 88px 高）：

```
┌──────────────────────────────────────────────────────────┐
│ 🏢 字节跳动 · 后端开发                        [一面]      │
│ 2026/07/12 14:30 · 视频 · 面试官：张三                    │
│ ▸ 问题：Go 的 GMP 模型 / channel 底层 / 项目中最难的一个… │
└──────────────────────────────────────────────────────────┘
```

- 顶行：公司 · 岗位（`text-ink font-semibold`），右侧轮次徽标（复用 `interviewRoundBadge` 配色映射：一面 amber、二面 blue、三面 indigo、主管面 violet、HR面 slate）
- 次行：日期时间（`tabular-nums text-muted`） · 面试形式 · 面试官（缺省字段自动省略）
- 预览行：`questions` 文本首行 60 字，末尾 `…`；无 `questions` → 灰字 `暂无问题记录`
- 整卡 hover 态：`border-primary/40 bg-primary-light/30`
- 点击整卡展开；点击右下角 `↗` 跳转到该投递详情抽屉（`?id=<applicationId>&interviewId=<...>`）

**展开态**（在折叠态下方展开，`max-h-none`）：

```
├──────────────────────────────────────────────────────────┤
│ ┌ 问题原文 ─────────────────────────────────────────┐    │
│ │ 1. Go 的 GMP 模型？                                │    │
│ │ 2. channel 底层？                                  │    │
│ │ 3. …                                               │    │
│ └────────────────────────────────────────────────────┘    │
│ ┌ 面试笔记（notes） ────────────────────────────────┐    │
│ │ 面试官问得比较细，重点关注调度……                    │    │
│ └────────────────────────────────────────────────────┘    │
│ 结果：通过 · 下一步：等二面                                │
│ [复制问题] [在投递详情中打开 →]                            │
└──────────────────────────────────────────────────────────┘
```

- 问题原文：`whitespace-pre-wrap`，等宽 `font-mono text-[13px]`，`bg-canvas` 底
- 笔记：`bg-brand-soft/40` 底、正常字体（区别于问题原文）
- 结果 / 下一步：无值不显示
- 操作按钮：`btn-ghost` 尺寸小

---

## 6. 分页

- 服务端分页，`pageSize = 20`
- 下方分页控件复用 `applications` 列表分页组件（同风格）
- 深度分页不做优化（题库量级 <1k 条足够）

---

## 7. 交互细节

- **搜索防抖 400ms**：`useEffect` + `setTimeout`；每次请求都带最新分页参数（页码回到 1）。
- **筛选联动**：任一筛选变化 → 请求前把 `page` 重置为 1。
- **展开状态本地保留**：`Set<string>` of interviewId，不入 URL。
- **关键词高亮**：前端切分 `<mark class="bg-primary-light text-primary rounded px-0.5">`；只在 `questions`、`companyName`、`targetTitle` 三个字段高亮。
- **加载**：首次加载显示骨架 3 张；换筛选/分页只 dim 结果区并展示 `Loader2` spinner。
- **错误**：走全局 `toast(cleanError(err, '加载题库失败'))`；错误时保留旧数据，不清空。

---

## 8. 视觉规范（复用现有 token）

| 元素            | Token                                                                 |
|-----------------|-----------------------------------------------------------------------|
| 页面底色        | `bg-canvas`                                                           |
| 卡片            | `bg-surface border border-line rounded-xl`                            |
| 卡片 hover      | `border-primary/40 bg-primary-light/30`                               |
| 主文字          | `text-ink`                                                            |
| 次要文字        | `text-muted`                                                          |
| 高亮命中        | `bg-primary-light text-primary`                                       |
| 轮次徽标        | 复用 `applications` 列表现有的 `interviewRoundBadge` 配色              |
| 空态插画        | 复用 `EmptyState` 组件（无则新增一个简单的 `BookOpen` 灰底 icon + 文案）|

字号：卡片标题 `text-sm font-semibold`；正文 `text-sm`；元信息 `text-xs`；问题原文 `text-[13px] font-mono`。
间距：卡片外距 `space-y-3`；卡片内距 `p-4`；筛选栏 `p-3 gap-2`。

---

## 9. 可访问性

- 每张卡片：`role="button" tabIndex={0}` + Enter/Space 触发展开
- 展开态：`aria-expanded={true|false}`，`aria-controls` 指向内部详情 id
- 搜索框：`aria-label="搜索面试题、公司或岗位"`
- 筛选 Select：均带 `aria-label`
- 结果条：使用 `role="status" aria-live="polite"`，筛选变化后播报 "共 N 条结果"
- 颜色对比：轮次徽标底 200 + 文字 700 满足 4.5:1（沿用现状）

---

## 10. 数据契约（前端视角）

```ts
// GET /applications/interviews/bank?keyword=&company=&round=&range=30d&page=1&pageSize=20
type InterviewBankItem = {
  interviewId: string
  applicationId: string
  companyName: string
  targetTitle: string
  round: string           // 原文，可能空
  format: string          // '视频'|'现场'|'电话'|自定义
  interviewer: string
  scheduledAt: number | null   // ms
  questions: string       // 自由文本，可能空
  notes: string
  result: string          // '通过'|'待定'|'挂了'|自定义
  nextAction: string
}
type InterviewBankResponse = {
  items: InterviewBankItem[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
  meta: { totalRecords: number; totalCompanies: number }   // 顶部结果条
}
```

后端过滤：
- `keyword` → `questions ILIKE $ OR company_name ILIKE $ OR target_title ILIKE $`（`%kw%`，走 GIN trigram 索引可后续加）
- `company` → 精确匹配 `company_name = $`
- `round` → 精确匹配 `round = $`，特殊值 `其他` 走 `round IS NULL OR round NOT IN (...)`
- `range` → `scheduled_at >= NOW() - INTERVAL 'N days'`
- 排序：`scheduled_at DESC NULLS LAST, created_at DESC`

---

## 11. 验收要点

1. Tab 切到"面试题库"能看到自己所有面试记录，看不到其他账号的数据。
2. 输入关键词，命中题目/公司/岗位任一字段，卡片正文与顶部标题都能高亮。
3. 公司/轮次/时间任意组合筛选，结果条数与卡片一致。
4. 折叠卡展开能看到完整 `questions` 原文（保留换行）。
5. 空态：新账号能看到引导 CTA。
6. 窄屏 <1024px 时筛选进入抽屉，主内容不被遮挡。
7. 键盘 Tab 遍历所有卡片，Enter 可展开。
8. `?view=questions` 深链接可直接进入题库视图。

---

## 12. 待确认（如无异议按上述定稿）

- Tab 命名：**"面试题库"** — 用户曾说"面试题库这个可以"，采用。
- 是否需要"仅看有问题记录的面试"复选框？→ 默认过滤 `questions <> ''`，无问题的记录不进题库（本文档采用此策略；有异议可在筛选栏加复选框放行）。
- 关键词高亮是否也应用于 `notes` 展开态？→ 默认不高亮 notes（避免视觉过载）。
