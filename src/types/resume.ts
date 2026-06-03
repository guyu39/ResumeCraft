// ============================================================
// 简历大师 - ResumeCraft
// 类型定义文件
// ============================================================

// ---------- 基础枚举 & 常量 ----------

/** 主题色预设 */
export const THEME_COLORS = {
  商务蓝: '#1A56DB',
  活力绿: '#059669',
  热情红: '#DC2626',
  优雅紫: '#7C3AED',
  活力橙: '#EA580C',
  沉稳黑: '#111827',
} as const

export type ThemeColorKey = keyof typeof THEME_COLORS
export type ThemeColorPresetValue = (typeof THEME_COLORS)[ThemeColorKey]
export type ThemeColorValue = string

/** 简历模板类型 */
export type TemplateType = 'classic' | 'modern' | 'minimal'

/** 简历语言 */
export type ResumeLocale = 'zh-CN' | 'en-US'

/** 行业模板预设 */
export type IndustryPresetId = 'general' | 'tech' | 'product' | 'design' | 'finance'

/** 技能熟练度等级 */
export type SkillLevel = 1 | 2 | 3 | 4
export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  1: '入门',
  2: '熟悉',
  3: '熟练',
  4: '精通',
}

/** 学历选项 */
export const DEGREE_OPTIONS = ['初中', '中专', '高中', '大专', '本科', '硕士', '博士'] as const
export type Degree = (typeof DEGREE_OPTIONS)[number]

/** 工作年限选项 */
export const WORK_YEARS_OPTIONS = [
  '应届毕业生', '1年以下', '1-3年', '3-5年', '5-10年', '10年以上',
] as const

/** 技能展示模式 */
export type SkillDisplayMode = 'tags' | 'bars'

// ---------- 模块类型枚举 ----------
export type ModuleType =
  | 'personal' | 'education' | 'work' | 'project'
  | 'skills' | 'awards' | 'summary'
  | 'certificates' | 'portfolio' | 'languages' | 'custom' | 'ai-engineering'

/** 模块元信息 */
export interface ModuleMeta {
  type: ModuleType
  label: string
  icon: string
  maxCount: number
  category: 'overview' | 'experience' | 'achievement' | 'ability' | 'link' | 'special'
  fixed?: boolean
}

/** 固定模块类型（默认显示，不可删除） */
export const FIXED_MODULE_TYPES: ModuleType[] = [
  'personal', 'education', 'work', 'project', 'skills', 'summary',
]

export const MODULE_META_LIST: ModuleMeta[] = [
  { type: 'personal', label: '个人信息', icon: '👤', maxCount: 1, category: 'overview', fixed: true },
  { type: 'education', label: '教育经历', icon: '🎓', maxCount: 0, category: 'experience', fixed: true },
  { type: 'work', label: '工作经历', icon: '💼', maxCount: 0, category: 'experience', fixed: true },
  { type: 'project', label: '项目经历', icon: '🚀', maxCount: 0, category: 'experience', fixed: true },
  { type: 'skills', label: '专业技能', icon: '🛠️', maxCount: 1, category: 'ability', fixed: true },
  { type: 'summary', label: '自我评价', icon: '📝', maxCount: 1, category: 'overview', fixed: true },
  { type: 'languages', label: '语言能力', icon: '🌐', maxCount: 1, category: 'ability' },
  { type: 'awards', label: '荣誉奖项', icon: '🏆', maxCount: 1, category: 'achievement' },
  { type: 'certificates', label: '证书资质', icon: '📜', maxCount: 1, category: 'achievement' },
  { type: 'portfolio', label: '作品链接', icon: '🔗', maxCount: 1, category: 'link' },
  { type: 'ai-engineering', label: 'AI 工程', icon: '🤖', maxCount: 0, category: 'special' },
  { type: 'custom', label: '自定义模块', icon: '✨', maxCount: 0, category: 'special' },
]

/** 模块标题多语言映射：根据 locale 获取模块默认标题 */
export const MODULE_TITLES_BY_LOCALE: Record<ResumeLocale, Record<ModuleType, string>> = {
  'zh-CN': {
    personal: '个人信息',
    education: '教育经历',
    work: '工作经历',
    project: '项目经历',
    skills: '专业技能',
    summary: '自我评价',
    languages: '语言能力',
    awards: '荣誉奖项',
    certificates: '证书资质',
    portfolio: '作品链接',
    'ai-engineering': 'AI 工程',
    custom: '自定义模块',
  },
  'en-US': {
    personal: 'Personal Information',
    education: 'Education',
    work: 'Work Experience',
    project: 'Projects',
    skills: 'Skills',
    summary: 'Summary',
    languages: 'Languages',
    awards: 'Awards & Honors',
    certificates: 'Certifications',
    portfolio: 'Portfolio',
    'ai-engineering': 'AI Engineering',
    custom: 'Custom',
  },
}

