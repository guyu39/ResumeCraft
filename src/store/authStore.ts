// ============================================================
// 认证状态管理 - Zustand
// ============================================================

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi, getAccessToken, isAuthenticated, ApiError } from '@/api'

interface AuthUser {
  id: string
  email: string
  displayName: string
  avatarUrl?: string
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

interface AuthActions {
  loginWithPassword: (email: string, password: string) => Promise<void>
  loginWithCode: (email: string, code: string) => Promise<void>
  register: (email: string, password: string, code: string, displayName?: string) => Promise<void>
  sendCode: (email: string, purpose: 'register' | 'login') => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: !!getAccessToken(),
      isLoading: false,
      error: null,

      loginWithPassword: async (email: string, password: string) => {
        set({ isLoading: true, error: null })
        try {
          const result = await authApi.login({ email, password, loginType: 'password' })
          set({ user: result.user, isAuthenticated: true, isLoading: false })
        } catch (err) {
          const message = err instanceof ApiError ? err.message : '登录失败'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      loginWithCode: async (email: string, code: string) => {
        set({ isLoading: true, error: null })
        try {
          const result = await authApi.login({ email, code, loginType: 'code' })
          set({ user: result.user, isAuthenticated: true, isLoading: false })
        } catch (err) {
          const message = err instanceof ApiError ? err.message : '登录失败'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      register: async (email: string, password: string, code: string, displayName?: string) => {
        set({ isLoading: true, error: null })
        try {
          const result = await authApi.register({ email, password, code, displayName })
          // 注册接口已返回 token 并自动登录
          set({ user: result.user, isAuthenticated: true, isLoading: false })
        } catch (err) {
          const message = err instanceof ApiError ? err.message : '注册失败'
          set({ error: message, isLoading: false })
          throw err
        }
      },

      sendCode: async (email: string, purpose: 'register' | 'login') => {
        set({ error: null })
        try {
          await authApi.sendCode(email, purpose)
        } catch (err) {
          const message = err instanceof ApiError ? err.message : '验证码发送失败'
          set({ error: message })
          throw err
        }
      },

      logout: async () => {
        const refreshToken = localStorage.getItem('refreshToken')
        if (refreshToken) {
          try {
            await authApi.logout(refreshToken)
          } catch {
            // 忽略登出 API 错误
          }
        }
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        set({ user: null, isAuthenticated: false })
      },

      checkAuth: async () => {
        if (!isAuthenticated()) {
          set({ isAuthenticated: false, user: null })
          return
        }
        set({ isLoading: true })
        try {
          const user = await authApi.me()
          set({ user, isAuthenticated: true, isLoading: false })
        } catch {
          localStorage.removeItem('accessToken')
          localStorage.removeItem('refreshToken')
          set({ user: null, isAuthenticated: false, isLoading: false })
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'resumecraft_auth',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)