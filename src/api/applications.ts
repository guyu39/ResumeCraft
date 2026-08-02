import { apiClient } from './client'
import { authenticatedFetch } from './authenticatedFetch'
import type { JDMatchResponse, JDScoreResponse } from './ai'
import type { Pagination } from './types'

export type JobApplicationStatus =
  | 'pending_adaptation'
  | 'adapted'
  | 'submitted'
  | 'written_test'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'

export interface JobApplicationInterviewBrief {
  round: string
  scheduledAt?: number
  scheduledEnd?: number
  result?: string
}

export interface JobApplicationListItem {
  id: string
  resumeId: string
  resumeTitle?: string
  snapshotVersionId?: string | null
  snapshotLabel?: string
  companyName: string
  department?: string
  targetTitle: string
  source: string
  preferredCity?: string
  applicationUrl?: string
  status: JobApplicationStatus
  matchScore?: number
  jdScore?: number
  checklistDone: number
  checklistTotal: number
  nextAction?: string
  submittedAt?: number
  writtenTestAt?: number
  updatedAt: number
  createdAt: number
  interviews?: JobApplicationInterviewBrief[]
}

export interface JobApplication extends JobApplicationListItem {
  userId: string
  jdText: string
  jdHash: string
  snapshotType?: string
  statusEvents?: JobApplicationStatusEvent[]
  checklistItems?: JobApplicationChecklistItem[]
  aiRuns?: JobApplicationAIRun[]
  interviews?: JobApplicationInterview[]
}

export interface JobApplicationStatusEvent {
  id: string
  applicationId: string
  fromStatus?: JobApplicationStatus
  toStatus: JobApplicationStatus
  note?: string
  createdAt: number
}