// ---------- 各模块数据结构 ----------

export interface PersonalData {
  name: string
  targetPosition: string
  phone: string
  email: string
  gender: string
  education: string
  extraInfos: Array<{ id: string; title: string; value: string }>
  personalAccount: { platform: string; url: string }
  city: string      // 所在城市（选填）
  avatar: string
  avatarShape?: 'circle' | 'square'
  website: string
  github: string
  linkedin: string
  workYears: string
  politics: string    // 政治面貌：群众/共青团员/中共党员等
  age: string       // 出生年月（必填，YYYY-MM）
  hometown: string  // 籍贯（必填）
}

export interface EducationItem {
  id: string
  school: string
  major: string
  degree: Degree
  startDate: string
  endDate: string
  gpa: string
  honors: string
  schoolExperience: string
}

export interface WorkItem {
  id: string
  company: string
  position: string
  department: string
  startDate: string
  endDate: string
  description: string
  companySize: string
}

export interface ProjectItem {
  id: string
  name: string
  role: string
  startDate: string
  endDate: string
  description: string
  link: string
  techStack: string[]
}

export interface SkillItem {
  id: string
  name: string
  level: SkillLevel
}

export interface SkillsData {
  content: string
  displayMode?: SkillDisplayMode
  items?: SkillItem[]
}

export interface AwardItem {
  id: string
  name: string
  level: string
  date: string
  description: string
}

export interface SummaryData {
  content: string
}

// ---------- AI 工程 ----------
export const AI_PRACTICE_PLACEHOLDER = '例如：基于 RAG 的企业知识库建设及全链路研发提效'

export const AI_TOOLCHAIN_PLACEHOLDER = '例如 Cursor, OpenClaw, Qdrant, React, Java WebFlux...'

export type AIStandard =
  | 'doc-first'       // 技术文档与接口设计先行（必选）
  | 'prompt-guided'   // 阶段性 Prompt 引导
  | 'multi-compare'   // 多套 AI 方案对比选型
  | 'security-audit'  // 安全与并发漏洞人工核验

export const AI_STANDARD_OPTIONS: { value: AIStandard; label: string; required?: boolean; desc: string }[] = [
  { value: 'doc-first', label: '文档与接口先行', required: true, desc: '技术文档与接口设计先行，严格约束代码生成边界，避免 AI 幻觉与架构失控' },
  { value: 'prompt-guided', label: 'Prompt 分阶段引导', desc: '将复杂任务拆解为多阶段 Prompt，逐步引导 AI 输出方案→编码→风险改造' },
  { value: 'multi-compare', label: '多方案对比选型', desc: '生成多套 AI 方案，从成本、可维护性、安全性等维度做工程选型' },
  { value: 'security-audit', label: '安全与并发核验', desc: '对 AI 生成代码进行安全、并发、兼容性、数据一致性人工核查' },
]

export const AI_STANDARD_LABELS: Record<AIStandard, string> = {
  'doc-first': '文档与接口先行',
  'prompt-guided': 'Prompt 分阶段引导',
  'multi-compare': '多方案对比选型',
  'security-audit': '安全与并发核验',
}

export const AI_STANDARD_LABELS_EN: Record<AIStandard, string> = {
  'doc-first': 'Doc & Interface First',
  'prompt-guided': 'Phased Prompt Guidance',
  'multi-compare': 'Multi-Solution Comparison',
  'security-audit': 'Security & Concurrency Audit',
}

export interface AIEfficiencyMetric {
  label: string
  value: string
}

export interface AIEngineeringItem {
  id: string
  practiceName: string
  role: string
  timeRange: string
  projectUrl: string
  toolchain: string[]
  standards: AIStandard[]
  scenario: string
  efficiency: AIEfficiencyMetric[]
  assets: string[]
}

export interface AIEngineeringData {
  items: AIEngineeringItem[]
}

export interface CertificateItem {
  id: string
  name: string
  date: string
  issuer: string
}

export interface PortfolioItem {
  id: string
  title: string
  url: string
  description: string
}

export interface LanguageItem {
  id: string
  language: string
  level: string
}

export interface CustomItem {
  id: string
  title: string
  content: string
  date: string
}

export interface CustomData {
  title: string
  items: CustomItem[]
}

export type ModuleData =
  | PersonalData
  | { items: EducationItem[] }
  | { items: WorkItem[] }
  | { items: ProjectItem[] }
  | SkillsData
  | { items: AwardItem[] }
  | SummaryData
  | AIEngineeringData
  | { items: CertificateItem[] }
  | { items: PortfolioItem[] }
  | { items: LanguageItem[] }
  | CustomData

export interface Module {
  id: string
  type: ModuleType
  title: string
  visible: boolean
  data: ModuleData
}

