// ============================================================
// 简历大师 - ResumeCraft
// Zustand 状态管理
// ============================================================

import { create } from 'zustand'
import {
  Resume,
  ResumeStyleSettings,
  Module,
  ModuleType,
  ModuleData,
  TemplateType,
  ResumeLocale,
  IndustryPresetId,
  ThemeColorValue,
  PersonalData,
  EducationItem,
  WorkItem,
  ProjectItem,
  SkillsData,
  AwardItem,
  SummaryData,
  CertificateItem,
  PortfolioItem,
  LanguageItem,
  CustomData,
  MODULE_META_LIST,
  INDUSTRY_TEMPLATE_PRESETS,
  DEFAULT_RESUME_STYLE_SETTINGS,
  FIXED_MODULE_TYPES,
} from '@/types/resume'

// ---------- 防抖工具函数 ----------
function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      fn(...args)
      timer = null
    }, delay)
  }
}

// ---------- localStorage Key ----------
const STORAGE_KEY = 'resumecraft_draft'
const STORAGE_COLLECTION_KEY = 'resumecraft_resume_collection'
const CURRENT_RESUME_ID_KEY = 'resumecraft_current_resume_id'
const STORAGE_VERSION = 1

// ---------- 工具：生成唯一 ID ----------
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ---------- 工具：获取默认模块元数据 ----------
function getModuleMeta(type: ModuleType) {
  return MODULE_META_LIST.find((m) => m.type === type)!
}

// ---------- 工具：创建空模块数据 ----------
function createDefaultModuleData(type: ModuleType): ModuleData {
  switch (type) {
    case 'personal':
      return {
        name: '',
        targetPosition: '',
        phone: '',
        email: '',
        gender: '',
        education: '',
        extraInfos: [],
        city: '',
        avatar: '',
        avatarShape: 'circle',
        website: '',
        github: '',
        linkedin: '',
        workYears: '',
        politics: '',
        age: '',
        hometown: '',
      } satisfies PersonalData

    case 'education':
      return {
        items: [
          {
            id: generateId(),
            school: '',
            major: '',
            degree: '本科',
            startDate: '',
            endDate: '',
            gpa: '',
            honors: '',
            schoolExperience: '',
          } satisfies EducationItem,
        ],
      }

    case 'work':
      return {
        items: [
          {
            id: generateId(),
            company: '',
            position: '',
            department: '',
            startDate: '',
            endDate: '',
            description: '',
            companySize: '',
          } satisfies WorkItem,
        ],
      }

    case 'project':
      return {
        items: [
          {
            id: generateId(),
            name: '',
            role: '',
            startDate: '',
            endDate: '',
            description: '',
            link: '',
            techStack: [],
          } satisfies ProjectItem,
        ],
      }

    case 'skills':
      return {
        content: '',
      } satisfies SkillsData

    case 'awards':
      return {
        items: [
          {
            id: generateId(),
            name: '',
            level: '',
            date: '',
            description: '',
          } satisfies AwardItem,
        ],
      }

    case 'summary':
      return {
        content: '',
      } satisfies SummaryData

    case 'certificates':
      return {
        items: [
          {
            id: generateId(),
            name: '',
            date: '',
            issuer: '',
          } satisfies CertificateItem,
        ],
      }

    case 'portfolio':
      return {
        items: [
          {
            id: generateId(),
            title: '',
            url: '',
            description: '',
          } satisfies PortfolioItem,
        ],
      }

    case 'languages':
      return {
        items: [
          {
            id: generateId(),
            language: '',
            level: '',
          } satisfies LanguageItem,
        ],
      }

    case 'custom':
      return {
        title: '自定义模块',
        items: [
          {
            id: generateId(),
            title: '',
            content: '',
            date: '',
          },
        ],
      } satisfies CustomData

    default:
      return { items: [] } as ModuleData
  }
}

// ---------- 工具：创建新模块 ----------
function createModule(type: ModuleType): Module {
  const meta = getModuleMeta(type)
  const title = type === 'custom' ? '自定义模块' : meta.label
  return {
    id: generateId(),
    type,
    title,
    visible: true,
    data: createDefaultModuleData(type),
  }
}

// ---------- 默认初始简历数据（固定模块） ----------
function createDefaultResume(): Resume {
  const fixedTypes: ModuleType[] = ['personal', 'education', 'work', 'project', 'skills', 'summary']
  const fixedModules = fixedTypes.map((type) => createModule(type))
  const now = new Date()
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  return {
    id: generateId(),
    title: `简历-${dateStr}`,
    locale: 'zh-CN',
    template: 'classic',
    themeColor: '#1A56DB',
    styleSettings: { ...DEFAULT_RESUME_STYLE_SETTINGS },
    updatedAt: Date.now(),
    modules: fixedModules,
  }
}

