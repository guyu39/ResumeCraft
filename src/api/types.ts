// ============================================================
// API 类型定义 - 与后端接口契约对齐
// ============================================================

// 统一响应结构
export interface ApiResponse<T = unknown> {
  code: string
  message: string
  requestId: string
  data?: T
}

// 认证相关
export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  password: string
  displayName?: string
}

export interface RefreshRequest {
  refreshToken: string
}

export interface LogoutRequest {
  refreshToken: string
}

export interface AuthUser {
  id: string
  email: string
  displayName: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface AuthPayload {
  user: AuthUser
  tokens: AuthTokens
}

// 简历相关
export interface ResumeListItem {
  id: string
  title: string
  template: string
  updatedAt: number // 时间戳
  createdAt: number // 时间戳
}

export interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface ResumeListResponse {
  items: ResumeListItem[]
  pagination: Pagination
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

export interface ResumeDetail {
  id: string
  title: string
  locale: string
  template: string
  themeColor: string
  styleSettings: ResumeStyleSettings
  modules: unknown[]
  latestVersionId: string
  updatedAt: number
  createdAt: number
}

export interface CreateResumeRequest {
  title: string
  locale?: string
  template?: string
  themeColor?: string
  styleSettings?: ResumeStyleSettings
  modules?: unknown[]
}

export interface UpdateResumeRequest {
  title?: string
  themeColor?: string
  styleSettings?: ResumeStyleSettings
  modules?: unknown[]
  clientUpdatedAt?: number
}

export interface ResumeUpdateResponse {
  id: string
  updatedAt: number
  latestVersionId: string
}

// 版本相关
export interface VersionItem {
  id: string
  versionNo: number
  createdAt: number // 时间戳
  operator: string
}

export interface VersionListResponse {
  items: VersionItem[]
  pagination: Pagination
}

export interface RestoreVersionRequest {
  reason?: string
}

// 导出相关
export type ExportStatus = 'QUEUED' | 'PROCESSING' | 'SUCCESS' | 'FAILED'

export interface CreateExportRequest {
  versionId: string
  format: 'pdf'
  paper: 'A4' | 'Letter'
  orientation: 'portrait' | 'landscape'
}

export interface ExportTask {
  taskId: string
  status: ExportStatus
  progress?: number
  errorCode?: string
  errorMessage?: string
  fileId?: string
  downloadUrl?: string
  expiresAt?: number
  createdAt: number
  finishedAt?: number
}