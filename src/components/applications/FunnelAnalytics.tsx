// ============================================================
// FunnelAnalytics — 求职数据分析（图表化，无列表）
// 数据来源：GET /api/applications/stats
// 布局：紧凑 KPI 概览 + 进展卡（阶段分布环图 / 转化漏斗二合一）+ 简历版本对比
// ============================================================

import React, { useEffect, useMemo, useState } from 'react'
import {
  Send,
  FileCheck,
  Users,
  Trophy,
  RefreshCw,
  PieChart as PieIcon,
  Layers3,
} from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts'
import { applicationsApi, type FunnelStatsResponse } from '@/api/applications'
import { toast } from '@/components/common/Toast'

// 统一配色（与项目 primary #1A56DB 呼应，且各段对比分明、可达 WCAG）
const COLOR = {
  submitted: '#1A56DB', // primary 蓝
  writtenTest: '#6366F1', // indigo
  interview: '#F59E0B', // amber（强调色）
  offer: '#10B981', // emerald（正向）
} as const

const pct = (n: number, d: number): string => (d > 0 ? Math.round((n / d) * 100) + '%' : '—')

/** 尊重 prefers-reduced-motion：关闭 Recharts 进场动画 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = () => setReduced(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}

const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid #E2E8F0',
  boxShadow: '0 6px 20px rgba(15,23,42,0.10)',
  fontSize: 12,
  padding: '8px 10px',
}

type Kpi = {
  label: string
  value: number | string
  icon: React.ComponentType<{ className?: string }>
  tone: 'blue' | 'indigo' | 'amber' | 'emerald'
  hint: string
  isText?: boolean
}

const TONE: Record<Kpi['tone'], { bg: string; fg: string }> = {
  blue: { bg: 'bg-blue-50', fg: 'text-blue-600' },
  indigo: { bg: 'bg-indigo-50', fg: 'text-indigo-600' },
  amber: { bg: 'bg-amber-50', fg: 'text-amber-600' },
  emerald: { bg: 'bg-emerald-50', fg: 'text-emerald-600' },
}

const FunnelAnalytics: React.FC = () => {
  const [data, setData] = useState<FunnelStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const reduced = usePrefersReducedMotion()

  const load = async () => {
    setLoading(true)
    try {
      const res = await applicationsApi.getStats()
      setData(res)
    } catch (err) {
      toast(err instanceof Error ? err.message : '统计加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  // 阶段分布环图（互斥分段，由 funnel 累计计数推导）
  const donut = useMemo(() => {
    if (!data) return []
    const f = data.funnel
    return [
      { name: '仅投递', value: Math.max(0, f.submitted - f.writtenTest), color: COLOR.submitted, unit: '次' },
      { name: '笔试阶段', value: Math.max(0, f.writtenTest - f.interview), color: COLOR.writtenTest, unit: '次' },
      { name: '面试阶段', value: Math.max(0, f.interview - f.offer), color: COLOR.interview, unit: '次' },
      { name: '已 Offer', value: Math.max(0, f.offer), color: COLOR.offer, unit: '个' },
    ].filter((d) => d.value > 0)
  }, [data])

  const donutBase = data?.funnel.submitted ?? 0
  const donutTotal = donut.reduce((s, d) => s + d.value, 0) || 1

  // 求职漏斗（4 阶段）
  const funnelStages = useMemo(() => {
    if (!data) return []
    const f = data.funnel
    return [
      { name: '已投递', value: f.submitted, color: COLOR.submitted, unit: '次' },
      { name: '笔试', value: f.writtenTest, color: COLOR.writtenTest, unit: '次' },
      { name: '面试', value: f.interview, color: COLOR.interview, unit: '次' },
      { name: 'Offer', value: f.offer, color: COLOR.offer, unit: '个' },
    ]
  }, [data])

  // 简历版本对比（按回复率降序，分组条形）
  const versionData = useMemo(() => {
    if (!data) return []
    // 后端在无分组数据时返回 null/undefined（Go nil slice），兜底避免「is not iterable」
    return [...(data.bySnapshot ?? [])]
      .sort((a, b) => b.replyRate - a.replyRate)
      .map((s) => ({
        name: s.snapshotLabel || `${s.snapshotVersionId.slice(0, 8)}…`,
        resumeTitle: s.resumeTitle || '未命名简历',
        submitted: s.submitted,
        interview: s.interview,
        offer: s.offer,
        replyRate: Math.round(s.replyRate * 100),
      }))
  }, [data])

  const barHeight = Math.max(180, versionData.length * 40 + 36)

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> 加载中...
      </div>
    )
  }

  if (!data) return null

  const { funnel } = data
  const isEmpty = funnel.total === 0

  const kpis: Kpi[] = [
    { label: '投递数', value: funnel.submitted, icon: Send, tone: 'blue', hint: '已提交' },
    { label: '笔试', value: funnel.writtenTest, icon: FileCheck, tone: 'indigo', hint: `转化 ${pct(funnel.writtenTest, funnel.submitted)}` },
    { label: '面试', value: funnel.interview, icon: Users, tone: 'amber', hint: `转化 ${pct(funnel.interview, funnel.writtenTest)}` },
    { label: 'Offer', value: funnel.offer, icon: Trophy, tone: 'emerald', hint: `转化 ${pct(funnel.offer, funnel.interview)}` },
    { label: '整体回复率', value: pct(funnel.interview, funnel.submitted), icon: PieIcon, tone: 'blue', isText: true, hint: '面试 / 投递' },
    { label: 'Offer率', value: pct(funnel.offer, funnel.submitted), icon: Trophy, tone: 'emerald', isText: true, hint: 'Offer / 投递' },
  ]

  return (
    <div className="h-full overflow-y-auto px-0 py-0 no-scrollbar">
      <div className="space-y-4">
        {isEmpty ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface py-16 text-center">
            <Send className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-4 text-sm text-muted">还没有投递数据</p>
            <p className="mt-1 text-xs text-slate-400">先去「投递列表」添加投递记录，这里将自动展示转化分析</p>
          </div>
        ) : (
          <>
            {/* KPI 概览：紧凑网格，信息密度更高（6 项） */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {kpis.map((k) => {
                const t = TONE[k.tone]
                return (
                  <div
                    key={k.label}
                    className="group rounded-xl border border-line bg-surface p-3 transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted">{k.label}</span>
                      <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${t.bg}`}>
                        <k.icon className={`h-3.5 w-3.5 ${t.fg}`} />
                      </span>
                    </div>
                    <p className="mt-1.5 text-xl font-bold tabular-nums text-ink">{k.value}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{k.hint}</p>
                  </div>
                )
              })}
            </div>

            {/* 投递进展：阶段分布 + 转化漏斗 合并为一张卡片，提升密度与连贯性 */}
            <div className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex items-center gap-2">
                <PieIcon className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-ink">投递进展</h3>
                <span className="ml-auto text-xs text-slate-400">共 {funnel.total} 条记录</span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* 左：阶段分布环图 */}
                <div>
                  <p className="mb-2 text-xs font-medium text-slate-500">阶段分布</p>
                  <div className="flex flex-col items-center gap-3 sm:flex-row">
                    <div className="relative h-44 w-44 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={donut}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={56}
                            outerRadius={84}
                            paddingAngle={2}
                            stroke="none"
                            isAnimationActive={!reduced}
                          >
                            {donut.map((d, i) => (
                              <Cell key={i} fill={d.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={tooltipStyle}
                            formatter={(value: any, name: any, item: any) => [
                              `${value} ${item?.payload?.unit ?? '次'}（${pct(value, donutTotal)}）`,
                              name,
                            ]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xs text-muted">总投递</span>
                        <span className="text-2xl font-bold tabular-nums text-ink">{donutBase}</span>
                      </div>
                    </div>

                    <div className="w-full flex-1 space-y-1.5">
                      {donut.map((d) => (
                        <div key={d.name} className="flex items-center gap-2 text-sm">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                          <span className="text-ink">{d.name}</span>
                          <span className="ml-auto tabular-nums text-muted">{d.value} {d.unit}</span>
                          <span className="w-12 text-right tabular-nums font-medium text-ink">{pct(d.value, donutTotal)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 右：倒三角漏斗（梯形堆叠，无缝连续收窄） */}
                <div>
                  <p className="mb-2 text-xs font-medium text-slate-500">转化漏斗</p>
                  <div className="relative h-44">
                    <svg
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      className="absolute inset-0 h-full w-full"
                      role="img"
                      aria-label="求职转化漏斗"
                    >
                      {funnelStages.map((s, i) => {
                        const maxV = funnel.submitted || 1
                        const halfW = (v: number) => Math.min((v / maxV) * 48, 48)
                        const y0 = i * 25
                        const y1 = (i + 1) * 25
                        const topW = halfW(s.value)
                        const bottomW = halfW(i < funnelStages.length - 1 ? funnelStages[i + 1].value : 0)
                        const pts = `${50 - topW},${y0} ${50 + topW},${y0} ${50 + bottomW},${y1} ${50 - bottomW},${y1}`
                        return <polygon key={s.name} points={pts} fill={s.color} />
                      })}
                    </svg>
                    <div className="pointer-events-none absolute inset-0">
                      {funnelStages.map((s, i) => {
                        const maxV = funnel.submitted || 1
                        const halfW = (v: number) => Math.min((v / maxV) * 48, 48)
                        const topW = halfW(s.value)
                        const bottomW = halfW(i < funnelStages.length - 1 ? funnelStages[i + 1].value : 0)
                        const avgW = (topW + bottomW) / 2
                        const showInside = avgW >= 18
                        return (
                          <div
                            key={s.name}
                            className="absolute left-0 right-0 flex items-center px-1"
                            style={{ top: `${i * 25}%`, height: '25%' }}
                          >
                            {showInside ? (
                              <span
                                className="w-full truncate text-center text-[10px] font-semibold leading-tight text-white"
                                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.45)' }}
                              >
                                {s.name} {s.value}
                              </span>
                            ) : (
                              <span className="ml-auto rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold shadow-sm" style={{ color: s.color }}>
                                {s.name} {s.value}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* 每阶显式转化 %（带阶段色顶边，提升可读性） */}
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {funnelStages.map((s, i) => {
                      const prev = i === 0 ? funnel.submitted : funnelStages[i - 1].value
                      const rate = i === 0 ? 100 : prev > 0 ? Math.round((s.value / prev) * 100) : 0
                      return (
                        <div
                          key={s.name}
                          className="rounded-lg border border-line bg-canvas px-2 py-2"
                          style={{ borderTopColor: s.color, borderTopWidth: 2 }}
                        >
                          <p className="truncate text-[11px] text-muted">{s.name}</p>
                          <p className="mt-0.5 text-base font-bold tabular-nums text-ink">{s.value}</p>
                          <p className="text-[10px]" style={{ color: s.color }}>{i === 0 ? '基准' : `转化 ${rate}%`}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* 简历版本对比（分组条形图，替代原列表） */}
            <div className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex items-center gap-2">
                <Layers3 className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-ink">简历版本对比</h3>
                <span className="ml-auto text-xs text-slate-400">按回复率降序</span>
              </div>

              {versionData.length === 0 ? (
                <p className="mt-4 text-center text-xs text-slate-400">暂无版本对比数据</p>
              ) : (
                <div className="mt-3" style={{ height: barHeight }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={versionData}
                      layout="vertical"
                      margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                      barGap={2}
                    >
                      <CartesianGrid horizontal={false} stroke="#EEF2F6" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={110}
                        tick={{ fontSize: 11, fill: '#0F172A' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        cursor={{ fill: 'rgba(26,86,219,0.06)' }}
                        formatter={(value: any, name: any, item: any) => {
                          const map: Record<string, { label: string; unit: string }> = {
                            submitted: { label: '投递', unit: '次' },
                            interview: { label: '面试', unit: '次' },
                            offer: { label: 'Offer', unit: '个' },
                          }
                          const meta = map[name] ?? { label: name, unit: '次' }
                          const reply = item?.payload?.replyRate
                          return [
                            `${value} ${meta.unit}${name === 'offer' && reply != null ? ` · 回复率 ${reply}%` : ''}`,
                            meta.label,
                          ]
                        }}
                      />
                      <Legend
                        iconType="circle"
                        wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
                        formatter={(value) => <span style={{ color: '#64748B' }}>{value}</span>}
                      />
                      <Bar dataKey="submitted" name="投递" fill={COLOR.submitted} radius={[0, 4, 4, 0]} isAnimationActive={!reduced} />
                      <Bar dataKey="interview" name="面试" fill={COLOR.interview} radius={[0, 4, 4, 0]} isAnimationActive={!reduced} />
                      <Bar dataKey="offer" name="Offer" fill={COLOR.offer} radius={[0, 4, 4, 0]} isAnimationActive={!reduced} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default FunnelAnalytics
