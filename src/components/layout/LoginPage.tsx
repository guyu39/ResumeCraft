// ============================================================
// 登录 / 注册页面
// 注册：姓名(选填) + 邮箱 + 密码 + 确认密码 + 邮箱验证码
// 登录：密码登录 / 验证码登录 双 Tab
// UI 统一：字段级内联校验（就近红字）+ 操作结果用 Toast 弹窗
// ============================================================

import React, { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import {
  LogIn, UserPlus, Sparkles, LayoutTemplate, ChevronDown, AlertTriangle,
  BriefcaseBusiness, BarChart3,
} from 'lucide-react'
import ToastContainer, { toast } from '@/components/common/Toast'
import { ApiError } from '@/api'
import { getSafeReturnUrl } from '@/api/authSession'

type Mode = 'login' | 'register'
type LoginTab = 'password' | 'code'

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

// 产品特性（登录页背景介绍，只挑核心能力展示，避免信息过载）
type Feature = {
  icon: React.ComponentType<{ className?: string }>
  title: string
  desc: string
  size?: 'hero'   // hero=渐变核心大卡（跨满整行）
  accent?: boolean        // 强调卡（投递/数据类，浅色高亮）
}
const FEATURES: Feature[] = [
  { icon: Sparkles, title: 'AI 写作助手', desc: '内容评估、JD 匹配优化、要点改写、STAR 引导与实时写作诊断，让每一句都更有说服力。', size: 'hero' },
  { icon: LayoutTemplate, title: '多模板 · 实时预览', desc: '经典/现代/简约多套模板，主题色、排版、模块标题样式自由定制，A4 实时预览所见即所得。' },
  { icon: BriefcaseBusiness, title: '投递管理 · 面试跟踪', desc: '集中管理投递记录，跟踪多轮面试流程与结果，关联简历版本与岗位 JD，进度一目了然。', accent: true },
  { icon: BarChart3, title: '求职数据分析', desc: '转化漏斗、阶段分布与简历版本对比，用数据看清每份简历的投递成效与薄弱环节。', accent: true },
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

  // 字段级校验提示 + 已交互标记（失焦/提交后才显示，避免一进来就飘红）
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const [countdown, setCountdown] = useState(0)
  const [sending, setSending] = useState(false)
  const timerRef = useRef<number | null>(null)

  const [sessionNotice, setSessionNotice] = useState<string | null>(null)

  // 桌面端两屏相位：'brand'(品牌首屏) ⇄ 'features'(功能介绍)；滚轮一次翻转 + CSS 过渡
  const [phase, setPhase] = useState<'brand' | 'features'>('brand')
  const phaseRef = useRef<'brand' | 'features'>('brand')
  const scrollRef = useRef<HTMLDivElement>(null)
  const goPhase = (p: 'brand' | 'features') => {
    if (phaseRef.current === p) return
    phaseRef.current = p
    setPhase(p)
  }
  const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches

  // 功能特性直接展示（精选几项核心能力，无需分页滑动）

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const reason = params.get('reason')
    if (reason === 'kicked' || reason === 'expired') {
      setSessionNotice(
        reason === 'kicked'
          ? '您的账号已在其他设备登录，当前会话已失效，请重新登录。'
          : '登录状态已失效，请重新登录。登录后将返回之前的页面。',
      )
      // 清理 URL 参数，避免刷新后重复提示
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.delete('reason')
      window.history.replaceState({}, '', newUrl.pathname + newUrl.search)
    }
  }, [])

  useEffect(() => {
    return () => { if (timerRef.current) window.clearInterval(timerRef.current) }
  }, [])

  // 滚动入场：特性卡片进入视口时上浮显现（stagger 由卡片内联 transitionDelay 控制）
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))
    if (!els.length) return
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-visible'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible')
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  // 桌面端：滚轮一次即翻转两屏（移动端不接管，保持原生滚动）
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let locked = false
    const onWheel = (e: WheelEvent) => {
      if (!isDesktop()) return // 移动端原生滚动
      const t = e.target as HTMLElement | null
      if (t && t.closest('#login-card')) return // 登录卡片区不翻转
      e.preventDefault()
      if (locked || Math.abs(e.deltaY) < 6) return
      goPhase(e.deltaY > 0 ? 'features' : 'brand')
      locked = true
      window.setTimeout(() => { locked = false }, 700) // 过渡期间锁定，避免连滚反复翻转
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
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
      } else {
        const result = loginTab === 'password'
          ? await loginWithPassword(email, password)
          : await loginWithCode(email, code)
        const params = new URLSearchParams(window.location.search)
        const returnUrl = getSafeReturnUrl(params.get('return'))
        // 单设备登录两阶段：检测到他设备 → 后端未签发 token、未踢旧设备，只返回 loginTicket。
        // 暂存 ticket 弹二次确认；用户「是我，继续」才用 ticket 完成登录（此时踢旧设备）。
        if (result.requiresKickConfirm && result.loginTicket) {
          showKickConfirm(result.loginTicket, returnUrl)
        } else {
          toast('登录成功', 'success')
          // 稍延迟让 toast 可见
          setTimeout(() => { window.location.href = returnUrl }, 400)
        }
      }
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
    <div ref={scrollRef} className="no-scrollbar relative h-screen overflow-y-auto scroll-smooth lg:overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.16),transparent_28%),linear-gradient(180deg,#f8fbff_0%,#eef4fb_45%,#eaf0f8_100%)]">
      <ToastContainer />

      {/* 背景浮动光斑（缓慢呼吸，纯装饰，不响应交互） */}
      <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden">
        <div className="animate-float-slow absolute -left-24 top-20 h-72 w-72 rounded-full bg-indigo-300/30 blur-3xl" />
        <div className="animate-float-slower absolute right-16 top-1/3 h-80 w-80 rounded-full bg-sky-300/30 blur-3xl" />
        <div className="animate-float-slow absolute bottom-12 left-1/3 h-64 w-64 rounded-full bg-blue-300/20 blur-3xl" />
      </div>

      {/* 内容区：移动端原生滚动；桌面端两屏叠放，滚轮翻转相位 */}
      <div className="relative z-10 mx-auto max-w-5xl px-6 pb-24 lg:mr-[460px] lg:max-w-4xl lg:h-screen lg:overflow-hidden lg:px-0">
        {/* —— 品牌首屏（桌面端随相位淡出，≤0.5s） —— */}
        <header
          className={`flex min-h-screen flex-col items-center justify-center text-center lg:absolute lg:inset-0 lg:min-h-0 lg:h-full lg:items-start lg:justify-center lg:px-8 lg:text-left lg:transition-all lg:duration-500 lg:ease-out ${phase === 'features' ? 'lg:opacity-0 lg:-translate-y-4 lg:pointer-events-none' : 'lg:opacity-100 lg:translate-y-0'}`}
        >
          <div className="animate-fade-in inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/60 px-4 py-1.5 text-xs font-medium text-primary backdrop-blur" style={{ animationDelay: '60ms' }}>
            <Sparkles className="h-3.5 w-3.5" />
            AI 驱动的在线简历工作台
          </div>
          <h1 className="mt-6 animate-gradient-flow bg-gradient-to-r from-slate-900 via-primary to-sky-500 bg-clip-text text-4xl font-extrabold leading-tight text-transparent sm:text-5xl">
            ResumeCraft · 简历大师
          </h1>
          <p className="animate-fade-in mt-4 max-w-2xl text-base leading-relaxed text-slate-500" style={{ animationDelay: '260ms' }}>
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
          <button
            type="button"
            onClick={() => { if (isDesktop()) goPhase('features'); else document.getElementById('features')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
            className="mt-14 flex flex-col items-center gap-1 text-xs text-slate-400 transition hover:text-primary lg:items-start"
          >
            <span>向下滚动了解更多</span>
            <ChevronDown className="h-4 w-4 animate-bounce" />
          </button>
        </header>

        {/* —— 功能介绍屏（桌面端随相位浮现） —— */}
        <section
          id="features"
          className={`mt-4 min-h-screen lg:absolute lg:inset-0 lg:mt-0 lg:flex lg:min-h-0 lg:h-full lg:flex-col lg:justify-center lg:overflow-hidden lg:px-8 lg:py-16 lg:transition-all lg:duration-500 lg:ease-out ${phase === 'features' ? 'lg:opacity-100 lg:translate-y-0' : 'lg:opacity-0 lg:translate-y-8 lg:pointer-events-none'}`}
        >
          {/* 吸顶品牌缩略：出现在标题上方一点，点击回首屏 */}
          <button
            type="button"
            onClick={() => goPhase('brand')}
            className={`mb-4 hidden items-center gap-2 text-sm font-bold lg:flex lg:transition-all lg:duration-500 lg:ease-out ${phase === 'features' ? 'lg:opacity-100 lg:translate-y-0' : 'lg:opacity-0 lg:translate-y-2'}`}
            style={{ transitionDelay: phase === 'features' ? '0.1s' : '0s' }}
          >
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="bg-gradient-to-r from-slate-900 via-primary to-sky-500 bg-clip-text text-2xl text-transparent">ResumeCraft · 简历大师</span>
          </button>

          {/* 标题：移动端 sticky 吸顶，桌面端随相位浮现（时序晚于品牌淡出） */}
          <div
            className={`sticky top-0 z-10 mb-5 bg-white/70 px-1 py-3 backdrop-blur-md lg:static lg:bg-transparent lg:p-0 lg:backdrop-blur-none lg:transition-all lg:duration-500 lg:ease-out ${phase === 'features' ? 'lg:opacity-100 lg:translate-y-0' : 'lg:opacity-0 lg:translate-y-3'}`}
            style={{ transitionDelay: phase === 'features' ? '0.18s' : '0s' }}
          >
            <h2 className="text-lg font-bold tracking-tight text-slate-900">一个工作台，覆盖求职全链路</h2>
            <p className="mt-1 text-sm text-slate-500">从撰写、打磨到投递复盘，关键能力一站集成</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => {
              const isHero = f.size === 'hero'
              const isAccent = f.accent
              const span = isHero ? 'sm:col-span-2 lg:col-span-3' : ''
              const surface = isHero
                ? 'bg-gradient-to-br from-indigo-500 via-indigo-500 to-sky-500 text-white border-transparent shadow-xl shadow-indigo-500/20'
                : isAccent
                ? 'bg-gradient-to-br from-indigo-50 to-sky-50 border-indigo-200/70 ring-1 ring-indigo-200/50'
                : 'bg-white/55 border-white/60'
              const iconBox = isHero
                ? 'bg-white/20 text-white'
                : isAccent
                ? 'bg-indigo-500 text-white'
                : 'bg-primary/10 text-primary'
              const titleColor = isHero ? 'text-white' : 'text-slate-800'
              const descColor = isHero ? 'text-indigo-100' : isAccent ? 'text-slate-600' : 'text-slate-500'
              return (
                <div
                  key={f.title}
                  className={`${span} lg:transition-all lg:duration-500 lg:ease-out ${phase === 'features' ? 'lg:opacity-100 lg:translate-y-0' : 'lg:opacity-0 lg:translate-y-6'}`}
                  style={{ transitionDelay: phase === 'features' ? `${0.26 + i * 0.08}s` : '0s' }}
                >
                  <div className={`group relative flex h-full ${isHero ? 'flex-row items-center gap-4 sm:gap-5' : 'flex-col'} rounded-2xl border p-5 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_50px_rgba(15,23,42,0.12)] ${surface}`}>
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition group-hover:scale-110 ${iconBox}`}>
                      <f.icon className="h-5 w-5" />
                    </div>
                    {isHero && (
                      <span className="absolute right-4 top-4 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium text-white">
                        核心
                      </span>
                    )}
                    <div className={isHero ? '' : 'mt-3'}>
                      <h3 className={`text-sm font-semibold ${titleColor}`}>{f.title}</h3>
                      <p className={`mt-1.5 text-xs leading-relaxed ${descColor}`}>{f.desc}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <p className="mt-10 text-center text-xs text-slate-400">
            ResumeCraft · 用心打磨每一份简历
          </p>
        </section>
      </div>

      {/* 登录卡片：大屏固定在右侧、介绍内容已让出右边距；小屏走文档流在介绍下方 */}
      <div
        id="login-card"
        className="px-4 pb-16 lg:pointer-events-none lg:fixed lg:inset-y-0 lg:right-0 lg:flex lg:w-[460px] lg:items-center lg:justify-center lg:px-8 lg:pb-0"
      >
          <div className="pointer-events-auto mx-auto w-full max-w-md">
          <div className="animate-card-in rounded-3xl border border-white/70 bg-white/80 p-8 shadow-[0_24px_70px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-slate-900">
                {mode === 'register' ? '注册账号' : '登录账号'}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {mode === 'register' ? '创建新账号，开始云端管理简历' : '登录以同步您的简历数据'}
              </p>
            </div>

            {sessionNotice && (
              <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{sessionNotice}</span>
              </div>
            )}

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
