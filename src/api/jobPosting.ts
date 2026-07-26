// ============================================================
// 招聘数据聚合 API（/jobs 页面）
// ============================================================

import { apiClient } from './client'
import type { Pagination } from './types'

export interface JobPosting {
  id: string
  source: string
  sourceId?: string
  companyName: string
  industry?: string
  industryCategory?: string // 归一化行业大类（配色/筛选用）
  recruitmentType?: string
  recruitmentCategory?: string // 归一化招聘类型大类（配色/筛选用）
  openDate?: string // ISO 日期字符串
  location?: string
  positions?: string
  applicationUrl?: string
  referralCode?: string
  notes?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  scrapedAt: string
}

export interface JobFilters {
  industries: string[]
  types: string[]
}

export interface SyncResult {
  total: number
  inserted: number
  updated: number
  deactivated: number
  errors: number
  source?: string
  startedAt: string
  finishedAt: string
  durationMs: number
}

export interface JobListParams {
  industry?: string
  type?: string
  keyword?: string
  page?: number
  pageSize?: number
}

export interface JobPostingListResponse {
  items: JobPosting[]
  pagination: Pagination
}

export const jobPostingApi = {
  getJobPostings: (params: JobListParams = {}) =>
    apiClient.get<JobPostingListResponse>(`/job-postings?${buildQuery(params)}`),
  getJobFilters: () => apiClient.get<JobFilters>('/job-postings/filters'),
  syncJobPostings: () => apiClient.post<SyncResult>('/job-postings/sync', {}, { auth: true }),
}

function buildQuery(params: JobListParams): string {
  const qs = new URLSearchParams()
  if (params.industry) qs.set('industry', params.industry)
  if (params.type) qs.set('type', params.type)
  if (params.keyword) qs.set('keyword', params.keyword)
  if (params.page) qs.set('page', String(params.page))
  if (params.pageSize) qs.set('pageSize', String(params.pageSize))
  return qs.toString()
}
