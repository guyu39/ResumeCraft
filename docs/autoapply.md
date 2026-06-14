# AutoApply 简历自动投递浏览器扩展

## 一、背景与目标

ResumeCraft 已具备简历版本管理（草稿 + 快照）、分享链接、快照详情 API 等能力。本方案在此基础上规划一个 Chrome Extension MV3 插件，**最大程度复用现有 API**，在招聘平台投递表单页自动识别并填充字段，实现"一键投递"。

### 核心原则

- **后端零改动为最优**，新增 API 仅在现有接口无法满足时引入
- **复用现有认证体系**，不另建 Extension Token 体系
- **数据结构对齐 ResumeDetail.Modules**，不做二次标准化

---

## 二、现有 API 复用分析

### 2.1 可直接复用的 API（无需后端改动）

| API | 路由 | 扩展用途 |
|-----|------|---------|
| 简历列表 | `GET /api/resumes` | Popup 展示用户简历列表 |
| 简历详情 | `GET /api/resumes/:id` | 获取完整简历数据（含 modules、latestSnapshotId） |
| 快照列表 | `GET /api/resumes/:id/snapshots` | 选择特定版本 |
| 快照详情 | `GET /api/resumes/:id/snapshots/:snapshotId` | 获取指定快照的 content_snapshot |
| 分享查看 | `GET /api/share/:token` | 无认证场景获取简历数据 |
| 用户信息 | `GET /api/auth/me` | 验证登录态 |

### 2.2 需新增的 API（仅 1 个）

| API | 路由 | 说明 |
|-----|------|------|
| 投递记录 | `POST /api/extension/apply-records` | 记录投递行为（平台、岗位、时间、快照 ID） |

> 其他 3 个原方案 API（`resume-data`、`snapshots`、`snapshot/:id`）均可用现有 API 替代，无需重复建设。

### 2.3 鉴权方案：复用现有 JWT

**原方案**：新建 Extension Token 表 + 独立 scope JWT → 过重

**优化方案**：插件 Popup 内嵌 ResumeCraft 登录页，登录成功后获取 JWT，存入 `chrome.storage.session`（MV3 特性，关闭浏览器自动清除）。

```
Popup → iframe 嵌入 /login 页面
     → 登录成功后 postMessage 传递 JWT
     → background.js 存入 chrome.storage.session
     → 后续 API 请求携带 Authorization: Bearer <jwt>
```

优势：
- 零后端改动，复用现有 JWT 签发和验证逻辑
- `chrome.storage.session` 生命周期与浏览器会话绑定，比 localStorage 更安全
- JWT 过期/吊销逻辑天然继承，无需额外管理

---

## 三、简历数据模型（对齐现有结构）

**原方案**：重新定义 `basics` / `workExperience` / `education` 扁平结构 → 与 ResumeDetail.Modules 不一致，需要后端做转换

**优化方案**：插件直接消费 `ResumeDetail.Modules`，在插件侧做一次轻量映射。

```typescript
// 插件内部定义，从 modules 提取扁平化数据
interface ResolvedResumeData {
  personal: {
    name: string
    targetPosition: string
    phone: string
    email: string
    gender: string
    age: string            // YYYY-MM
    hometown: string
    education: string
    workYears: string
    politics: string
    city: string
    github: string
    website: string
    linkedin: string
    personalAccount: { platform: string; url: string }
    extraInfos: Array<{ title: string; value: string }>
  }
  summary: string
  work: Array<WorkItem>
  education: Array<EducationItem>
  project: Array<ProjectItem>
  skills: string          // HTML content
  awards: Array<AwardItem>
  certificates: Array<CertificateItem>
  languages: Array<LanguageItem>
}
```

映射逻辑在插件 `src/resolver.ts` 中实现，遍历 `modules` 按 `type` 分发提取：

```typescript
function resolveModules(modules: Module[]): ResolvedResumeData {
  const result = {} as ResolvedResumeData
  for (const mod of modules) {
    switch (mod.type) {
      case 'personal': result.personal = mod.data; break
      case 'summary':  result.summary = mod.data.content; break
      case 'work':     result.work = mod.data.items; break
      // ...
    }
  }
  return result
}
```

