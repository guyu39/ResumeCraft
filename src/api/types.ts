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
  loginType?: 'password' | 'code'
  password?: string
  code?: string
}

export interface RegisterRequest {
  email: string
  password: string
  code: string
  displayName?: string
}

export interface SendCodeRequest {
  email: string
  purpose: 'register' | 'login' | 'change_password'
}

export interface ChangePasswordRequest {
  newPassword: string
  code: string
}

export interface RefreshRequest {
  refreshToken: string
}

export interface LogoutRequest {
  refreshToken: string
  accessToken?: string
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
  /**
   * 单设备登录两阶段流程：检测到他设备在线会话。
   * 为 true 时不签发 token、不踢旧设备，仅返回 loginTicket；
   * 前端弹二次确认，用户点「是我，继续」后用 loginTicket 调 confirmLogin 完成登录（此时才踢旧设备）。
   */
  requiresKickConfirm?: boolean
  loginTicket?: string
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
  moduleTitleFontFamily: string
  moduleTitleFontSize: number
  textColor: string
  lineHeight: number
  pagePaddingHorizontal: number
  pagePaddingVertical: number
  moduleSpacing: number
  paragraphSpacing: number
  moduleTitleLinePosition: 'left' | 'bottom' | 'none'
  moduleTitleMarkerStyle: 'bar' | 'pill' | 'dot' | 'square' | 'none'
  moduleTitleMarkerVisible: boolean
  avatarPosition?: 'center' | 'right' | 'left'
}

export interface ResumeDetail {
  id: string
  title: string
  locale: string
  template: string
  themeColor: string
  styleSettings: ResumeStyleSettings
  modules: unknown[]
  personalData?: Record<string, unknown>
  currentVersionId?: string
  latestVersionId?: string
  latestSnapshotId?: string
  basedOnSnapshotId?: string
  snapshotDrafts?: Record<string, unknown>
  version: number
  snapshotDraftsVersion: number
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
  locale?: string
  template?: string
  themeColor?: string
  styleSettings?: ResumeStyleSettings
  modules?: unknown[]
  personalData?: Record<string, unknown>
  clientUpdatedAt?: number
  basedOnSnapshotId?: string
  snapshotDrafts?: Record<string, unknown>
  version?: number
  snapshotDraftsVersion?: number
}

export interface ResumeUpdateResponse {
  id: string
  updatedAt: number
  currentVersionId?: string
  latestVersionId?: string
  latestSnapshotId?: string
  version: number
  snapshotDraftsVersion: number
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
export type ExportFormat = 'pdf' | 'markdown' | 'json' | 'resume'

export type ExportStatus = 'QUEUED' | 'PROCESSING' | 'SUCCESS' | 'FAILED'

export interface CreateExportRequest {
  versionId: string
  format: ExportFormat
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
