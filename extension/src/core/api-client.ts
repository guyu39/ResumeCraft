import { storage } from './storage'

interface ApiResponse<T = unknown> {
  data: T
  message?: string
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const base = await storage.getApiBase()
  const token = await storage.getJwt()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${base}${path}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new ApiError(response.status, body.message ?? `HTTP ${response.status}`)
  }

  const json: ApiResponse<T> = await response.json()
  return json.data
}

export interface ResumeListItem {
  id: string
  title: string
  updatedAt: string
}

export interface Module {
  type: string
  data: Record<string, unknown>
  title?: string
  id?: string
}

export interface ResumeDetail {
  id: string
  title: string
  modules: Module[]
  latestSnapshotId?: string
  template: string
  themeColor: string
}

export interface SnapshotListItem {
  id: string
  snapshotType: string
  label: string
  createdAt: string
}

export interface SnapshotDetail {
  id: string
  contentSnapshot: Module[]
  label: string
  snapshotType: string
}

export const apiClient = {
  getMe: () => request<{ id: string; email: string }>('/api/auth/me'),

  listResumes: () => request<ResumeListItem[]>('/api/resumes'),

  getResume: (id: string) => request<ResumeDetail>(`/api/resumes/${id}`),

  listSnapshots: (resumeId: string) =>
    request<SnapshotListItem[]>(`/api/resumes/${resumeId}/snapshots?limit=50&includeAuto=true`),

  getSnapshotDetail: (resumeId: string, snapshotId: string) =>
    request<SnapshotDetail>(`/api/resumes/${resumeId}/snapshots/${snapshotId}`),

  login: (email: string, password: string) =>
    request<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
}