---

## 四、浏览器扩展插件设计

### 4.1 文件结构

```
extension/
├── manifest.json              # MV3 配置
├── popup/
│   ├── index.html             # 控制面板 UI
│   ├── popup.tsx              # 主逻辑（Token 管理、简历选择、填充触发）
│   └── styles.css
├── content/
│   ├── main.ts                # Content Script 入口
│   ├── detector.ts            # 平台检测 + 页面类型识别
│   ├── field-parser.ts        # 表单字段识别（5 级策略）
│   ├── field-mapper.ts        # 字段映射规则引擎
│   ├── simulator.ts           # 模拟输入操作（4 类控件）
│   └── highlight.ts           # 填充结果高亮/未匹配提示
├── adapters/                  # 各平台适配器（可插拔）
│   ├── boss.ts                # Boss直聘
│   ├── zhilian.ts             # 智联招聘
│   └── liepin.ts              # 猎聘
├── core/
│   ├── resolver.ts            # Modules → ResolvedResumeData 映射
│   ├── api-client.ts          # ResumeCraft API 封装
│   └── storage.ts             # chrome.storage 封装
├── background.ts              # Service Worker（消息中转、API 请求代理）
└── icons/                     # 扩展图标
```

### 4.2 Popup 控制面板功能

| 功能 | 说明 |
|------|------|
| 登录绑定 | 内嵌 iframe 登录 ResumeCraft，JWT 存入 `chrome.storage.session` |
| 简历选择 | 下拉选择简历 + 可选快照版本，默认选中 latestSnapshot |
| 页面状态 | 实时显示当前页面识别状态：已识别 Boss直聘 / 未识别 / 填充中 |
| 一键填充 | 主操作按钮，触发 content script 执行填充 |
| 填充报告 | 填充完成后显示：成功 N 个字段 / 未匹配 N 个 / 手动补充指引 |
| 投递记录 | 最近 10 条投递记录（平台、岗位、时间） |

### 4.3 消息通信架构

```
Popup ←→ Background (chrome.runtime.sendMessage)
              ↕
         Content Script (chrome.tabs.sendMessage)
              ↕
         目标招聘页面 DOM
```

- **Popup → Background**：获取简历数据、触发填充、查询投递记录
- **Background → Content Script**：下发简历数据 + 填充指令
- **Content Script → Background**：上报填充结果、平台检测结果
- **Background 负责 API 调用**（因 content script 受 CORS 限制）

---

## 五、核心技术模块详解

### 5.1 平台检测器（detector.ts）

```typescript
interface PlatformRule {
  name: string
  adapterKey: string
  hostnamePattern: RegExp
  applyPagePattern: RegExp  // URL 路径匹配投递页
}

const PLATFORM_RULES: PlatformRule[] = [
  {
    name: 'Boss直聘',
    adapterKey: 'boss',
    hostnamePattern: /boss\.zhipin\.com/,
    applyPagePattern: /\/chat\/|\/friend\/|\/geek\/interaction\/delivery/,
  },
  {
    name: '智联招聘',
    adapterKey: 'zhilian',
    hostnamePattern: /www\.zhaopin\.com/,
    applyPagePattern: /\/jobs\/.*apply|\/resume\/post/,
  },
  {
    name: '猎聘',
    adapterKey: 'liepin',
    hostnamePattern: /www\.liepin\.com/,
    applyPagePattern: /\/apply\/|\/delivery\//,
  },
]
```

每个 Adapter 实现：

```typescript
interface PlatformAdapter {
  isApplyPage(): boolean
  getFieldSelectors(): FieldSelectorMap    // 平台专用选择器（最高优先级）
  getFormContainer(): HTMLElement | null   // 表单容器，用于限定字段搜索范围
}
```

### 5.2 字段识别策略（LLM Agent + 规则引擎混合）

#### 设计理念

传统纯选择器方案（CSS selector / label 关键词）面对不同招聘平台时脆弱且维护成本高：
- 选择器随平台改版失效
- 新平台需要手写完整 adapter
- 下拉选项、自定义控件难以穷举

**核心思路**：让 LLM 理解表单语义，自动完成"字段识别 + 值映射"。

