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