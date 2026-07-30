// ============================================================
// 认证 API
// ============================================================

import { apiClient, setTokens, getToken } from './client'
import { getRefreshToken as readRefreshToken } from './authSession'
import type {
  LoginRequest,
  RegisterRequest,
  RefreshRequest,
  LogoutRequest,
  SendCodeRequest,
  ChangePasswordRequest,
  AuthPayload,
  AuthUser,
} from './types'

export const authApi = {
  sendCode: (email: string, purpose: 'register' | 'login' | 'change_password') =>
    apiClient.post<{ sent: boolean }>('/auth/send-code', { email, purpose } as SendCodeRequest, { auth: false }),

  register: async (data: RegisterRequest) => {
    const result = await apiClient.post<AuthPayload>('/auth/register', data, { auth: false })
    setTokens(result.tokens.accessToken, result.tokens.refreshToken)
    return result
  },

  login: async (data: LoginRequest) => {
    const result = await apiClient.post<AuthPayload>('/auth/login', data, {
      auth: false,
    })
    // 单设备登录：requiresKickConfirm=true 时后端未签发 token，不能 setTokens；
    // 由前端二次确认后用 confirmLogin 换取真正的 token。
    if (!result.requiresKickConfirm && result.tokens) {
      setTokens(result.tokens.accessToken, result.tokens.refreshToken)
    }
    return result
  },

  // 单设备登录两阶段流程第二步：用户确认后用 ticket 完成登录，此时才签发 token 并踢旧设备
  confirmLogin: async (ticket: string) => {
    const result = await apiClient.post<AuthPayload>(
      '/auth/login/confirm',
      { ticket },
      { auth: false }
    )
    if (result.tokens) {
      setTokens(result.tokens.accessToken, result.tokens.refreshToken)
    }
    return result
  },

  refresh: async (refreshToken: string) => {
    const result = await apiClient.post<AuthPayload>(
      '/auth/refresh',
      { refreshToken } as RefreshRequest,
      { auth: false }
    )
    // 刷新成功后更新 tokens
    setTokens(result.tokens.accessToken, result.tokens.refreshToken)
    return result
  },

  logout: async (refreshToken: string) => {
    const accessToken = getToken()
    return apiClient.post<{ loggedOut: boolean }>(
      '/auth/logout',
      { refreshToken, accessToken } as LogoutRequest,
      { auth: false },
    )
  },

  me: () => apiClient.get<AuthUser>('/auth/me'),

  changePassword: (data: ChangePasswordRequest) =>
    apiClient.post<{ changed: boolean }>('/auth/change-password', data),
}

// Token 管理
export function getAccessToken(): string | null {
  return localStorage.getItem('accessToken')
}

export function getRefreshToken(): string | null {
  return readRefreshToken()
}

export function isAuthenticated(): boolean {
  return !!(getAccessToken() || getRefreshToken())
}
