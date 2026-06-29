# 简历深色模式（外观模式）技术方案 Spec

## Context

主题设置目前只支持浅色简历。用户希望支持深色背景（含深色渐变）。深色不是「加一个背景色」那么简单——一旦背景变深，正文色、标题色、分隔线、装饰底色全部要联动翻转，否则简历不可读；且简历最终要导出 PDF，深色背景与浅色文字**必须**都出现在 PDF 里才有意义。

本方案把深色实现为一个**「外观模式」开关 + 预设深色方案**，而非自由背景配色，确保可读性与导出正确性。

## 决策（已确认）

1. **深色作为「配色模式」开关**：浅色（默认）/ 深色，不是单个背景字段。
2. **预设深色方案**：深色档内提供「纯深色 + 几套精调深色渐变」，不开放任意取色（避免配出不可读组合）。
3. **整页深色**，Modern 侧栏在深色下做适配（不再用浅色 `themeColor08` 底）。
4. **深色 token 联动派生**：背景/正文/标题/分隔线/装饰一整套，主题色在深色下自动提亮。

## 关键约束：PDF 导出

- 后端 `page.PrintToPDF().WithPrintBackground(true)` 已开（[chromedp_renderer.go:152](ResumeCraft/backend/internal/renderer/chromedp_renderer.go)）——**导出能带背景，前提满足**。
- **必须改**：导出容器 [PagedResumePaper.tsx:157](ResumeCraft/src/components/resume/PagedResumePaper.tsx) 硬编码 `background: '#ffffff'`，深色时会盖掉深色背景，需改为跟随外观模式。
- **必须加**：`print-color-adjust: exact` / `-webkit-print-color-adjust: exact` 到 `.resume-preview-content`，确保浏览器打印时不丢背景色（index.css 目前没有）。

## 实现方案

### 数据模型（types/resume.ts）

`ResumeStyleSettings` 新增字段（向后兼容，默认浅色）：
```ts
export type AppearanceMode = 'light' | 'dark'
export type DarkBackgroundPreset = 'solid' | 'gradient-blue' | 'gradient-purple' | 'gradient-slate'

// ResumeStyleSettings 增加：
appearanceMode?: AppearanceMode          // 默认 'light'
darkBackgroundPreset?: DarkBackgroundPreset  // 默认 'solid'，仅 dark 生效
```
`DEFAULT_RESUME_STYLE_SETTINGS` 补 `appearanceMode: 'light'`、`darkBackgroundPreset: 'solid'`。

> 不存具体颜色值，只存「模式 + 预设名」，颜色全由 CSS 派生——改主题色深色配色自动跟随，且未来调色不影响已存数据。

### CSS 驱动（index.css）—— 复用现有「CSS 变量 + 属性选择器」机制

模板根节点已有 `data-module-title-*` 属性驱动样式的先例。新增 `data-appearance` + `data-dark-bg` 属性，CSS 覆盖深色 token：
```css
/* 深色：整体背景 + 文字/标题/分隔线提亮，强制打印保留背景 */
.resume-preview-content[data-appearance='dark'] {
  --resume-text-color: #E5E7EB;       /* 正文转浅 */
  --module-title-color: #FFFFFF;       /* 标题转白（或主题色提亮，见下） */
  color: var(--resume-text-color);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
/* 背景预设 */
.resume-preview-content[data-appearance='dark'][data-dark-bg='solid'] { background: #1E232B; }
.resume-preview-content[data-appearance='dark'][data-dark-bg='gradient-blue'] {
  background: linear-gradient(160deg, #1a2233 0%, #0f1722 100%);
}
/* gradient-purple / gradient-slate 类同 */

/* 深色下装饰适配：分隔线、技能标签底色、Modern 侧栏底色 */
.resume-preview-content[data-appearance='dark'] .resume-module-title-line { opacity: .5; }
```
- **打印保留背景**：`print-color-adjust: exact` 同时加到浅色根（保险）和深色根。