#### 三级识别流程

```
               表单页面
                  │
      ┌───────────┼───────────┐
      ▼           ▼           ▼
  Level 1     Level 2     Level 3
  Adapter     LLM Agent   规则兜底
  硬编码       语义识别     关键词匹配
  (快+准)     (准+泛)     (快+糙)
```

| 级别 | 策略 | 触发条件 | 耗时 | 可靠度 |
|------|------|---------|------|--------|
| **Level 1** | Adapter 硬编码选择器 | 平台已识别且有 adapter | < 50ms | ★★★★★ |
| **Level 2** | LLM Agent 语义识别 | adapter 缺失或字段未覆盖 | 2-4s | ★★★★ |
| **Level 3** | 关键词/属性规则兜底 | LLM 不可用（离线/限额用尽） | < 100ms | ★★★ |

#### Level 2：LLM Agent 语义识别详解

**输入构造 — DOM 文本化**

不使用截图（成本高、速度慢），而是将表单 DOM 树序列化为结构化文本：

```typescript
interface SerializedField {
  index: number              // 字段序号
  tag: string                // input / select / textarea
  type?: string              // text / number / date / radio ...
  label?: string             // 关联的 label 文本
  placeholder?: string       // placeholder 属性
  name?: string              // name 属性
  options?: string[]         // select 的 option 文本列表（前 10 个）
  required?: boolean         // 是否必填
  parentText?: string        // 父级容器中的文本（辅助理解上下文）
}

function serializeForm(container: HTMLElement): SerializedField[] {
  const fields: SerializedField[] = []
  const inputs = container.querySelectorAll('input, select, textarea, [contenteditable]')
  
  inputs.forEach((el, i) => {
    const label = findAssociatedLabel(el)  // <label for=> / aria-labelledby / 前一个兄弟文本
    fields.push({
      index: i,
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') ?? undefined,
      label: label?.trim() || undefined,
      placeholder: el.getAttribute('placeholder')?.trim() || undefined,
      name: el.getAttribute('name') ?? undefined,
      options: el instanceof HTMLSelectElement
        ? [...el.options].slice(0, 10).map(o => o.text)
        : undefined,
      required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
      parentText: el.parentElement?.textContent?.slice(0, 80).trim() || undefined,
    })
  })
  return fields
}
```

**Prompt 设计**

```
你是一个表单字段识别助手。用户正在招聘网站填写求职表单。
你需要根据表单字段的语义，将每个字段映射到简历数据中的对应 key。

## 可用的简历字段

| key | 中文含义 | 数据类型 | 示例值 |
|-----|---------|---------|--------|
| personal.name | 姓名 | text | 张三 |
| personal.phone | 手机号 | text | 13800138000 |
| personal.email | 邮箱 | text | zhangsan@qq.com |
| personal.gender | 性别 | select:男,女 | 男 |
| personal.age | 出生年月 | text | 1995-06 |
| personal.education | 最高学历 | select:初中,高中,大专,本科,硕士,博士 | 本科 |
| personal.workYears | 工作年限 | select:应届,1年,2年,...,10年以上 | 3年 |
| personal.hometown | 籍贯 | text | 浙江杭州 |
| personal.city | 现居城市 | text | 上海 |
| personal.targetPosition | 期望职位 | text | 前端工程师 |
| personal.politics | 政治面貌 | select:群众,共青团员,中共党员 | 群众 |
| summary | 自我评价 | textarea | 熟悉React... |
| work.0.company | 第1段公司名 | text | 阿里巴巴 |
| work.0.position | 第1段职位 | text | P6前端 |
| work.0.startDate | 第1段开始日期 | text | 2020-03 |
| work.0.endDate | 第1段结束日期 | text | 2023-06 |
| work.0.description | 第1段工作描述 | textarea | 负责淘系... |
| education.0.school | 第1段学校 | text | 浙江大学 |
| education.0.major | 第1段专业 | text | 计算机 |
| education.0.degree | 第1段学历 | select:专科,本科,硕士,博士 | 本科 |
| education.0.startDate | 第1段入学日期 | text | 2016-09 |
| education.0.endDate | 第1段毕业日期 | text | 2020-06 |

## 表单字段列表

{{serializedFields}}

## 输出格式

返回 JSON 数组，每个元素：
- "index": 字段序号
- "resumeKey": 映射的简历字段 key（无匹配则为 null）
- "confidence": 置信度 0-1
- "reasoning": 简短推理过程

仅返回 JSON，不要额外解释。
```

