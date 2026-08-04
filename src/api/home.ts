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

export interface AiNewsItem {
  id: number
  title: string
  url: string
  source: string
  summary: string
  publishedAt: number
}

export interface GithubProjectItem {
  id: number
  fullName: string
  htmlUrl: string
  description: string
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

// 昨日新增岗位
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

export const homeApi = {
  // 首页待办：全部笔试 + 面试时间，按时间升序
  listTodos: () => apiClient.get<{ items: HomeTodoItem[] }>('/home/todos'),

  // AI 新闻速递：days 过滤近 N 天，limit 条，按发布时间倒序
  listNews: (params?: { days?: number; limit?: number }) => {
    const search = new URLSearchParams()
    if (params?.days) search.set('days', String(params.days))
    if (params?.limit) search.set('limit', String(params.limit))
    const query = search.toString()
    return apiClient.get<{ items: AiNewsItem[] }>(`/home/news${query ? `?${query}` : ''}`)
  },

  // GitHub 最新开源项目：近 7 天，按同步日期分组倒序
  listGithubProjects: (days = 7) =>
    apiClient.get<{ groups: GithubGroup[] }>(`/home/github-projects?days=${days}`),

  // AI 日报：近 7 天，按日期倒序
  getDailyReports: (days = 7) => apiClient.get<{ reports: DailyReport[] }>(`/home/daily-report?days=${days}`),

  // 简历项目推荐：近 7 天，按更新时间日期分组倒序
  listProjects: (days = 7) => apiClient.get<{ groups: ProjectGroup[] }>(`/home/projects?days=${days}`),

  // 最近新增岗位（days 天，默认今日+昨日）
  listNewJobs: (days = 2, limit = 20) =>
    apiClient.get<{ items: NewJobItem[] }>(`/home/new-jobs?days=${days}&limit=${limit}`),
}