export interface JobApplicationChecklistItem {
  id: string
  applicationId: string
  source: string
  sourceSnapshotVersionId?: string
  category: string
  title: string
  detail?: string
  checked: boolean
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface JobApplicationAIRun {
  id: string
  applicationId: string
  resumeId?: string
  sourceSnapshotVersionId?: string
  resultType: string
  summary: Record<string, unknown>
  model?: string
  conversationId?: string
  optimizedSnapshotId?: string
  createdAt: number
}

export interface JobApplicationAttachment {
  id: string
  applicationId: string
  interviewId?: string
  fileName: string
  fileType: string
  fileSize: number
  storageKey: string
  metadata?: Record<string, unknown>
  createdAt: number
}

export interface JobApplicationInterview {
  id: string
  applicationId: string
  round: string
  scheduledAt?: number
  scheduledEnd?: number
  format: string
  interviewer: string
  questions?: string
  notes?: string
  result?: string
  nextAction?: string
  recordingAttachment?: JobApplicationAttachment
  createdAt: number
  updatedAt: number
}

export interface InterviewRecordingResponse {
  attachment?: JobApplicationAttachment
  content?: string
}

export interface ListApplicationsParams {
  page?: number
  pageSize?: number
  keyword?: string
  company?: string
  resumeId?: string
  statuses?: JobApplicationStatus[]
}

export interface JobApplicationListResponse {
  items: JobApplicationListItem[]
  pagination: Pagination
}

export interface CreateApplicationRequest {
  resumeId: string
  snapshotVersionId?: string
  companyName?: string
  department?: string
  targetTitle: string
  jdText: string
  source?: string
  preferredCity?: string
  applicationUrl?: string
  nextAction?: string
  matchResult?: JDMatchResponse
  scoreResult?: JDScoreResponse
}

export interface UpdateApplicationRequest {
  resumeId?: string
  snapshotVersionId?: string
  companyName?: string
  department?: string
  targetTitle?: string
  jdText?: string
  source?: string
  preferredCity?: string
  applicationUrl?: string
  nextAction?: string
  submittedAt?: number
  writtenTestAt?: number
  status?: JobApplicationStatus
}

export type CreateChecklistItemRequest = Pick<
  JobApplicationChecklistItem,
  'source' | 'sourceSnapshotVersionId' | 'category' | 'title' | 'detail' | 'checked' | 'sortOrder'
>

export interface UpdateChecklistItemRequest {
  source?: string
  sourceSnapshotVersionId?: string
  category?: string
  title?: string
  detail?: string
  checked?: boolean
  sortOrder?: number
}

export type CreateInterviewRequest = Omit<JobApplicationInterview, 'id' | 'applicationId' | 'createdAt' | 'updatedAt'>

function buildQuery(params?: ListApplicationsParams): string {
  const search = new URLSearchParams()
  if (params?.page) search.set('page', String(params.page))
  if (params?.pageSize) search.set('pageSize', String(params.pageSize))
  if (params?.keyword) search.set('keyword', params.keyword)
  if (params?.company) search.set('company', params.company)
  if (params?.resumeId) search.set('resumeId', params.resumeId)
  if (params?.statuses?.length) search.set('statuses', params.statuses.join(','))
  const query = search.toString()
  return query ? `?${query}` : ''
}

// 漏斗各阶段计数
export interface FunnelStats {
  submitted: number
  writtenTest: number
  interview: number
  offer: number
  total: number
}

// 单个简历版本的转化数据（A/B 对比）
export interface SnapshotConversion {
  snapshotVersionId?: string | null
  snapshotLabel: string
  resumeId: string
  resumeTitle: string
  submitted: number
  interview: number
  offer: number
  replyRate: number
}

export interface FunnelStatsResponse {
  funnel: FunnelStats
  bySnapshot: SnapshotConversion[]
}

export const applicationsApi = {
  list: (params?: ListApplicationsParams) =>
    apiClient.get<JobApplicationListResponse>(`/applications${buildQuery(params)}`),

  get: (id: string) =>
    apiClient.get<JobApplication>(`/applications/${id}`),

  getStats: () =>
    apiClient.get<FunnelStatsResponse>('/applications/stats'),

  create: (data: CreateApplicationRequest) =>
    apiClient.post<JobApplication>('/applications', data),

  update: (id: string, data: UpdateApplicationRequest) =>
    apiClient.put<JobApplication>(`/applications/${id}`, data),

  delete: (id: string) =>
    apiClient.delete<{ deleted: boolean }>(`/applications/${id}`),

  checkDuplicates: (data: { companyName?: string; targetTitle?: string; jdText?: string }) =>
    apiClient.post<{ items: JobApplicationListItem[] }>('/applications/duplicates', data),

  updateStatus: (id: string, status: JobApplicationStatus, note?: string) =>
    apiClient.put<JobApplicationStatusEvent>(`/applications/${id}/status`, { status, note }),

  createChecklistItem: (id: string, data: CreateChecklistItemRequest) =>
    apiClient.post<JobApplicationChecklistItem>(`/applications/${id}/checklist`, data),

  updateChecklistItem: (id: string, itemId: string, data: UpdateChecklistItemRequest) =>
    apiClient.put<JobApplicationChecklistItem>(`/applications/${id}/checklist/${itemId}`, data),

  deleteChecklistItem: (id: string, itemId: string) =>
    apiClient.delete<{ deleted: boolean }>(`/applications/${id}/checklist/${itemId}`),

  regenerateChecklist: (id: string) =>
    apiClient.post<{ items: JobApplicationChecklistItem[] }>(`/applications/${id}/checklist/regenerate`),

  createInterview: (id: string, data: CreateInterviewRequest) =>
    apiClient.post<JobApplicationInterview>(`/applications/${id}/interviews`, data),

  updateInterview: (id: string, interviewId: string, data: CreateInterviewRequest) =>
    apiClient.put<JobApplicationInterview>(`/applications/${id}/interviews/${interviewId}`, data),

  deleteInterview: (id: string, interviewId: string) =>
    apiClient.delete<{ deleted: boolean }>(`/applications/${id}/interviews/${interviewId}`),

  uploadInterviewRecording: async (id: string, interviewId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await authenticatedFetch(`/api/applications/${id}/interviews/${interviewId}/recording`, {
      method: 'POST',
      body: formData,
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error(json?.message || '上传面试录音失败')
    }
    return json.data as { attachment: JobApplicationAttachment }
  },

  getInterviewRecording: async (id: string, interviewId: string) => {
    const res = await authenticatedFetch(`/api/applications/${id}/interviews/${interviewId}/recording`)
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error(json?.message || '获取面试录音失败')
    }
    return json.data as InterviewRecordingResponse
  },

  exportExcel: async (params?: ListApplicationsParams) => {
    const res = await authenticatedFetch(`/api/applications/export${buildQuery(params)}`)
    if (!res.ok) {
      throw new Error('导出失败')
    }
    return res.blob()
  },
}