**LLM 响应示例**

```json
[
  { "index": 0, "resumeKey": "personal.name",       "confidence": 0.99, "reasoning": "label=姓名" },
  { "index": 1, "resumeKey": "personal.phone",      "confidence": 0.98, "reasoning": "label=手机号" },
  { "index": 2, "resumeKey": "personal.email",      "confidence": 0.97, "reasoning": "type=email, placeholder=请输入邮箱" },
  { "index": 3, "resumeKey": "personal.gender",     "confidence": 0.95, "reasoning": "label=性别, options=男/女" },
  { "index": 4, "resumeKey": "personal.education",  "confidence": 0.92, "reasoning": "label=学历, options含大专/本科/硕士" },
  { "index": 5, "resumeKey": null,                   "confidence": 0.30, "reasoning": "label=验证码, 无法映射到简历字段" }
]
```

**后端 API — 新增字段识别端点**

```
POST /api/extension/identify-fields
```

```go
type IdentifyFieldsRequest struct {
    Platform string            `json:"platform"`   // 平台标识，可选
    Fields   []SerializedField `json:"fields"`     // 序列化的表单字段
}

type IdentifyFieldsResponse struct {
    Mappings []FieldMapping `json:"mappings"`
}

type FieldMapping struct {
    Index      int      `json:"index"`
    ResumeKey  string   `json:"resumeKey"`
    Confidence float64  `json:"confidence"`
    Reasoning  string   `json:"reasoning"`
}
```

**后端实现要点**：
- 调用现有 `ai.Service.StreamChat()` 非流式模式
- 使用 `gpt-4o-mini` / `deepseek-chat` 等低成本模型（单次 < 1k token）
- 结果缓存：相同 platform + fields hash → 返回缓存（TTL 1h）
- 频率限制：每用户每天 100 次识别请求

**前端调用流程**：

```typescript
async function identifyFields(
  container: HTMLElement,
  platform: string
): Promise<FieldMapping[]> {
  const fields = serializeForm(container)
  
  // Level 1: 已有 adapter 的字段直接跳过
  const adapter = getAdapter(platform)
  const adapterFields = adapter?.getFieldSelectors() ?? {}
  const unmappedFields = fields.filter(
    f => !adapterFields[f.index]
  )
  
  if (unmappedFields.length === 0) {
    return []  // adapter 已覆盖全部字段
  }
  
  // Level 2: 调用 LLM 识别未覆盖的字段
  const result = await chrome.runtime.sendMessage({
    type: 'IDENTIFY_FIELDS',
    platform,
    fields: unmappedFields,
  })
  
  // 过滤低置信度结果（< 0.6 交给 Level 3）
  const llmMappings = result.mappings.filter(
    (m: FieldMapping) => m.confidence >= 0.6 && m.resumeKey
  )
  const lowConfidenceIndices = result.mappings
    .filter((m: FieldMapping) => m.confidence < 0.6)
    .map((m: FieldMapping) => m.index)
  
  // Level 3: 关键词规则兜底
  const ruleMappings = matchByKeywords(
    unmappedFields.filter(f => lowConfidenceIndices.includes(f.index))
  )
  
  return [...llmMappings, ...ruleMappings]
}
```

#### 识别结果缓存策略

LLM 识别结果按平台缓存，避免重复调用：

```typescript
interface CachedMapping {
  platform: string
  urlPattern: string       // 投递页 URL 正则
  mappings: FieldMapping[]
  createdAt: number        // 缓存时间
  ttl: number              // 1 小时
}

// 存储在 chrome.storage.local
const CACHE_KEY = 'rc_field_mappings_cache'
```

#### 成本估算

| 项目 | 数值 |
|------|------|
| 单次 prompt token | ~400 (字段列表 + prompt) |
| 单次 completion token | ~200 (映射结果) |
| 单次成本 (gpt-4o-mini) | ~$0.0003 |
| 每用户日限额 | 100 次 |
| 月成本 (1000 DAU) | ~$9 |

**关键优化**：字段搜索限定在 `adapter.getFormContainer()` 返回的容器内，避免整页搜索误匹配。

### 5.3 字段映射规则引擎（field-mapper.ts）

```typescript
interface FieldRule {
  resumeKey: string                    // ResolvedResumeData 中的路径
  keywords: string[]                   // 匹配关键词
  type: 'text' | 'select' | 'date' | 'multi-select' | 'number-range'
  transform?: (value: unknown) => string  // 值转换（如日期格式化）
}

const FIELD_RULES: FieldRule[] = [
  { resumeKey: 'personal.name',           keywords: ['姓名', '名字', 'name'],       type: 'text' },
  { resumeKey: 'personal.phone',          keywords: ['手机', '电话', 'phone'],       type: 'text' },
  { resumeKey: 'personal.email',          keywords: ['邮箱', 'email'],              type: 'text' },
  { resumeKey: 'personal.gender',         keywords: ['性别', 'gender'],             type: 'select' },
  { resumeKey: 'personal.education',      keywords: ['学历', '最高学历'],            type: 'select' },
  { resumeKey: 'personal.workYears',      keywords: ['工作年限', '工作经验'],        type: 'select' },
  { resumeKey: 'personal.age',            keywords: ['出生日期', '生日', 'birthday'], type: 'date',
    transform: (v: string) => v },         // YYYY-MM → 按平台要求格式化
  { resumeKey: 'personal.hometown',       keywords: ['籍贯', '户口', '现居城市'],    type: 'text' },
  { resumeKey: 'personal.city',           keywords: ['期望城市', '工作城市'],        type: 'text' },
  { resumeKey: 'personal.targetPosition', keywords: ['期望职位', '求职意向'],        type: 'text' },
  { resumeKey: 'summary',                 keywords: ['自我评价', '个人简介'],        type: 'text' },
]
```

### 5.4 模拟操作执行器（simulator.ts）

#### 普通文本输入（React/Vue 兼容）

```typescript
async function fillInput(el: HTMLInputElement, value: string): Promise<void> {
  el.focus()
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype, 'value'
  )!.set!
  nativeSetter.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  el.blur()
}
```

#### textarea（自我评价等长文本）

```typescript
async function fillTextarea(el: HTMLTextAreaElement, value: string): Promise<void> {
  el.focus()
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype, 'value'
  )!.set!
  nativeSetter.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  el.blur()
}
```

#### 原生 `<select>` 下拉

```typescript
async function fillSelect(el: HTMLSelectElement, value: string): Promise<void> {
  const option = [...el.options].find(
    o => o.value === value || o.text.includes(value)
  )
  if (option) {
    el.value = option.value
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }
}
```

#### 自定义下拉（div/ul 模拟）

```typescript
async function fillCustomSelect(triggerEl: HTMLElement, value: string): Promise<void> {
  triggerEl.click()
  await sleep(300)
  const container = triggerEl.closest('[class*="select"]') ?? document
  const items = container.querySelectorAll(
    '.dropdown-item, [role="option"], li[class*="option"]'
  )
  const match = [...items].find(el => el.textContent?.trim().includes(value))
  match?.click()
}
```

#### 日期选择器（4 种类型覆盖）

| 类型 | 识别方式 | 处理方案 |
|------|---------|---------|
| 原生 `<input type="date">` | `element.type === 'date'` | 直接赋值 `YYYY-MM-DD` |
| 年月分离选择器 | 检测相邻 year/month 下拉或输入 | 分别填写年、月字段 |
| Antd/Element DatePicker | 检测 `.ant-picker` / `.el-date-picker` | 点击 → 输入文本 → Enter |
| 滑动/弹窗选择器 | 检测 `picker-column` 等类名 | 计算差值 → 模拟滚动 |

