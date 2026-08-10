// ============================================================
// 首页工作台 API：待办（笔面试）+ AI 新闻 + GitHub 项目
// ============================================================

import { apiClient } from './client'

export type HomeTodoType = 'interview' | 'written_test'

export interface HomeTodoItem {
  id: string
  type: HomeTodoType
  applicationId: string
  companyName: string
  targetTitle: string
  department?: string
  round?: string
  scheduledAt: number
  scheduledEnd?: number
  status: string
  applicationUrl?: string
}

export interface GithubProjectItem {
  id: number
  fullName: string
  htmlUrl: string
  description: string
  /** AI 中文加工后的一句话简介；为空时前端回退展示 description */
  summaryZh?: string
  /** AI 生成的求职视角亮点点评；可能为空 */
  highlightZh?: string
  language: string
  stars: number
  forks: number
  topics?: string[]
  syncedAt: number
}

// AI 日报单条资讯
export interface DailyReportItem {
  rank: number
  title: string
  url?: string // 原始链接
  source: string
  publishedAt: string
  rating: number // 影响力评级 1-5
  summary: string
  insight: string // 对开发者的启示
}

// AI 日报
export interface DailyReport {
  id: number
  reportDate: string
  title: string
  theme: string
  trendKeywords: string[]
  items: DailyReportItem[]
  createdAt: number
}

// 简历项目推荐
export interface ResumeProject {
  id: number
  name: string
  tagline: string
  techStack: string[]
  modules: string[]
  starSummary: string
  duration: string
  difficulty: number // 1-5
  trendRelation: string
  sortOrder: number
  updatedAt?: number // 更新时间（ms）
}

// 最近新增岗位（后端优先读 Redis 最近新增列表，最多 10 条，按新增时间倒序）
export interface NewJobItem {
  id: string
  companyName: string
  recruitmentType?: string
  location?: string
  positions?: string
  openDate?: number
  applicationUrl?: string
  source?: string
}

// GitHub 开源项目按同步日期分组
export interface GithubGroup {
  date: string
  items: GithubProjectItem[]
}

// 简历项目推荐按更新时间日期分组
export interface ProjectGroup {
  date: string
  items: ResumeProject[]
}

// ============================================================
// AI HOT (https://aihot.virxact.com) 工作台数据
// ============================================================

// AI HOT 快讯条目（/api/v1/items）
export interface AihotItem {
  id: string
  title: string
  originalTitle?: string
  summary: string
  sourceName: string
  linksAihot: string // 站内阅读页
  linksOriginal: string // 第三方原文
  category?: string // ai-models / ai-products / industry / paper / tip
  score: number // 热度分
  publishedAt?: string
  discoveredAt?: string
}

// AI HOT 日报单条（sections 内）
export interface AihotDailySectionItem {
  title: string
  summary?: string
  source?: { name?: string }
  links?: { aihot?: string; original?: string }
}

// AI HOT 日报分组
export interface AihotDailySection {
  label: string
  items: AihotDailySectionItem[]
}

// AI HOT 日报 report 原样（后端 raw 透传）
export interface AihotDailyReport {
  date: string
  generatedAt?: string
  links?: { aihot?: string }
  flashes?: { title?: string; text?: string }[]
  sections?: AihotDailySection[]
}

// AI HOT 日报（后端包装）
export interface AihotDaily {
  reportDate: string
  report: AihotDailyReport
  linksAihot?: string
  generatedAt?: string
  updatedAt?: string
}

// AI HOT 热点榜条目（/api/v1/hot-topics）
export interface AihotHotTopic {
  rank: number
  id: string
  title: string
  sourceName?: string
  linksAihot?: string
  linksOriginal?: string
  linksStory?: string // https://aihot.virxact.com/story/{uuid}
  sourceCount: number
  signalCount: number
  latestAt?: string
}

// AI HOT 事件时间线单条报道
export interface AihotStoryReport {
  id: string
  title: string
  summary?: string
  sourceName?: string
  publishedAt?: string
  linksAihot?: string
  linksOriginal?: string
}

// AI HOT 事件详情（/api/v1/stories/{publicId}）
export interface AihotStory {
  publicId: string
  title: string
  status?: string
  sourceCount?: number
  reportCount?: number
  latest?: string
  digest?: string
  linksAihot?: string
  reports?: AihotStoryReport[]
  fetchedAt?: string
}

export const homeApi = {
  // 首页待办：全部笔试 + 面试时间，按时间升序
  listTodos: () => apiClient.get<{ items: HomeTodoItem[] }>('/home/todos'),

  // GitHub 最新开源项目：近 7 天，按同步日期分组倒序
  listGithubProjects: (days = 7) =>
    apiClient.get<{ groups: GithubGroup[] }>(`/home/github-projects?days=${days}`),

  // AI 日报：近 7 天，按日期倒序
  getDailyReports: (days = 7) => apiClient.get<{ reports: DailyReport[] }>(`/home/daily-report?days=${days}`),

  // 简历项目推荐：近 7 天，按更新时间日期分组倒序
  listProjects: (days = 7) => apiClient.get<{ groups: ProjectGroup[] }>(`/home/projects?days=${days}`),

  // 最近新增岗位：默认读取 Redis 最近新增列表（最多 10 条）；
  // days/limit 仅在 Redis 未启用或列表为空时用作数据库兜底查询参数
  listNewJobs: (days = 2, limit = 20) =>
    apiClient.get<{ items: NewJobItem[] }>(`/home/new-jobs?days=${days}&limit=${limit}`),

  // ---- AI HOT ----

  // AI HOT 快讯流：window=24h|7d，可按分类/关键词过滤
  listAihotItems: (params?: { window?: string; category?: string; q?: string; limit?: number }) => {
    const search = new URLSearchParams()
    if (params?.window) search.set('window', params.window)
    if (params?.category) search.set('category', params.category)
    if (params?.q) search.set('q', params.q)
    if (params?.limit) search.set('limit', String(params.limit))
    const query = search.toString()
    return apiClient.get<{ items: AihotItem[] }>(`/home/aihot/items${query ? `?${query}` : ''}`)
  },

  // AI HOT 日报（缺省最新），同时返回可切换日期列表
  getAihotDaily: (date?: string) => {
    const query = date ? `?date=${date}` : ''
    return apiClient.get<{ report: AihotDaily | null; dates: string[] }>(`/home/aihot/daily${query}`)
  },

  // AI HOT 热点榜（≤10）
  listAihotHotTopics: () => apiClient.get<{ items: AihotHotTopic[] }>('/home/aihot/hot-topics'),

  // AI HOT 事件详情
  getAihotStory: (publicId: string) =>
    apiClient.get<{ story: AihotStory }>(`/home/aihot/stories/${publicId}`),
}