export type ModuleTitleLinePosition = 'left' | 'bottom' | 'none'
export type ModuleTitleMarkerStyle = 'bar' | 'pill' | 'dot' | 'square' | 'none'

export interface ResumeStyleSettings {
  fontFamily: string            // 内容字体（向后兼容）
  fontSize: number              // 内容字号（向后兼容）
  moduleTitleFontFamily: string // 模块标题字体
  moduleTitleFontSize: number   // 模块标题字号（必须 >= fontSize + 1）
  textColor: string
  lineHeight: number
  pagePaddingHorizontal: number
  pagePaddingVertical: number
  moduleSpacing: number
  paragraphSpacing: number
  moduleTitleLinePosition: ModuleTitleLinePosition
  moduleTitleMarkerStyle: ModuleTitleMarkerStyle
  moduleTitleMarkerVisible: boolean
}

export const DEFAULT_RESUME_STYLE_SETTINGS: ResumeStyleSettings = {
  fontFamily: 'Microsoft YaHei',
  fontSize: 12,
  moduleTitleFontFamily: 'Microsoft YaHei',
  moduleTitleFontSize: 14,
  textColor: '#363636',
  lineHeight: 1.3,
  pagePaddingHorizontal: 20,
  pagePaddingVertical: 20,
  moduleSpacing: 7,
  paragraphSpacing: 1,
  moduleTitleLinePosition: 'left',
  moduleTitleMarkerStyle: 'bar',
  moduleTitleMarkerVisible: true,
}

export interface IndustryTemplatePreset {
  id: IndustryPresetId
  name: string
  description: string
  template: TemplateType
  themeColor: ThemeColorValue
  locale: ResumeLocale
  styleSettings: Partial<ResumeStyleSettings>
}

export const INDUSTRY_TEMPLATE_PRESETS: IndustryTemplatePreset[] = [
  {
    id: 'general',
    name: '通用求职',
    description: '稳健清晰，适配大多数岗位',
    template: 'classic',
    themeColor: '#1A56DB',
    locale: 'zh-CN',
    styleSettings: { fontFamily: 'Microsoft YaHei', fontSize: 12, lineHeight: 1.3 },
  },
  {
    id: 'tech',
    name: '技术工程',
    description: '突出项目和技术栈信息',
    template: 'modern',
    themeColor: '#0F766E',
    locale: 'zh-CN',
    styleSettings: { fontFamily: 'Source Han Sans', fontSize: 11, lineHeight: 1.35 },
  },
  {
    id: 'product',
    name: '产品运营',
    description: '强调结果与协作叙事',
    template: 'classic',
    themeColor: '#0F4C81',
    locale: 'zh-CN',
    styleSettings: { fontFamily: 'PingFang SC', fontSize: 12, lineHeight: 1.4 },
  },
  {
    id: 'design',
    name: '设计创意',
    description: '轻量留白，聚焦作品表达',
    template: 'minimal',
    themeColor: '#7C3AED',
    locale: 'zh-CN',
    styleSettings: { fontFamily: 'PingFang SC', fontSize: 11, lineHeight: 1.45 },
  },
  {
    id: 'finance',
    name: '金融咨询',
    description: '专业克制，信息结构严谨',
    template: 'classic',
    themeColor: '#1E3A8A',
    locale: 'zh-CN',
    styleSettings: { fontFamily: 'SimSun', fontSize: 11, lineHeight: 1.32 },
  },
]

export interface Resume {
  id: string
  title: string
  locale: ResumeLocale
  template: TemplateType
  themeColor: ThemeColorValue
  styleSettings: ResumeStyleSettings
  updatedAt: number
  modules: Module[]
}

// ---------- Store 类型 ----------
export interface ResumeStore {
  resume: Resume
  activeModuleId: string | null
  isLoading: boolean
  lastSavedAt: number | null
  initResume: (resume?: Partial<Resume>) => void
  setLocale: (locale: ResumeLocale) => void
  setTemplate: (template: TemplateType) => void
  applyIndustryPreset: (presetId: IndustryPresetId) => void
  setThemeColor: (color: ThemeColorValue) => void
  setStyleSettings: (settings: Partial<ResumeStyleSettings>) => void
  setActiveModule: (moduleId: string | null) => void
  updateModuleData: <T extends ModuleData>(moduleId: string, data: Partial<T>) => void
  updateModuleTitle: (moduleId: string, title: string) => void
  addModule: (type: ModuleType) => void
  removeModule: (moduleId: string) => void
  reorderModules: (oldIndex: number, newIndex: number) => void
  toggleModuleVisible: (moduleId: string) => void
  markSaved: () => void
  loadFromStorage: () => void
}

// ---------- 校验类型 ----------
export interface ValidationError {
  moduleId: string
  field: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}