```typescript
async function fillDateField(el: HTMLElement, value: string): Promise<void> {
  // 策略 1：原生 date input
  if (el instanceof HTMLInputElement && el.type === 'date') {
    el.value = value.replace(/^\d{4}-\d{2}$/, '$&-01')
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return
  }

  // 策略 2：Antd DatePicker
  const picker = el.closest('.ant-picker, .el-date-picker')
  if (picker) {
    const input = picker.querySelector('input')
    if (input) {
      input.focus()
      document.execCommand('selectAll')
      document.execCommand('insertText', false, value)
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    }
    return
  }

  // 策略 3：年月分离
  const yearSelect = el.querySelector('select[class*="year"], input[placeholder*="年"]')
  const monthSelect = el.querySelector('select[class*="month"], input[placeholder*="月"]')
  if (yearSelect && monthSelect) {
    const [year, month] = value.split('-')
    await fillSelectOrInput(yearSelect, year)
    await sleep(100)
    await fillSelectOrInput(monthSelect, month)
    return
  }

  // 策略 4：滑动选择器（降级）
  el.click()
  await sleep(300)
  // 尝试在弹出的 picker 面板中直接输入
  const pickerInput = document.querySelector(
    '.picker-column input, [role="listbox"] input'
  )
  if (pickerInput instanceof HTMLInputElement) {
    await fillInput(pickerInput, value)
  }
}
```

### 5.5 填充结果反馈（highlight.ts）

填充完成后，在页面上直观标注结果：

- ✅ **成功字段**：绿色边框 + 微弱绿色背景（2s 后淡出）
- ❌ **未匹配字段**：黄色边框 + tooltip 提示"此字段未能自动识别，请手动填写"
- 在页面右下角弹出摘要面板：`已填充 12/15 字段 | 3 个字段需手动补充`

---

## 六、投递流程

```
用户打开招聘平台投递页
       │
       ▼
  Content Script 检测页面
       │
       ├── 未识别 → Popup 显示"当前页面不支持"
       │
       └── 已识别平台
              │
              ▼
      用户点击"一键填充"
              │
              ▼
  Background 调用 ResumeCraft API
  GET /api/resumes → 选择默认简历
  GET /api/resumes/:id → 获取 Modules
  GET /api/resumes/:id/snapshots/:snapshotId → 获取快照内容（可选）
              │
              ▼
  resolver.ts 将 Modules 解析为 ResolvedResumeData
              │
              ▼
  detector → 识别平台 → 加载 adapter
              │
              ├── Level 1: adapter 硬编码选择器覆盖已知字段
              │
              ├── Level 2: 未覆盖字段 → DOM 序列化
              │            → POST /api/extension/identify-fields (LLM 语义识别)
              │            → 返回字段映射 + 置信度
              │
              └── Level 3: LLM 置信度 < 0.6 → 关键词规则兜底
              │
              ▼
  合并三级映射结果 → 去重（高优先级覆盖低优先级）
              │
              ▼
  simulator → 按类型填充（随机 300-800ms 间隔）
              │
              ▼
  highlight → 标注填充结果
              │
              ▼
  用户确认 → 手动点击"投递"按钮
              │
              ▼
  POST /api/extension/apply-records → 记录投递
```

---

## 七、安全与合规设计

| 维度 | 策略 |
|------|------|
| **认证** | 复用 ResumeCraft JWT，存 `chrome.storage.session`（关闭浏览器自动清除） |
| **数据不落地** | 简历数据只在内存中处理，不写入 localStorage / IndexedDB |
| **不自动提交** | 插件只负责填充，投递按钮必须用户手动点击 |
| **频率限制** | 填充操作间隔 300-800ms 随机延迟，模拟人工节奏 |
| **最小权限** | manifest.json 仅申请 `activeTab` + `storage` + 指定 host_permissions |
| **风控提示** | Popup 首次使用时展示使用须知，确认后才能启用 |
| **平台条款** | 仅供个人效率提升，不用于批量轰炸，单日填充上限 50 次 |

---

## 八、ResumeCraft 后端改动汇总

### 新增（2 个 API + 1 张表）

**API 1**：`POST /api/extension/identify-fields`

