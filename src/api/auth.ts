// ============================================================
// 认证 API
// ============================================================

import { apiClient, setTokens, clearTokens, getToken } from './client'
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
    // 登录成功后保存 tokens
    setTokens(result.tokens.accessToken, result.tokens.refreshToken)
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
    clearTokens()
    return apiClient.post<{ loggedOut: boolean }>(
      '/auth/logout',
      { refreshToken, accessToken } as LogoutRequest
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
  return localStorage.getItem('refreshToken')
}

export function isAuthenticated(): boolean {
  return !!getAccessToken()
}