### 样式变量 hook（useResumeStyleVars.ts）

`useResumeStyleVars` 的 `dataAttrs` 增加：
```ts
'data-appearance': styleSettings.appearanceMode ?? 'light',
'data-dark-bg': styleSettings.darkBackgroundPreset ?? 'solid',
```
深色时主题色派生提亮（可选）：若 `appearanceMode==='dark'`，`--module-title-color` 用 themeColor 经提亮函数处理（简单做法：直接用白色或半透明白，先不引入颜色计算库）。

### 导出容器（PagedResumePaper.tsx）

`resume-paper-export` 的 `background: '#ffffff'` 改为根据 `resume.styleSettings.appearanceMode` 决定：深色时用对应深色背景（与预览一致），浅色保持白。`resume-paper`（测量用，hidden）同理。

### Modern 侧栏适配（ModernTemplate.tsx）

`LeftCol` 当前 `background: ${themeColor}08` + `borderRight: ${themeColor}30`（浅色底）。深色下这层浅色会突兀——加条件：`appearanceMode==='dark'` 时改用半透明白底 `rgba(255,255,255,0.04)` 或去掉，由整页深色背景透出。

### 设置 UI（SettingsPanel.tsx → 主题设置分组）

主题设置分组内（模板/主题色之后）加「外观模式」：
- 浅色 / 深色 分段按钮（复用现有分段按钮样式）。
- 选深色时，下方展开「背景」预设选择：纯深色 / 深蓝渐变 / 深紫渐变 / 石板灰渐变——用色块预览（参考 ModuleTitleStylePicker 的可视化做法）。
- 走 `setStyleSettings({ appearanceMode, darkBackgroundPreset })`，实时生效。

## 非目标
- 不做自由深色取色（仅预设）。
- 不做浅色背景渐变（本次只深色）。
- 不引入颜色计算库（主题色提亮用简单策略，复杂派生留后）。
- 不做"跟随系统深色"（简历外观是简历属性，与系统主题无关）。
- 不改分页逻辑（背景是根节点样式，不影响 `computePageStarts`）。

## 验证
1. 前端 `tsc` + `build`。
2. **预览**：切深色 → 整页深色、正文浅色可读、标题清晰、Modern 侧栏不突兀；切回浅色完全恢复。
3. **导出（核心）**：深色简历导出 PDF → 背景与浅色文字都正确出现在 PDF 里（验证 `print-color-adjust` + 导出容器背景生效）。这是成败关键，必须实测。
4. **快照/分享**：深色设置随 styleSettings 落库，分享页 ShareViewPage 也正确渲染深色（确认分享页用同一套模板与 CSS）。
5. 旧简历（无 appearanceMode 字段）默认浅色，不受影响。

## 改动量
中。types 加 2 字段 + 默认值；index.css 加深色 token 与背景预设；useResumeStyleVars 加 2 个 data 属性；PagedResumePaper 导出容器背景跟随；ModernTemplate 侧栏深色适配；SettingsPanel 加外观模式 + 背景预设 UI。**无后端改动**（PrintBackground 已开）。最大风险在导出实测——必须验证 PDF 真的带深色背景。

## 文件清单
- `src/types/resume.ts` — AppearanceMode/DarkBackgroundPreset 类型 + ResumeStyleSettings 字段 + 默认值
- `src/index.css` — 深色属性选择器 token + 背景预设 + print-color-adjust
- `src/components/resume/preview/useResumeStyleVars.ts` — data-appearance / data-dark-bg
- `src/components/resume/PagedResumePaper.tsx` — 导出容器背景跟随外观模式
- `src/components/resume/preview/ModernTemplate.tsx` — 侧栏深色适配
- `src/components/layout/SettingsPanel.tsx` — 外观模式 + 背景预设 UI（主题设置分组内）
- 可选新增 `src/components/common/AppearanceModePicker.tsx`（外观+背景预设可视化选择器）