```go
type SerializedField struct {
    Index       int      `json:"index"`
    Tag         string   `json:"tag"`
    Type        string   `json:"type,omitempty"`
    Label       string   `json:"label,omitempty"`
    Placeholder string   `json:"placeholder,omitempty"`
    Name        string   `json:"name,omitempty"`
    Options     []string `json:"options,omitempty"`
    Required    bool     `json:"required"`
    ParentText  string   `json:"parentText,omitempty"`
}

type IdentifyFieldsRequest struct {
    Platform string            `json:"platform"`
    Fields   []SerializedField `json:"fields" binding:"required"`
}

type IdentifyFieldsResponse struct {
    Mappings []FieldMapping `json:"mappings"`
}

type FieldMapping struct {
    Index      int     `json:"index"`
    ResumeKey  string  `json:"resumeKey"`
    Confidence float64 `json:"confidence"`
    Reasoning  string  `json:"reasoning"`
}
```

**API 2**：`POST /api/extension/apply-records`

```go
type CreateApplyRecordRequest struct {
    Platform       string `json:"platform" binding:"required"`    // boss / zhilian / liepin
    JobTitle       string `json:"jobTitle"`                       // 岗位名称
    Company        string `json:"company"`                        // 公司名称
    ResumeID       string `json:"resumeId" binding:"required"`
    SnapshotID     string `json:"snapshotId"`                     // 使用的快照
    PageURL        string `json:"pageUrl"`                        // 投递页 URL（用于去重判断）
}
```

**数据库**：

```sql
CREATE TABLE apply_records (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id),
    platform    VARCHAR(20) NOT NULL,
    job_title   VARCHAR(200),
    company     VARCHAR(200),
    resume_id   UUID NOT NULL REFERENCES resumes(id),
    snapshot_id UUID REFERENCES resume_versions(id),
    page_url    VARCHAR(500),
    created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_apply_records_user ON apply_records(user_id, created_at DESC);
```

### 无需新建

- ~~Extension Token 表~~ → 复用 JWT
- ~~Extension 专用简历数据 API~~ → 复用 `GET /api/resumes/:id`
- ~~Extension 专用快照列表 API~~ → 复用 `GET /api/resumes/:id/snapshots`
- ~~Extension 专用快照详情 API~~ → 复用 `GET /api/resumes/:id/snapshots/:snapshotId`

---

## 九、分阶段交付计划

| 阶段 | 目标 | 内容 |
|------|------|------|
| **P0 MVP** | 验证核心链路 | Background JWT 登录 + resolver 映射 + Boss直聘 adapter (Level 1) + 关键词规则兜底 (Level 3) + 文本/select 填充 + 填充结果高亮 |
| **P1 智能** | LLM Agent 字段识别 | 后端 `identify-fields` API + DOM 序列化 + LLM 语义映射 (Level 2) + 置信度过滤 + 缓存策略 + 日期选择器 4 种模式 |
| **P2 稳定** | 覆盖复杂场景 | 自定义下拉 + 未匹配字段黄色提示 + 投递记录 API + adapter 选择器远程热更新 |
| **P3 扩展** | 多平台 | 智联招聘/猎聘 adapter + Popup 投递历史 + 快照版本切换 + Vision 模式（截图识别特殊布局） |

---

## 十、Boss直聘 Adapter 示例（P0 交付内容）

```typescript
// adapters/boss.ts
const BOSS_SELECTORS: FieldSelectorMap = {
  name:        'input[name="name"], .name-input input',
  phone:       'input[name="phone"], input[placeholder*="手机"]',
  email:       'input[name="email"], input[placeholder*="邮箱"]',
  gender:      '.gender-select, [class*="gender"] select',
  education:   '.education-select, [class*="education"] select',
  workYears:   '.work-year-select, [class*="workYear"] select',
  targetCity:  '.city-select, [class*="expectCity"]',
  targetPosition: 'input[name="position"], input[placeholder*="期望职位"]',
  summary:     'textarea[name="advantage"], textarea[placeholder*="优势"]',
}

export const bossAdapter: PlatformAdapter = {
  isApplyPage() {
    return /boss\.zhipin\.com/.test(location.hostname)
      && /\/geek\/interaction\/delivery|\/chat/.test(location.pathname)
  },

  getFieldSelectors() {
    return BOSS_SELECTORS
  },

  getFormContainer() {
    return document.querySelector('.delivery-form, .chat-container')
      ?? document.body
  },
}
```
