// ============================================================
// 登录页面
// ============================================================

import React, { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { LogIn, UserPlus, AlertCircle } from 'lucide-react'

const LoginPage: React.FC = () => {
  const { login, register, isLoading, error, clearError } = useAuthStore()
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    try {
      if (isRegister) {
        await register(email, password, displayName || undefined)
      } else {
        await login(email, password)
      }
      // 登录成功后跳转回原页面或简历列表
      const params = new URLSearchParams(window.location.search)
      const returnUrl = params.get('return') || '/'
      window.location.href = returnUrl
    } catch {
      // 错误已由 store 处理
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-900">
              {isRegister ? '注册账号' : '登录账号'}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {isRegister ? '创建新账号，开始云端管理简历' : '登录以同步您的简历数据'}
            </p>
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {isRegister && (
              <div>
                <label className="block text-sm font-medium text-slate-700">姓名</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="显示名称（选填）"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="至少 8 个字符"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? '处理中...' : isRegister ? '注册' : '登录'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister)
                clearError()
              }}
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
            >
              {isRegister ? (
                <>
                  <LogIn className="h-4 w-4" />
                  已有账号？登录
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  没有账号？注册
                </>
              )}
            </button>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-4 text-center">
            <button
              type="button"
              onClick={() => (window.location.href = '/editor')}
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              暂不登录，继续使用本地模式
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginPage