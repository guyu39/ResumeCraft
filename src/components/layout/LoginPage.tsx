// ============================================================
// 登录 / 注册页面
// 注册：姓名(选填) + 邮箱 + 密码 + 确认密码 + 邮箱验证码
// 登录：密码登录 / 验证码登录 双 Tab
// UI 统一：字段级内联校验（就近红字）+ 操作结果用 Toast 弹窗
// ============================================================

import React, { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { LogIn, UserPlus } from 'lucide-react'
import ToastContainer, { toast } from '@/components/common/Toast'
import { ApiError } from '@/api'

type Mode = 'login' | 'register'
type LoginTab = 'password' | 'code'

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

const LoginPage: React.FC = () => {
  const { loginWithPassword, loginWithCode, register, sendCode, isLoading, clearError } = useAuthStore()
  const [mode, setMode] = useState<Mode>('login')
  const [loginTab, setLoginTab] = useState<LoginTab>('password')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [displayName, setDisplayName] = useState('')

  // 字段级校验提示 + 已交互标记（失焦/提交后才显示，避免一进来就飘红）
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const [countdown, setCountdown] = useState(0)
  const [sending, setSending] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => { if (timerRef.current) window.clearInterval(timerRef.current) }
  }, [])

  const startCountdown = () => {
    setCountdown(60)
    timerRef.current = window.setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { if (timerRef.current) window.clearInterval(timerRef.current); return 0 }
        return c - 1
      })
    }, 1000)
  }

  const needCode = mode === 'register' || loginTab === 'code'
  const needPassword = mode === 'register' || loginTab === 'password'
  const codePurpose: 'register' | 'login' = mode === 'register' ? 'register' : 'login'

  // ---------- 字段级校验：返回错误文案，无错误返回 '' ----------
  const emailError = email && !isValidEmail(email) ? '请输入有效的邮箱地址' : ''
  const passwordError = needPassword && password && password.length < 8 ? '密码至少 8 个字符' : ''
  const confirmError = mode === 'register' && confirmPassword && confirmPassword !== password ? '两次输入的密码不一致' : ''
  const codeError = needCode && code && code.length !== 6 ? '验证码为 6 位数字' : ''

  const markTouched = (field: string) => setTouched((t) => ({ ...t, [field]: true }))

  const handleSendCode = async () => {
    clearError()
    if (!isValidEmail(email)) {
      markTouched('email')
      toast('请先输入有效的邮箱地址')
      return
    }
    setSending(true)
    try {
      await sendCode(email, codePurpose)
      startCountdown()
      toast('验证码已发送，请查收邮件', 'success')
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '验证码发送失败')
    } finally {
      setSending(false)
    }
  }

  // 整表校验：返回首个错误（用于提交前拦截 + toast）
  const validateForm = (): string => {
    if (!isValidEmail(email)) return '请输入有效的邮箱地址'
    if (needPassword && password.length < 8) return '密码至少 8 个字符'
    if (mode === 'register' && password !== confirmPassword) return '两次输入的密码不一致'
    if (needCode && code.length !== 6) return '请输入 6 位验证码'
    return ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    setTouched({ email: true, password: true, confirmPassword: true, code: true })
    const formErr = validateForm()
    if (formErr) { toast(formErr); return }

    try {
      if (mode === 'register') {
        await register(email, password, code, displayName || undefined)
        toast('注册成功', 'success')
      } else if (loginTab === 'password') {
        await loginWithPassword(email, password)
        toast('登录成功', 'success')
      } else {
        await loginWithCode(email, code)
        toast('登录成功', 'success')
      }
      const params = new URLSearchParams(window.location.search)
      const returnUrl = params.get('return') || '/'
      // 稍延迟让 toast 可见
      setTimeout(() => { window.location.href = returnUrl }, 400)
    } catch (err) {
      toast(err instanceof ApiError ? err.message : (mode === 'register' ? '注册失败' : '登录失败'))
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setCode('')
    setConfirmPassword('')
    setTouched({})
    clearError()
  }

  const switchLoginTab = (tab: LoginTab) => {
    setLoginTab(tab)
    setCode('')
    setTouched({})
    clearError()
  }

  // 输入框统一样式：err 为字段错误文案
  const inputClass = (err: string) =>
    `mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
      err ? 'border-red-300 focus:border-red-500 focus:ring-red-100' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100'
    }`

  const fieldError = (field: string, err: string) =>
    touched[field] && err ? <p className="mt-1 text-xs text-red-500">{err}</p> : null

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <ToastContainer />
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-900">
              {mode === 'register' ? '注册账号' : '登录账号'}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {mode === 'register' ? '创建新账号，开始云端管理简历' : '登录以同步您的简历数据'}
            </p>
          </div>

          {/* 登录方式 Tab（仅登录态显示） */}
          {mode === 'login' && (
            <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm">
              <button
                type="button"
                onClick={() => switchLoginTab('password')}
                className={`rounded-lg py-2 transition-colors ${loginTab === 'password' ? 'bg-white font-medium text-blue-600 shadow-sm' : 'text-slate-500'}`}
              >
                密码登录
              </button>
              <button
                type="button"
                onClick={() => switchLoginTab('code')}
                className={`rounded-lg py-2 transition-colors ${loginTab === 'code' ? 'bg-white font-medium text-blue-600 shadow-sm' : 'text-slate-500'}`}
              >
                验证码登录
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-slate-700">姓名</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={inputClass('')}
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
                onBlur={() => markTouched('email')}
                className={inputClass(touched.email ? emailError : '')}
                placeholder="your@email.com"
              />
              {fieldError('email', emailError)}
            </div>

            {needPassword && (
              <div>
                <label className="block text-sm font-medium text-slate-700">密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => markTouched('password')}
                  className={inputClass(touched.password ? passwordError : '')}
                  placeholder="至少 8 个字符"
                />
                {fieldError('password', passwordError)}
              </div>
            )}

            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-slate-700">确认密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={() => markTouched('confirmPassword')}
                  className={inputClass(touched.confirmPassword ? confirmError : '')}
                  placeholder="再次输入密码"
                />
                {fieldError('confirmPassword', confirmError)}
              </div>
            )}

            {needCode && (
              <div>
                <label className="block text-sm font-medium text-slate-700">邮箱验证码</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onBlur={() => markTouched('code')}
                    inputMode="numeric"
                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
                      touched.code && codeError ? 'border-red-300 focus:border-red-500 focus:ring-red-100' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100'
                    }`}
                    placeholder="6 位数字验证码"
                  />
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={countdown > 0 || sending || !isValidEmail(email)}
                    className="shrink-0 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-sm text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
                  >
                    {sending ? '发送中' : countdown > 0 ? `${countdown}s` : '获取验证码'}
                  </button>
                </div>
                {fieldError('code', codeError)}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? '处理中...' : mode === 'register' ? '注册' : '登录'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => switchMode(mode === 'register' ? 'login' : 'register')}
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
            >
              {mode === 'register' ? (
                <><LogIn className="h-4 w-4" />已有账号？登录</>
              ) : (
                <><UserPlus className="h-4 w-4" />没有账号？注册</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
