// ============================================================
// 简历 API
// ============================================================

import { apiClient } from './client'
import type {
  ResumeListResponse,
  ResumeDetail,
  CreateResumeRequest,
  UpdateResumeRequest,
  ResumeUpdateResponse,
} from './types'

export interface ListResumesParams {
  page?: number
  pageSize?: number
  keyword?: string
}

export const resumeApi = {
  list: (params?: ListResumesParams) => {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set('page', String(params.page))
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize))
    if (params?.keyword) searchParams.set('keyword', params.keyword)
    const query = searchParams.toString()
    return apiClient.get<ResumeListResponse>(
      `/resumes${query ? `?${query}` : ''}`
    )
  },

  create: (data: CreateResumeRequest) =>
    apiClient.post<ResumeDetail>('/resumes', data),

  get: (id: string) => apiClient.get<ResumeDetail>(`/resumes/${id}`),

  update: (id: string, data: UpdateResumeRequest) =>
    apiClient.put<ResumeUpdateResponse>(`/resumes/${id}`, data),

  delete: (id: string) =>
    apiClient.delete<{ deleted: boolean }>(`/resumes/${id}`),
}