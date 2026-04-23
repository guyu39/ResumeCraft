// ============================================================
// 认证 API
// ============================================================

import { apiClient, setTokens, clearTokens } from './client'
import type {
  LoginRequest,
  RegisterRequest,
  RefreshRequest,
  LogoutRequest,
  AuthPayload,
  AuthUser,
} from './types'

export const authApi = {
  register: (data: RegisterRequest) =>
    apiClient.post<AuthPayload>('/auth/register', data, { auth: false }),

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
    clearTokens()
    return apiClient.post<{ loggedOut: boolean }>(
      '/auth/logout',
      { refreshToken } as LogoutRequest
    )
  },

  me: () => apiClient.get<AuthUser>('/auth/me'),
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