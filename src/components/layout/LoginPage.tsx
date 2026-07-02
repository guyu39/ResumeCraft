// ============================================================
// 登录 / 注册页面
// 注册：姓名(选填) + 邮箱 + 密码 + 确认密码 + 邮箱验证码
// 登录：密码登录 / 验证码登录 双 Tab
// UI 统一：字段级内联校验（就近红字）+ 操作结果用 Toast 弹窗
// ============================================================

import React, { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import {
  LogIn, UserPlus, FileText, Sparkles, LayoutTemplate, GitCompare,
  MessagesSquare, ShieldCheck, Languages, Share2, ChevronDown,
} from 'lucide-react'
import ToastContainer, { toast } from '@/components/common/Toast'
import { ApiError } from '@/api'

type Mode = 'login' | 'register'
type LoginTab = 'password' | 'code'

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

// 产品特性（用于登录页背景介绍，纯图标 + 文案，不依赖截图资源）
const FEATURES: Array<{ icon: React.ComponentType<{ className?: string }>; title: string; desc: string }> = [
  { icon: LayoutTemplate, title: '多模板 · 实时预览', desc: '经典/现代/简约多套模板，主题色、排版、模块标题样式自由定制，A4 实时预览所见即所得。' },
  { icon: Sparkles, title: 'AI 写作助手', desc: '内容评估、JD 匹配优化、要点改写、STAR 引导、实时写作诊断，让每一句都更有说服力。' },
  { icon: ShieldCheck, title: '一致性体检', desc: '一键扫描时间线断档、技能与经历矛盾、占位内容等问题，并支持 AI 一键修复。' },
  { icon: GitCompare, title: '版本快照 · 差异对比', desc: '随时固化命名版本，Git 风格逐字段对比，多端编辑冲突自动仲裁，改动有迹可循。' },
  { icon: MessagesSquare, title: '模拟面试', desc: 'AI 按简历与 JD 出题、答题评估、多轮追问、录音转写分析，面试前充分演练。' },
  { icon: Languages, title: '中英双语 · 一键翻译', desc: 'AI 翻译生成英文副本并保留排版，中英简历一键切换，从容应对外企与海外岗位。' },
  { icon: Share2, title: '分享与评论', desc: '生成分享链接，导师/HR 可逐模块批注建议，反馈直接落到对应内容。' },
  { icon: FileText, title: '高保真 PDF 导出', desc: '后端 Chromium 渲染，导出效果与预览一致，分页友好，投递无忧。' },
]

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
    <div className="no-scrollbar relative h-screen overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.16),transparent_28%),linear-gradient(180deg,#f8fbff_0%,#eef4fb_45%,#eaf0f8_100%)]">
      <ToastContainer />

      {/* 全屏可滚动产品介绍背景。lg 及以上为登录卡片让出右侧空间，避免被固定卡片永久遮挡 */}
      <div className="mx-auto max-w-5xl px-6 pb-24 lg:mr-[460px] lg:max-w-3xl">
        {/* 顶部品牌 + 标语 */}
        <header className="flex min-h-screen flex-col items-center justify-center text-center lg:items-start lg:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/60 px-4 py-1.5 text-xs font-medium text-primary backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            AI 驱动的在线简历工作台
          </div>
          <h1 className="mt-6 bg-gradient-to-r from-slate-900 via-primary to-sky-500 bg-clip-text text-4xl font-extrabold leading-tight text-transparent sm:text-5xl">
            ResumeCraft · 简历大师
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-500">
            三栏工作台、实时 A4 预览、AI 写作与体检、版本快照与多端同步——
            从撰写到投递，一站式打造更有竞争力的简历。
          </p>
          <button
            type="button"
            onClick={() => document.getElementById('login-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="mt-8 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-primary/25 transition hover:bg-primary/90 lg:hidden"
          >
            去登录 / 注册
          </button>
          <div className="mt-14 flex flex-col items-center gap-1 text-xs text-slate-400 lg:items-start">
            <span>向下滚动了解更多</span>
            <ChevronDown className="h-4 w-4 animate-bounce" />
          </div>
        </header>

        {/* 特性介绍（毛玻璃卡片网格） */}
        <section className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-white/60 bg-white/55 p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl transition hover:bg-white/75"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-800">{f.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{f.desc}</p>
            </div>
          ))}
        </section>

        <p className="mt-12 text-center text-xs text-slate-400">
          ResumeCraft · 用心打磨每一份简历
        </p>
      </div>

      {/* 登录卡片：大屏固定在右侧、介绍内容已让出右边距；小屏走文档流在介绍下方 */}
      <div
        id="login-card"
        className="px-4 pb-16 lg:pointer-events-none lg:fixed lg:inset-y-0 lg:right-0 lg:flex lg:w-[460px] lg:items-center lg:justify-center lg:px-8 lg:pb-0"
      >
        <div className="pointer-events-auto mx-auto w-full max-w-md">
          <div className="rounded-3xl border border-white/70 bg-white/80 p-8 shadow-[0_24px_70px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-slate-900">
                {mode === 'register' ? '注册账号' : '登录账号'}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {mode === 'register' ? '创建新账号，开始云端管理简历' : '登录以同步您的简历数据'}
              </p>
            </div>

            {/* 登录方式 Tab（仅登录态显示） */}
            {mode === 'login' && (
              <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100/80 p-1 text-sm">
                <button
                  type="button"
                  onClick={() => switchLoginTab('password')}
                  className={`rounded-lg py-2 transition-colors ${loginTab === 'password' ? 'bg-white font-medium text-primary shadow-sm' : 'text-slate-500'}`}
                >
                  密码登录
                </button>
                <button
                  type="button"
                  onClick={() => switchLoginTab('code')}
                  className={`rounded-lg py-2 transition-colors ${loginTab === 'code' ? 'bg-white font-medium text-primary shadow-sm' : 'text-slate-500'}`}
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
                        touched.code && codeError ? 'border-red-300 focus:border-red-500 focus:ring-red-100' : 'border-slate-200 focus:border-primary focus:ring-primary/10'
                      }`}
                      placeholder="6 位数字验证码"
                    />
                    <button
                      type="button"
                      onClick={handleSendCode}
                      disabled={countdown > 0 || sending || !isValidEmail(email)}
                      className="shrink-0 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-sm text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
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
                className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80"
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
    </div>
  )
}

export default LoginPage
