// ============================================================
// FunnelAnalytics — 求职数据分析（图表化，无列表）
// 数据来源：GET /api/applications/stats
// 可视化（ui-ux-pro-max 选型）：
//   - KPI 卡片（保持）
//   - 阶段分布环图（饼图，满足"用饼图"需求，带 % + 图例表兜底）
//   - 求职漏斗（真正漏斗图，每阶显式转化 %）
//   - 简历版本对比（分组条形图，AAA 无障碍，替代原列表）
// ============================================================

import React, { useEffect, useMemo, useState } from 'react'
import {
  Send,
  FileCheck,
  Users,
  Trophy,
  RefreshCw,
  PieChart as PieIcon,
  Filter,
  Layers3,
} from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  FunnelChart,
  Funnel,
  LabelList,
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
  // 单位规则：投递/笔试/面试为「次」，Offer 为「个」
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
    return [...data.bySnapshot]
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

  const barHeight = Math.max(240, versionData.length * 46 + 48)

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

  return (
    <div className="h-full overflow-y-auto px-0 py-0 no-scrollbar">
      <div className="space-y-6">
        {isEmpty ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface py-16 text-center">
            <Send className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-4 text-sm text-muted">还没有投递数据</p>
            <p className="mt-1 text-xs text-slate-400">先去「投递列表」添加投递记录，这里将自动展示转化分析</p>
          </div>
        ) : (
          <>
            {/* KPI 卡片行 */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: '投递数', value: funnel.submitted, icon: Send, hint: '已提交的投递' },
                { label: '面试邀约', value: funnel.interview, icon: Users, hint: `转化 ${pct(funnel.interview, funnel.submitted)}` },
                { label: 'Offer', value: funnel.offer, icon: Trophy, hint: `转化 ${pct(funnel.offer, funnel.interview)}` },
                { label: '整体回复率', value: pct(funnel.interview, funnel.submitted), icon: FileCheck, hint: '面试 / 投递', isText: true },
              ].map((k) => (
                <div key={k.label} className="rounded-2xl border border-line bg-surface p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">{k.label}</span>
                    <k.icon className="h-4 w-4 text-primary/70" />
                  </div>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-ink">{k.value}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{k.hint}</p>
                </div>
              ))}
            </div>

            {/* 上排：阶段分布环图 + 求职漏斗 */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* 阶段分布环图（饼图） */}
              <div className="rounded-2xl border border-line bg-surface p-5">
                <div className="flex items-center gap-2">
                  <PieIcon className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-ink">投递进展分布</h3>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">各投递最终停留的环节占比（已投递 → Offer）</p>

                <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
                  <div className="relative h-56 w-56 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={donut}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={62}
                          outerRadius={92}
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
                    {/* 环图中心文字（绝对定位，规避 Recharts Label 行为差异） */}
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xs text-muted">总投递</span>
                      <span className="text-2xl font-bold tabular-nums text-ink">{donutBase}</span>
                    </div>
                  </div>

                  {/* 图例 + 数据表兜底（无障碍要求：百分比 + 数据表） */}
                  <div className="w-full flex-1 space-y-2">
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

              {/* 求职漏斗（真正漏斗图） */}
              <div className="rounded-2xl border border-line bg-surface p-5">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-ink">求职漏斗</h3>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">投递 → 笔试 → 面试 → Offer 各阶段数量与转化率</p>

                <div className="mt-3 h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <FunnelChart>
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value: any, name: any, item: any) => [
                          `${value} ${item?.payload?.unit ?? '次'}`,
                          name,
                        ]}
                      />
                      <Funnel dataKey="value" data={funnelStages} isAnimationActive={!reduced}>
                        <LabelList position="right" fill="#64748B" stroke="none" dataKey="name" fontSize={12} />
                        <LabelList position="left" fill="#0F172A" stroke="none" dataKey="value" fontSize={12} fontWeight={600} />
                        {funnelStages.map((s, i) => (
                          <Cell key={i} fill={s.color} />
                        ))}
                      </Funnel>
                    </FunnelChart>
                  </ResponsiveContainer>
                </div>

                {/* 每阶显式转化 %（漏斗无障碍兜底） */}
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {funnelStages.map((s, i) => {
                    const prev = i === 0 ? funnel.submitted : funnelStages[i - 1].value
                    const rate = i === 0 ? 100 : prev > 0 ? Math.round((s.value / prev) * 100) : 0
                    return (
                      <div key={s.name} className="rounded-xl border border-line bg-canvas px-3 py-2">
                        <p className="truncate text-[11px] text-muted">{s.name}</p>
                        <p className="mt-0.5 text-base font-bold tabular-nums text-ink">{s.value}</p>
                        <p className="text-[10px] text-slate-400">{i === 0 ? '基准' : `转化 ${rate}%`}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* 简历版本对比（分组条形图，替代原列表） */}
            <div className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex items-center gap-2">
                <Layers3 className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-ink">简历版本对比</h3>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">
                按投递时绑定的简历版本分组，对比投递 / 面试 / Offer 人数（按回复率降序）
              </p>

              {versionData.length === 0 ? (
                <p className="mt-4 text-center text-xs text-slate-400">暂无版本对比数据</p>
              ) : (
                <div className="mt-4" style={{ height: barHeight }}>
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
                        width={120}
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