// ---------- localStorage 工具 ----------
interface StoragePayload {
  version: number
  data: Resume
  savedAt: number
}

interface CollectionPayload {
  version: number
  items: Resume[]
  savedAt: number
}

function getCurrentResumeIdFromStorage(): string | null {
  try {
    return localStorage.getItem(CURRENT_RESUME_ID_KEY)
  } catch {
    return null
  }
}

function setCurrentResumeIdToStorage(id: string): void {
  try {
    localStorage.setItem(CURRENT_RESUME_ID_KEY, id)
  } catch {
    // noop
  }
}

function saveResumeCollection(items: Resume[]): void {
  try {
    const payload: CollectionPayload = {
      version: STORAGE_VERSION,
      items,
      savedAt: Date.now(),
    }
    localStorage.setItem(STORAGE_COLLECTION_KEY, JSON.stringify(payload))
  } catch (e) {
    console.warn('[ResumeStore] 简历集合保存失败:', e)
  }
}

function loadResumeCollection(): Resume[] {
  try {
    const raw = localStorage.getItem(STORAGE_COLLECTION_KEY)
    if (!raw) return []
    const payload: CollectionPayload = JSON.parse(raw)
    if (payload.version !== STORAGE_VERSION || !Array.isArray(payload.items)) {
      return []
    }
    return payload.items
      .slice()
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  } catch (e) {
    console.warn('[ResumeStore] 简历集合读取失败:', e)
    return []
  }
}

function upsertResumeToCollection(resume: Resume): void {
  const items = loadResumeCollection()
  const index = items.findIndex((item) => item.id === resume.id)
  if (index >= 0) {
    items[index] = resume
  } else {
    items.unshift(resume)
  }
  saveResumeCollection(
    items.slice().sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  )
}

