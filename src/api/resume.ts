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

export interface AdminCommentItem {
  id: string
  shareToken: string
  visitorId: string
  authorName: string
  content: string
  moduleId: string
  moduleTitle: string
  itemIndex: number
  itemLabel: string
  createdAt: number
}

export interface ModuleCommentSummary {
  moduleId: string
  moduleTitle: string
  commentCount: number
  visitorCount: number
}

export interface AdminCommentsResponse {
  items: AdminCommentItem[]
  summary: {
    totalComments: number
    totalVisitors: number
    moduleBreakdown: ModuleCommentSummary[]
  }
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

  // ---------- 版本快照 ----------

  getSnapshots: (
    id: string,
    params?: { limit?: number; includeAuto?: boolean }
  ) => {
    const searchParams = new URLSearchParams()
    if (params?.limit) searchParams.set('limit', String(params.limit))
    if (params?.includeAuto !== undefined)
      searchParams.set('includeAuto', String(params.includeAuto))
    const query = searchParams.toString()
    return apiClient.get<
      { items: SnapshotListItem[]; total: number; hasMore: boolean }
    >(`/resumes/${id}/snapshots${query ? `?${query}` : ''}`)
  },

  createSnapshot: (resumeId: string, label: string) =>
    apiClient.post<SnapshotDetail>(`/resumes/${resumeId}/snapshots`, { label }),

  updateSnapshotLabel: (resumeId: string, snapshotId: string, label: string) =>
    apiClient.put<{ updated: boolean }>(
      `/resumes/${resumeId}/snapshots/${snapshotId}`,
      { label }
    ),

  deleteSnapshot: (resumeId: string, snapshotId: string) =>
    apiClient.delete<{ deleted: boolean }>(
      `/resumes/${resumeId}/snapshots/${snapshotId}`
    ),

  getSnapshotDetail: (resumeId: string, snapshotId: string) =>
    apiClient.get<{ snapshot: SnapshotDetail; content: unknown }>(
      `/resumes/${resumeId}/snapshots/${snapshotId}`
    ),

  restoreFromSnapshot: (resumeId: string, snapshotId: string) =>
    apiClient.post<ResumeUpdateResponse>(
      `/resumes/${resumeId}/snapshots/${snapshotId}/restore`
    ),

  diffSnapshots: (resumeId: string, aId: string, bId: string, currentModules?: unknown[], comparisonModules?: unknown[]) =>
    apiClient.post<DiffResult>(`/resumes/${resumeId}/snapshots/diff`, {
      snapshotAId: aId,
      snapshotBId: bId,
      currentModules: currentModules || undefined,
      comparisonModules: comparisonModules || undefined,
    }),

  // 评论管理（管理员视图）
  getComments: (resumeId: string) =>
    apiClient.get<AdminCommentsResponse>(`/resumes/${resumeId}/comments`, { auth: true }),
}

// ---------- 快照相关类型 ----------

export type SnapshotType = 'auto' | 'manual' | 'default'

export interface SnapshotListItem {
  id: string
  versionNo: number
  snapshotType: SnapshotType
  label?: string
  createdAt: number
  isCurrent: boolean
}

export interface SnapshotDetail {
  id: string
  resumeId: string
  versionNo: number
  snapshotType: SnapshotType
  label?: string
  createdAt: number
  isCurrent: boolean
}

export interface DiffResult {
  snapshotA: { id: string; versionNo: number; label?: string; createdAt: number }
  snapshotB: { id: string; versionNo: number; label?: string; createdAt: number }
  diffs: FieldDiff[]
  stats: DiffStats
}

export interface FieldDiff {
  moduleType: string
  moduleInstanceId: string
  field: string
  before: string
  after: string
}

export interface DiffStats {
  modulesAdded: number
  modulesRemoved: number
  modulesModified: number
  fieldsChanged: number
}

// ============ 分享链接 ============

export interface ShareLink {
  id: string
  resumeId: string
  token: string
  createdBy: string
  expiresAt?: number
  viewCount: number
  isActive: boolean
  createdAt: number
  shareUrl?: string
}

export interface ShareComment {
  id: string
  shareId: string
  authorName: string
  content: string
  moduleId: string
  itemIndex: number
  createdAt: number
}

export interface ShareResumeView {
  title: string
  locale: string
  themeColor: string
  modules: unknown[]
  shareInfo: ShareLink
  comments: ShareComment[]
}

export interface AIAnalysisResponse {
  summary: string
  strengths: string[]
  weaknesses: string[]
  suggestions: string[]
}

export const shareApi = {
  create: (resumeId: string, expiresIn?: number) =>
    apiClient.post<ShareLink>(`/resumes/${resumeId}/share`, { resumeId, expiresIn: expiresIn ?? 0 }, { auth: true }),

  list: (resumeId: string) =>
    apiClient.get<{ items: ShareLink[] }>(`/resumes/${resumeId}/shares`, { auth: true }),

  deactivate: (resumeId: string, shareId: string) =>
    apiClient.delete<{ deactivated: boolean }>(`/resumes/${resumeId}/shares/${shareId}`, { auth: true }),

  view: (token: string) =>
    apiClient.get<ShareResumeView>(`/share/${token}`),

  addComment: (token: string, content: string, authorName?: string, moduleId?: string, itemIndex?: number, visitorId?: string) =>
    apiClient.post<ShareComment>(`/share/${token}/comments`, { content, authorName: authorName || '', moduleId: moduleId || '', itemIndex: itemIndex ?? 0, visitorId: visitorId || '' }),

  listComments: (token: string, visitorId?: string) =>
    apiClient.get<{ items: ShareComment[] }>(`/share/${token}/comments${visitorId ? `?visitorId=${encodeURIComponent(visitorId)}` : ''}`),

  analyze: (token: string) =>
    apiClient.post<AIAnalysisResponse>(`/share/${token}/analyze`),

  generateRequirementDoc: (token: string) =>
    apiClient.post<{ document: string }>(`/share/${token}/requirement-doc`),

  downloadPDF: async (token: string, html: string, filename: string) => {
    const res = await fetch(`/api/share/${token}/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, filename }),
    })
    if (!res.ok) throw new Error('PDF download failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  },
}