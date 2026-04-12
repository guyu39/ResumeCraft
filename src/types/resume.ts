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
  | 'certificates' | 'portfolio' | 'languages' | 'custom'

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
  { type: 'portfolio', label: '作品集链接', icon: '🔗', maxCount: 1, category: 'link' },
  { type: 'custom', label: '自定义模块', icon: '✨', maxCount: 0, category: 'special' },
]

// ---------- 各模块数据结构 ----------

export interface PersonalData {
  name: string
  targetPosition: string
  phone: string
  email: string
  gender: string
  education: string
  extraInfos: Array<{ id: string; title: string; value: string }>
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

export interface ResumeStyleSettings {
  fontFamily: string
  fontSize: number
  textColor: string
  lineHeight: number
  pagePaddingHorizontal: number
  pagePaddingVertical: number
  moduleSpacing: number
  paragraphSpacing: number
}

export const DEFAULT_RESUME_STYLE_SETTINGS: ResumeStyleSettings = {
  fontFamily: 'Microsoft YaHei',
  fontSize: 12,
  textColor: '#363636',
  lineHeight: 1.3,
  pagePaddingHorizontal: 20,
  pagePaddingVertical: 20,
  moduleSpacing: 7,
  paragraphSpacing: 1,
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