function saveToStorage(resume: Resume): void {
  try {
    const payload: StoragePayload = {
      version: STORAGE_VERSION,
      data: resume,
      savedAt: Date.now(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    upsertResumeToCollection(resume)
    setCurrentResumeIdToStorage(resume.id)
  } catch (e) {
    console.warn('[ResumeStore] localStorage 保存失败:', e)
  }
}

function loadDraftFromStorage(): Resume | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const payload: StoragePayload = JSON.parse(raw)
    if (payload.version !== STORAGE_VERSION) {
      console.warn('[ResumeStore] 版本不匹配，清除旧数据')
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return payload.data
  } catch (e) {
    console.warn('[ResumeStore] localStorage 读取失败:', e)
    return null
  }
}

// ---------- 防抖保存 ----------
const debouncedSave = debounce((resume: Resume) => {
  saveToStorage(resume)
}, 500)

// ---------- Zustand Store ----------
interface ResumeStoreState {
  // 简历数据
  resume: Resume

  // 当前选中模块 ID
  activeModuleId: string | null

  // 是否正在加载
  isLoading: boolean

  // 最后保存时间
  lastSavedAt: number | null
}

interface ResumeStoreActions {
  // 初始化/重置简历
  initResume: (resume?: Partial<Resume>) => void

  // 切换简历语言
  setLocale: (locale: ResumeLocale) => void

  // 切换模板
  setTemplate: (template: TemplateType) => void

  // 应用行业模板预设
  applyIndustryPreset: (presetId: IndustryPresetId) => void

  // 切换主题色
  setThemeColor: (color: ThemeColorValue) => void

  // 更新简历样式设置
  setStyleSettings: (settings: Partial<ResumeStyleSettings>) => void

  // 切换当前激活模块
  setActiveModule: (moduleId: string | null) => void

  // 更新指定模块的数据（深度合并）
  updateModuleData: <T extends ModuleData>(
    moduleId: string,
    data: Partial<T>
  ) => void

  // 更新指定模块标题
  updateModuleTitle: (moduleId: string, title: string) => void

  // 添加一个新模块
  addModule: (type: ModuleType) => void

  // 删除指定模块
  removeModule: (moduleId: string) => void

  // 重新排序模块
  reorderModules: (oldIndex: number, newIndex: number) => void

  // 切换模块显隐
  toggleModuleVisible: (moduleId: string) => void

  // 标记已保存
  markSaved: () => void

  // 从 localStorage 加载
  loadFromStorage: () => void
}

type ResumeStore = ResumeStoreState & ResumeStoreActions

export const useResumeStore = create<ResumeStore>((set) => ({
  // ---------- 初始状态 ----------
  resume: createDefaultResume(),
  activeModuleId: null,
  isLoading: false,
  lastSavedAt: null,

  // ---------- initResume ----------
  initResume: (partial) => {
    const base = createDefaultResume()
    const next: Resume = {
      ...base,
      ...partial,
      locale: partial?.locale ?? base.locale,
      styleSettings: {
        ...DEFAULT_RESUME_STYLE_SETTINGS,
        ...(partial?.styleSettings ?? {}),
      },
      modules: partial?.modules ?? base.modules,
    }
    next.updatedAt = Date.now()
    set({ resume: next, activeModuleId: next.modules[0]?.id ?? null })
    saveToStorage(next)
  },

  // ---------- setLocale ----------
  setLocale: (locale) => {
    set((state) => {
      const next = {
        ...state.resume,
        locale,
        updatedAt: Date.now(),
      }
      debouncedSave(next)
      return { resume: next }
    })
  },

  // ---------- setTemplate ----------
  setTemplate: (template) => {
    set((state) => {
      const next = {
        ...state.resume,
        template,
        updatedAt: Date.now(),
      }
      debouncedSave(next)
      return { resume: next }
    })
  },

  // ---------- applyIndustryPreset ----------
  applyIndustryPreset: (presetId) => {
    set((state) => {
      const preset = INDUSTRY_TEMPLATE_PRESETS.find((item) => item.id === presetId)
      if (!preset) return state

      const next = {
        ...state.resume,
        template: preset.template,
        themeColor: preset.themeColor,
        locale: preset.locale,
        styleSettings: {
          ...DEFAULT_RESUME_STYLE_SETTINGS,
          ...state.resume.styleSettings,
          ...preset.styleSettings,
        },
        updatedAt: Date.now(),
      }
      debouncedSave(next)
      return { resume: next }
    })
  },

  // ---------- setThemeColor ----------
  setThemeColor: (color) => {
    set((state) => {
      const next = {
        ...state.resume,
        themeColor: color,
        updatedAt: Date.now(),
      }
      debouncedSave(next)
      return { resume: next }
    })
  },

  // ---------- setStyleSettings ----------
  setStyleSettings: (settings) => {
    set((state) => {
      const next = {
        ...state.resume,
        styleSettings: {
          ...DEFAULT_RESUME_STYLE_SETTINGS,
          ...state.resume.styleSettings,
          ...settings,
        },
        updatedAt: Date.now(),
      }
      debouncedSave(next)
      return { resume: next }
    })
  },

  // ---------- setActiveModule ----------
  setActiveModule: (moduleId) => {
    set({ activeModuleId: moduleId })
  },

  // ---------- updateModuleData ----------
  updateModuleData: (moduleId, data) => {
    set((state) => {
      const modules = state.resume.modules.map((m) => {
        if (m.id !== moduleId) return m
        const updatedData = {
          ...m.data,
          ...data,
        } as ModuleData
        return { ...m, data: updatedData }
      })
      const next = {
        ...state.resume,
        modules,
        updatedAt: Date.now(),
      }
      debouncedSave(next)
      return { resume: next }
    })
  },

  // ---------- updateModuleTitle ----------
  updateModuleTitle: (moduleId, title) => {
    set((state) => {
      const normalizedTitle = title.trim()
      const modules = state.resume.modules.map((m) => {
        if (m.id !== moduleId) return m
        return { ...m, title: normalizedTitle || m.title }
      })
      const next = {
        ...state.resume,
        modules,
        updatedAt: Date.now(),
      }
      debouncedSave(next)
      return { resume: next }
    })
  },

  // ---------- addModule ----------
  addModule: (type) => {
    const meta = getModuleMeta(type)
    set((state) => {
      const existsCount = state.resume.modules.filter((m) => m.type === type).length
      if (meta.maxCount > 0 && existsCount >= meta.maxCount) {
        return state
      }

      const newModule = createModule(type)
      const modules = [...state.resume.modules, newModule]
      const next = {
        ...state.resume,
        modules,
        updatedAt: Date.now(),
      }
      debouncedSave(next)
      return { resume: next, activeModuleId: newModule.id }
    })
  },

  // ---------- removeModule ----------
  removeModule: (moduleId) => {
    set((state) => {
      // 固定模块不可删除
      const target = state.resume.modules.find((m) => m.id === moduleId)
      if (!target || FIXED_MODULE_TYPES.includes(target.type)) return state

      const modules = state.resume.modules.filter((m) => m.id !== moduleId)
      // 如果删除的是当前激活模块，自动激活上一个
      let nextActiveId = state.activeModuleId
      if (state.activeModuleId === moduleId) {
        const idx = state.resume.modules.findIndex((m) => m.id === moduleId)
        nextActiveId = modules[idx - 1]?.id ?? modules[0]?.id ?? null
      }
      const next = {
        ...state.resume,
        modules,
        updatedAt: Date.now(),
      }
      debouncedSave(next)
      return { resume: next, activeModuleId: nextActiveId }
    })
  },

  // ---------- reorderModules ----------
  reorderModules: (oldIndex, newIndex) => {
    set((state) => {
      const modules = [...state.resume.modules]
      const moved = modules[oldIndex]
      if (!moved) return state
      modules.splice(oldIndex, 1)
      modules.splice(newIndex, 0, moved)
      const next = {
        ...state.resume,
        modules,
        updatedAt: Date.now(),
      }
      debouncedSave(next)
      return { resume: next }
    })
  },

  // ---------- toggleModuleVisible ----------
  toggleModuleVisible: (moduleId) => {
    set((state) => {
      const modules = state.resume.modules.map((m) => {
        if (m.id !== moduleId) return m
        return { ...m, visible: !m.visible }
      })
      const next = {
        ...state.resume,
        modules,
        updatedAt: Date.now(),
      }
      debouncedSave(next)
      return { resume: next }
    })
  },

  // ---------- markSaved ----------
  markSaved: () => {
    set({ lastSavedAt: Date.now() })
  },

  // ---------- loadFromStorage ----------
  loadFromStorage: () => {
    set({ isLoading: true })
    const collection = loadResumeCollection()
    const selectedId = getCurrentResumeIdFromStorage()
    const selectedFromCollection = selectedId
      ? collection.find((item) => item.id === selectedId) ?? null
      : null
    const saved = selectedFromCollection ?? loadDraftFromStorage() ?? collection[0] ?? null

    if (saved) {
      setCurrentResumeIdToStorage(saved.id)
      saveToStorage(saved)
      const normalizedResume = {
        ...saved,
        locale: saved.locale ?? 'zh-CN',
        styleSettings: {
          ...DEFAULT_RESUME_STYLE_SETTINGS,
          ...(saved.styleSettings ?? {}),
        },
      }
      set({
        resume: normalizedResume,
        activeModuleId: normalizedResume.modules[0]?.id ?? null,
        isLoading: false,
        lastSavedAt: Date.now(),
      })
    } else {
      // 无保存数据时，使用默认简历
      const defaultResume = createDefaultResume()
      set({
        resume: defaultResume,
        activeModuleId: defaultResume.modules[0]?.id ?? null,
        isLoading: false,
      })
    }
  },
}))

// ---------- 导出工具函数（供外部使用） ----------
function removeResumeFromStorageCollection(id: string): void {
  const items = loadResumeCollection().filter((item) => item.id !== id)
  saveResumeCollection(items)

  const currentId = getCurrentResumeIdFromStorage()
  if (currentId !== id) return

  if (items.length > 0) {
    setCurrentResumeIdToStorage(items[0].id)
    saveToStorage(items[0])
    return
  }

  try {
    localStorage.removeItem(CURRENT_RESUME_ID_KEY)
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // noop
  }
}

function selectResumeForEditingInStorage(id: string): boolean {
  const target = loadResumeCollection().find((item) => item.id === id)
  if (!target) return false
  setCurrentResumeIdToStorage(id)
  saveToStorage(target)
  return true
}

function saveResumeToCollectionStorage(resume: Resume): void {
  upsertResumeToCollection(resume)
}

function renameResumeInStorage(id: string, title: string): boolean {
  const normalizedTitle = title.trim()
  if (!normalizedTitle) return false

  const items = loadResumeCollection()
  const index = items.findIndex((item) => item.id === id)
  if (index < 0) return false

  const renamedResume: Resume = {
    ...items[index],
    title: normalizedTitle,
    updatedAt: Date.now(),
  }
  items[index] = renamedResume
  saveResumeCollection(
    items.slice().sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  )

  const currentId = getCurrentResumeIdFromStorage()
  if (currentId === id) {
    saveToStorage(renamedResume)
  }
  return true
}

function getAllResumesFromStorage(): Resume[] {
  return loadResumeCollection()
}

export {
  createModule,
  generateId,
  createDefaultResume,
  getAllResumesFromStorage,
  saveResumeToCollectionStorage,
  renameResumeInStorage,
  selectResumeForEditingInStorage,
  removeResumeFromStorageCollection,
}
