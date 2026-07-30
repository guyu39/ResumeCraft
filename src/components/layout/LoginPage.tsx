// ============================================================
// 登录 / 注册页面
// 注册：姓名(选填) + 邮箱 + 密码 + 确认密码 + 邮箱验证码
// 登录：密码登录 / 验证码登录 双 Tab
// UI 统一：字段级内联校验（就近红字）+ 操作结果用 Toast 弹窗
// ============================================================

import React, { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import {
  AlertTriangle,
  BriefcaseBusiness,
  Eye,
  EyeOff,
  FileText,
  LogIn,
  Sparkles,
  type LucideIcon,
  UserPlus,
} from 'lucide-react'
import ToastContainer, { toast } from '@/components/common/Toast'
import { ApiError } from '@/api'
import { getSafeReturnUrl } from '@/api/authSession'

type Mode = 'login' | 'register'
type LoginTab = 'password' | 'code'
type ValidatedField = 'email' | 'password' | 'confirmPassword' | 'code'

const FIELD_IDS = {
  displayName: 'auth-name',
  email: 'auth-email',
  password: 'auth-password',
  confirmPassword: 'auth-confirm-password',
  code: 'auth-code',
} as const

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

type Feature = {
  icon: LucideIcon
  title: string
  desc: string
}

const FEATURES: Feature[] = [
  {
    icon: FileText,
    title: '简历制作与导出',
    desc: '简历导入、模块化编辑、版本快照与 PDF 导出。',
  },
  {
    icon: Sparkles,
    title: 'AI 定向适配',
    desc: 'AI 体检、评分与 JD 定向适配，让修改目标更明确。',
  },
  {
    icon: BriefcaseBusiness,
    title: '投递管理与复盘',
    desc: '职位库、投递管道、面试记录与转化分析集中管理。',
  },
]

const LoginPage: React.FC = () => {
  const { loginWithPassword, loginWithCode, register, sendCode, showKickConfirm, isLoading, clearError } = useAuthStore()
  const [mode, setMode] = useState<Mode>('login')
  const [loginTab, setLoginTab] = useState<LoginTab>('password')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // 失焦或提交后再展示错误，避免用户尚未操作时整页飘红。
  const [touched, setTouched] = useState<Partial<Record<ValidatedField, boolean>>>({})

  const [countdown, setCountdown] = useState(0)
  const [sending, setSending] = useState(false)
  const timerRef = useRef<number | null>(null)
  const [sessionNotice, setSessionNotice] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const reason = params.get('reason')
    if (reason === 'kicked' || reason === 'expired') {
      setSessionNotice(
        reason === 'kicked'
          ? '您的账号已在其他设备登录，当前会话已失效，请重新登录。'
          : '登录状态已失效，请重新登录。登录后将返回之前的页面。',
      )
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.delete('reason')
      window.history.replaceState({}, '', newUrl.pathname + newUrl.search)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
  }, [])

  const startCountdown = () => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    setCountdown(60)
    timerRef.current = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          if (timerRef.current) window.clearInterval(timerRef.current)
          timerRef.current = null
          return 0
        }
        return current - 1
      })
    }, 1000)
  }

  const needCode = mode === 'register' || loginTab === 'code'
  const needPassword = mode === 'register' || loginTab === 'password'
  const codePurpose: 'register' | 'login' = mode === 'register' ? 'register' : 'login'

  const emailError = !email
    ? '请输入邮箱'
    : !isValidEmail(email)
      ? '请输入有效的邮箱地址'
      : ''
  const passwordError = needPassword
    ? !password
      ? '请输入密码'
      : password.length < 8
        ? '密码至少 8 个字符'
        : ''
    : ''
  const confirmError = mode === 'register'
    ? !confirmPassword
      ? '请再次输入密码'
      : confirmPassword !== password
        ? '两次输入的密码不一致'
        : ''
    : ''
  const codeError = needCode
    ? !code
      ? '请输入验证码'
      : code.length !== 6
        ? '验证码为 6 位数字'
        : ''
    : ''

  const markTouched = (field: ValidatedField) => {
    setTouched((current) => ({ ...current, [field]: true }))
  }

  const focusField = (field: ValidatedField) => {
    document.getElementById(FIELD_IDS[field])?.focus()
  }

  const handleSendCode = async () => {
    clearError()
    if (emailError) {
      markTouched('email')
      focusField('email')
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    clearError()

    const activeFields: Array<{ field: ValidatedField; error: string }> = [
      { field: 'email', error: emailError },
      ...(needPassword ? [{ field: 'password' as const, error: passwordError }] : []),
      ...(mode === 'register' ? [{ field: 'confirmPassword' as const, error: confirmError }] : []),
      ...(needCode ? [{ field: 'code' as const, error: codeError }] : []),
    ]
    setTouched((current) => ({
      ...current,
      ...Object.fromEntries(activeFields.map(({ field }) => [field, true])),
    }))

    const firstInvalid = activeFields.find(({ error }) => Boolean(error))
    if (firstInvalid) {
      focusField(firstInvalid.field)
      return
    }

    try {
      if (mode === 'register') {
        await register(email, password, code, displayName || undefined)
        toast('注册成功', 'success')
      } else {
        const result = loginTab === 'password'
          ? await loginWithPassword(email, password)
          : await loginWithCode(email, code)
        const params = new URLSearchParams(window.location.search)
        const returnUrl = getSafeReturnUrl(params.get('return'))
        // 只有用户确认后才用 loginTicket 完成登录并让旧设备退出。
        if (result.requiresKickConfirm && result.loginTicket) {
          showKickConfirm(result.loginTicket, returnUrl)
        } else {
          toast('登录成功', 'success')
          setTimeout(() => { window.location.href = returnUrl }, 400)
        }
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : (mode === 'register' ? '注册失败' : '登录失败'))
    }
  }

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode)
    setCode('')
    setConfirmPassword('')
    setShowPassword(false)
    setShowConfirmPassword(false)
    setTouched({})
    clearError()
  }

  const switchLoginTab = (tab: LoginTab) => {
    setLoginTab(tab)
    setCode('')
    setShowPassword(false)
    setTouched({})
    clearError()
  }

  const inputClass = (hasError: boolean, extraClass = '') =>
    `min-h-11 w-full rounded-md border bg-white/55 px-3 py-2.5 text-sm text-slate-900 outline-none backdrop-blur-sm transition-[background-color,border-color,box-shadow] placeholder:text-slate-400 hover:border-slate-400 hover:bg-white/75 focus:bg-white/80 focus:ring-2 ${
      hasError
        ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
        : 'border-slate-300/80 focus:border-primary focus:ring-primary/10'
    } ${extraClass}`

  const fieldError = (field: ValidatedField, error: string) =>
    touched[field] && error ? (
      <span
        id={`${FIELD_IDS[field]}-error`}
        role="alert"
        className="relative ml-auto inline-flex max-w-[72%] items-center rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-right text-[11px] leading-4 text-red-600 shadow-sm after:absolute after:-bottom-1 after:right-3 after:h-2 after:w-2 after:rotate-45 after:border-b after:border-r after:border-red-200 after:bg-red-50"
      >
        {error}
      </span>
    ) : null

  const isFieldInvalid = (field: ValidatedField, error: string) => Boolean(touched[field] && error)

  const emailInvalid = isFieldInvalid('email', emailError)
  const passwordInvalid = isFieldInvalid('password', passwordError)
  const confirmInvalid = isFieldInvalid('confirmPassword', confirmError)
  const codeInvalid = isFieldInvalid('code', codeError)

  return (
    <main className="min-h-[100dvh] bg-[#e8eef2] px-4 py-6 sm:px-6 lg:flex lg:items-center lg:py-2">
      <ToastContainer />
      <h1 className="sr-only">ResumeCraft · 简历大师</h1>

      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6 flex items-center gap-3 lg:hidden">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-white">
            <FileText aria-hidden="true" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xl font-bold text-slate-900">ResumeCraft · 简历大师</p>
            <p className="mt-0.5 text-sm text-slate-600">从简历打磨到投递复盘</p>
          </div>
        </header>

        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(400px,0.85fr)] lg:gap-16">
          <section id="login-card" aria-labelledby="auth-heading" className="lg:col-start-2 lg:row-start-1">
            <div className={`mx-auto w-full max-w-[440px] rounded-lg border border-white/80 bg-white/70 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl ${mode === 'register' ? 'sm:p-5' : 'sm:p-7'}`}>
              <div>
                <h2 id="auth-heading" className="text-2xl font-bold text-slate-900">
                  {mode === 'register' ? '注册账号' : '登录账号'}
                </h2>
                <p className={`${mode === 'register' ? 'mt-1' : 'mt-2'} text-sm text-slate-600`}>
                  {mode === 'register' ? '创建账号，开始管理简历与投递记录' : '登录以同步您的简历与求职进度'}
                </p>
              </div>

              {sessionNotice && (
                <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-amber-200/80 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-800 backdrop-blur-sm">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{sessionNotice}</span>
                </div>
              )}

              {mode === 'login' && (
                <div role="tablist" aria-label="登录方式" className="mt-5 grid grid-cols-2 gap-1 rounded-md bg-slate-200/50 p-1 text-sm">
                  <button
                    id="password-login-tab"
                    type="button"
                    role="tab"
                    aria-selected={loginTab === 'password'}
                    aria-controls="auth-form-panel"
                    onClick={() => switchLoginTab('password')}
                    className={`min-h-10 rounded-md px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${
                      loginTab === 'password' ? 'bg-white/80 font-medium text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white/35 hover:text-slate-900'
                    }`}
                  >
                    密码登录
                  </button>
                  <button
                    id="code-login-tab"
                    type="button"
                    role="tab"
                    aria-selected={loginTab === 'code'}
                    aria-controls="auth-form-panel"
                    onClick={() => switchLoginTab('code')}
                    className={`min-h-10 rounded-md px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${
                      loginTab === 'code' ? 'bg-white/80 font-medium text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white/35 hover:text-slate-900'
                    }`}
                  >
                    验证码登录
                  </button>
                </div>
              )}

              <form
                id="auth-form-panel"
                role={mode === 'login' ? 'tabpanel' : undefined}
                aria-labelledby={mode === 'login' ? `${loginTab}-login-tab` : undefined}
                onSubmit={handleSubmit}
                className={mode === 'register' ? 'mt-4 space-y-3' : 'mt-5 space-y-4'}
                noValidate
              >
                {mode === 'register' && (
                  <div>
                    <label htmlFor={FIELD_IDS.displayName} className="block text-sm font-medium text-slate-700">
                      姓名 <span className="font-normal text-slate-400">（选填）</span>
                    </label>
                    <input
                      id={FIELD_IDS.displayName}
                      name="name"
                      type="text"
                      autoComplete="name"
                      aria-invalid={false}
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      className={`mt-1 ${inputClass(false)}`}
                      placeholder="请输入显示名称"
                    />
                  </div>
                )}

                <div>
                  <div className="flex min-h-6 items-center justify-between gap-2">
                    <label htmlFor={FIELD_IDS.email} className="shrink-0 text-sm font-medium text-slate-700">邮箱</label>
                    {fieldError('email', emailError)}
                  </div>
                  <input
                    id={FIELD_IDS.email}
                    name="email"
                    type="email"
                    autoComplete="username"
                    aria-invalid={emailInvalid}
                    aria-describedby={emailInvalid ? `${FIELD_IDS.email}-error` : undefined}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    onBlur={() => markTouched('email')}
                    className={`mt-1 ${inputClass(emailInvalid)}`}
                    placeholder="your@email.com"
                  />
                </div>

                {needPassword && (
                  <div>
                    <div className="flex min-h-6 items-center justify-between gap-2">
                      <label htmlFor={FIELD_IDS.password} className="shrink-0 text-sm font-medium text-slate-700">密码</label>
                      {fieldError('password', passwordError)}
                    </div>
                    <div className="relative mt-1">
                      <input
                        id={FIELD_IDS.password}
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                        aria-invalid={passwordInvalid}
                        aria-describedby={passwordInvalid ? `${FIELD_IDS.password}-error` : undefined}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        onBlur={() => markTouched('password')}
                        className={inputClass(passwordInvalid, 'pr-12')}
                        placeholder="至少 8 个字符"
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? '隐藏密码' : '显示密码'}
                        title={showPassword ? '隐藏密码' : '显示密码'}
                        onClick={() => setShowPassword((visible) => !visible)}
                        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-slate-500 transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      >
                        {showPassword
                          ? <EyeOff aria-hidden="true" className="h-[18px] w-[18px]" />
                          : <Eye aria-hidden="true" className="h-[18px] w-[18px]" />}
                      </button>
                    </div>
                  </div>
                )}

                {mode === 'register' && (
                  <div>
                    <div className="flex min-h-6 items-center justify-between gap-2">
                      <label htmlFor={FIELD_IDS.confirmPassword} className="shrink-0 text-sm font-medium text-slate-700">确认密码</label>
                      {fieldError('confirmPassword', confirmError)}
                    </div>
                    <div className="relative mt-1">
                      <input
                        id={FIELD_IDS.confirmPassword}
                        name="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        aria-invalid={confirmInvalid}
                        aria-describedby={confirmInvalid ? `${FIELD_IDS.confirmPassword}-error` : undefined}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        onBlur={() => markTouched('confirmPassword')}
                        className={inputClass(confirmInvalid, 'pr-12')}
                        placeholder="再次输入密码"
                      />
                      <button
                        type="button"
                        aria-label={showConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
                        title={showConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
                        onClick={() => setShowConfirmPassword((visible) => !visible)}
                        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-slate-500 transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      >
                        {showConfirmPassword
                          ? <EyeOff aria-hidden="true" className="h-[18px] w-[18px]" />
                          : <Eye aria-hidden="true" className="h-[18px] w-[18px]" />}
                      </button>
                    </div>
                  </div>
                )}

                {needCode && (
                  <div>
                    <div className="flex min-h-6 items-center justify-between gap-2">
                      <label htmlFor={FIELD_IDS.code} className="shrink-0 text-sm font-medium text-slate-700">邮箱验证码</label>
                      {fieldError('code', codeError)}
                    </div>
                    <div className="mt-1 flex gap-2">
                      <input
                        id={FIELD_IDS.code}
                        name="code"
                        type="text"
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        maxLength={6}
                        aria-invalid={codeInvalid}
                        aria-describedby={codeInvalid ? `${FIELD_IDS.code}-error` : undefined}
                        value={code}
                        onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        onBlur={() => markTouched('code')}
                        className={inputClass(codeInvalid, 'min-w-0')}
                        placeholder="6 位数字"
                      />
                      <button
                        type="button"
                        onClick={handleSendCode}
                        disabled={countdown > 0 || sending || !isValidEmail(email)}
                        className="min-h-11 min-w-[104px] shrink-0 whitespace-nowrap rounded-md border border-slate-300/80 bg-white/40 px-3 py-2 text-sm font-medium text-primary backdrop-blur-sm transition hover:border-slate-400 hover:bg-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:border-slate-300 disabled:hover:bg-white/40"
                      >
                        {sending ? '发送中...' : countdown > 0 ? `${countdown}s 后重发` : '获取验证码'}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  aria-busy={isLoading}
                  className="min-h-11 w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? (mode === 'register' ? '注册中...' : '登录中...') : mode === 'register' ? '注册' : '登录'}
                </button>
              </form>

              <div className={`${mode === 'register' ? 'mt-2' : 'mt-4'} text-center`}>
                <button
                  type="button"
                  onClick={() => switchMode(mode === 'register' ? 'login' : 'register')}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm text-primary transition hover:bg-primary/5 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                >
                  {mode === 'register' ? (
                    <><LogIn aria-hidden="true" className="h-4 w-4" />已有账号？登录</>
                  ) : (
                    <><UserPlus aria-hidden="true" className="h-4 w-4" />没有账号？注册</>
                  )}
                </button>
              </div>
            </div>
          </section>

          <section aria-labelledby="product-heading" className="lg:col-start-1 lg:row-start-1 lg:pr-6">
            <div className="hidden lg:block">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                <Sparkles aria-hidden="true" className="h-4 w-4" />
                AI 驱动的在线简历工作台
              </div>
              <p id="product-heading" className="mt-5 text-4xl font-bold leading-tight text-slate-900">
                ResumeCraft · 简历大师
              </p>
              <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
                从简历制作、定向适配到投递复盘，在一个工作台完成完整求职流程。
              </p>
            </div>

            <div className="mt-2 lg:mt-10">
              <h2 className="text-lg font-semibold text-slate-900 lg:text-base">覆盖求职全链路</h2>
              <div className="mt-5 grid gap-3">
                {FEATURES.map((feature) => (
                  <div
                    key={feature.title}
                    className="group flex gap-4 rounded-lg border border-white/70 bg-white/50 p-4 shadow-[0_6px_18px_rgba(15,23,42,0.04)] backdrop-blur-md transition-[transform,box-shadow,background-color,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-white hover:bg-white/75 hover:shadow-[0_12px_30px_rgba(15,23,42,0.10)] motion-reduce:transform-none"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/80 bg-white/55 text-primary transition-transform duration-200 ease-out group-hover:scale-105 motion-reduce:transform-none">
                      <feature.icon aria-hidden="true" className="h-[18px] w-[18px]" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{feature.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-10 text-xs text-slate-400">ResumeCraft · 用心打磨每一份简历</p>
          </section>
        </div>
      </div>
    </main>
  )
}

export default LoginPage
