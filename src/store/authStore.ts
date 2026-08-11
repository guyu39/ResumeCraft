// ============================================================
// 认证状态管理 - Zustand
// ============================================================

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi, getAccessToken, isAuthenticated, ApiError } from '@/api'
import { isTerminalAuthError, terminateSession } from '@/api/authSession'
import type { AuthPayload } from '@/api/types'

interface AuthUser {
  id: string
  email: string
  displayName: string
  avatarUrl?: string
}

// 单设备登录两阶段流程：登录检测到他设备后暂存的确认态。
// ticket 由后端在 Login 时签发（此时未踢任何设备），用户确认后用 ticket 换取真正 token、
// 此时后端才踢旧设备。returnUrl 用于确认后回到原页面。
interface KickConfirmState {
  ticket: string
  returnUrl: string
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  // 单设备登录：检测到他设备后，暂存 ticket 供全局 KickConfirmModal 二次确认。
  // 非 null 期间保持登录页（不进入应用），确认/退出后清理。
  kickConfirm: KickConfirmState | null
}

interface AuthActions {
  loginWithPassword: (email: string, password: string) => Promise<AuthPayload>
  loginWithCode: (email: string, code: string) => Promise<AuthPayload>
  register: (email: string, password: string, code: string, displayName?: string) => Promise<void>
  sendCode: (email: string, purpose: 'register' | 'login') => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  clearError: () => void
  showKickConfirm: (ticket: string, returnUrl: string) => void
  clearKickConfirm: () => void
  // 用 ticket 完成登录（此时后端踢旧设备）；成功返回 returnUrl 供调用方跳转
  confirmKickLogin: () => Promise<string>
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: !!getAccessToken(),
      isLoading: false,
      error: null,
      kickConfirm: null,

      loginWithPassword: async (email: string, password: string) => {
        set({ isLoading: true, error: null })
        try {
          const result = await authApi.login({ email, password, loginType: 'password' })
          // requiresKickConfirm=true 时后端未签发 token、未踢旧设备；isAuthenticated 保持 false，
          // 由 LoginPage 调 showKickConfirm 暂存 ticket，KickConfirmModal 确认后才进入应用
          set({ user: result.user, isAuthenticated: !result.requiresKickConfirm, isLoading: false })
          return result
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
          set({ user: result.user, isAuthenticated: !result.requiresKickConfirm, isLoading: false })
          return result
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
        // 走 terminateSession 以便通过 BroadcastChannel 即时通知其他标签页；
        // reason=logout 本身不触发跳转，跳转仍由调用方决定。
        terminateSession('logout', { redirect: false })
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
        } catch (error) {
          if (isTerminalAuthError(error)) {
            set({ user: null, isAuthenticated: false, isLoading: false })
            return
          }
          console.warn('[auth] 认证检查暂时失败，保留当前登录态:', error)
          set({ isLoading: false })
        }
      },

      clearError: () => set({ error: null }),

      showKickConfirm: (ticket: string, returnUrl: string) =>
        set({ kickConfirm: { ticket, returnUrl } }),
      clearKickConfirm: () => set({ kickConfirm: null }),

      confirmKickLogin: async (): Promise<string> => {
        const pending = useAuthStore.getState().kickConfirm
        if (!pending) throw new Error('无确认凭证')
        const returnUrl = pending.returnUrl
        try {
          // 用 ticket 完成登录：后端此时签发 token 并踢掉他设备（顶号副作用发生在此）
          const result = await authApi.confirmLogin(pending.ticket)
          set({ user: result.user, isAuthenticated: true, kickConfirm: null })
          return returnUrl
        } catch (err) {
          // ticket 过期/无效：清理确认态，回到登录页让用户重新登录
          set({ kickConfirm: null })
          throw err
        }
      },
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
