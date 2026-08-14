// ============================================================
// TrendPanels — 统计分析扩展面板（漏斗趋势 / 面试轮次 / 阶段停留）
// 数据来源：GET /api/applications/stats/trend
//          GET /api/applications/stats/interview-rounds
// 设计依据：openspec/changes/enhance-application-analytics/ui-spec.md
// 三个面板各自独立请求，任一失败不阻塞其他内容
// ============================================================

import React, { useEffect, useMemo, useState } from 'react'
import { TrendingUp, Users, Timer } from 'lucide-react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  applicationsApi,
  type TrendBucket,
  type TrendStatsResponse,
  type InterviewRoundsResponse,
} from '@/api/applications'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { CHART_COLOR as COLOR, chartTooltipStyle as tooltipStyle } from '@/components/applications/chartTheme'

type RangeKey = '3m' | '6m' | '1y'

const RANGE_OPTIONS: Array<{ value: RangeKey; label: string; months: number }> = [
  { value: '3m', label: '近 3 个月', months: 3 },
  { value: '6m', label: '近 6 个月', months: 6 },
  { value: '1y', label: '近 1 年', months: 12 },
]

// 后端返回 "submitted->interview" 形式，映射为中文；未覆盖的转换原样展示
const TRANSITION_LABELS: Record<string, string> = {
  'submitted->written_test': '投递 → 笔试',
  'submitted->interview': '投递 → 面试',
  'written_test->interview': '笔试 → 面试',
  'interview->offer': '面试 → Offer',
}

const TRANSITION_COLORS: Record<string, string> = {
  'submitted->written_test': COLOR.writtenTest,
  'submitted->interview': COLOR.interview,
  'written_test->interview': COLOR.interview,
  'interview->offer': COLOR.offer,
}

/** 骨架占位：避免图表加载时的布局跳动（CLS） */
const ChartSkeleton: React.FC<{ height?: number }> = ({ height = 220 }) => (
  <div className="space-y-2" style={{ height }}>
    <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
    <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
    <div className="flex-1 animate-pulse rounded bg-slate-50" style={{ height: height - 32 }} />
  </div>
)

const ErrorState: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted">
    <span>加载失败</span>
    <button
      type="button"
      onClick={onRetry}
      className="rounded-lg border border-line px-3 py-1 text-xs text-primary transition hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary"
    >
      重试
    </button>
  </div>
)

const CardShell: React.FC<{
  icon: React.ComponentType<{ className?: string }>
  title: string
  extra?: React.ReactNode
  children: React.ReactNode
}> = ({ icon: Icon, title, extra, children }) => (
  <div className="rounded-2xl border border-line bg-surface p-5">
    <div className="flex flex-wrap items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {extra ? <div className="ml-auto flex items-center gap-2">{extra}</div> : null}
    </div>
    <div className="mt-4">{children}</div>
  </div>
)

const TrendPanels: React.FC = () => {
  const reduced = usePrefersReducedMotion()

  const [bucket, setBucket] = useState<TrendBucket>('week')
  const [range, setRange] = useState<RangeKey>('3m')
  const [trend, setTrend] = useState<TrendStatsResponse | null>(null)
  const [trendLoading, setTrendLoading] = useState(true)
  const [trendError, setTrendError] = useState(false)

  const [rounds, setRounds] = useState<InterviewRoundsResponse | null>(null)
  const [roundsLoading, setRoundsLoading] = useState(true)
  const [roundsError, setRoundsError] = useState(false)

  const loadTrend = async () => {
    setTrendLoading(true)
    setTrendError(false)
    try {
      const months = RANGE_OPTIONS.find((r) => r.value === range)?.months ?? 3
      const to = Date.now()
      const fromDate = new Date(to)
      fromDate.setMonth(fromDate.getMonth() - months)
      const res = await applicationsApi.getTrend({ bucket, from: fromDate.getTime(), to })
      setTrend(res)
    } catch {
      setTrendError(true)
    } finally {
      setTrendLoading(false)
    }
  }

  const loadRounds = async () => {
    setRoundsLoading(true)
    setRoundsError(false)
    try {
      const res = await applicationsApi.getInterviewRounds()
      setRounds(res)
    } catch {
      setRoundsError(true)
    } finally {
      setRoundsLoading(false)
    }
  }

  useEffect(() => {
    void loadTrend()
  }, [bucket, range])

  useEffect(() => {
    void loadRounds()
  }, [])

  // 趋势图数据：格式化桶起始时间为轴标签
  const trendData = useMemo(() => {
    if (!trend) return []
    // 比率的分子（面试/Offer 事件）与分母（当周新增投递）分桶依据不同，
    // 跨桶时可能算出 >100%，这里 clamp 到 0-100 防止右轴被自动拉伸失真
    const clampRate = (v: number) => Math.min(100, Math.max(0, Math.round((Number.isFinite(v) ? v : 0) * 100)))
    return trend.points.map((p) => {
      const d = new Date(p.bucketStart)
      const label =
        trend.bucket === 'month'
          ? `${d.getFullYear()}/${d.getMonth() + 1}`
          : `${d.getMonth() + 1}/${d.getDate()}`
      return {
        label,
        submitted: p.submitted,
        interview: p.interview,
        offer: p.offer,
        replyRate: clampRate(p.replyRate),
        offerRate: clampRate(p.offerRate),
      }
    })
  }, [trend])

  // 投递总量太少时曲线没有解读价值，改为提示继续积累
  const trendTooSparse = useMemo(
    () => trendData.length > 0 && trendData.reduce((s, d) => s + d.submitted, 0) < 4,
    [trendData],
  )

  const roundsData = useMemo(() => {
    if (!rounds) return []
    return rounds.distribution.map((b) => ({
      label: b.round >= 4 ? '4 轮+' : `${b.round} 轮`,
      count: b.count,
    }))
  }, [rounds])

  // 只展示核心阶段转换，其余噪音转换（如回退、终止）不进入展示
  const stageData = useMemo(() => {
    if (!rounds) return []
    return rounds.stageDurations.filter((s) => TRANSITION_LABELS[s.transition])
  }, [rounds])

  const maxStageDays = useMemo(
    () => Math.max(1, ...stageData.map((s) => s.medianDays)),
    [stageData],
  )

  return (
    <>
      {/* ③ 漏斗趋势 */}
      <CardShell
        icon={TrendingUp}
        title="漏斗趋势"
        extra={
          <>
            <div className="flex overflow-hidden rounded-lg border border-line" role="tablist" aria-label="分桶粒度">
              {(['week', 'month'] as TrendBucket[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  role="tab"
                  aria-selected={bucket === b}
                  onClick={() => setBucket(b)}
                  className={`px-2.5 py-1 text-xs transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary ${
                    bucket === b ? 'bg-primary text-white' : 'bg-surface text-muted hover:text-ink'
                  }`}
                >
                  {b === 'week' ? '周' : '月'}
                </button>
              ))}
            </div>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as RangeKey)}
              aria-label="时间范围"
              className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {RANGE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </>
        }
      >
        {trendLoading && !trend ? (
          <ChartSkeleton height={260} />
        ) : trendError ? (
          <ErrorState onRetry={() => void loadTrend()} />
        ) : trendTooSparse ? (
          <p className="py-12 text-center text-xs text-slate-400">
            数据积累中，继续投递将解锁趋势分析
          </p>
        ) : (
          <div
            className="h-[260px]"
            role="img"
            aria-label={`投递趋势时序图，${RANGE_OPTIONS.find((r) => r.value === range)?.label}按${bucket === 'week' ? '周' : '月'}分桶`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#EEF2F6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis
                  yAxisId="count"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId="rate"
                  orientation="right"
                  tick={{ fontSize: 11, fill: '#94A3B8' }}
                  axisLine={false}
                  tickLine={false}
                  unit="%"
                  domain={[0, 100]}
                  allowDataOverflow
                />

                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: any, name: any) => {
                    const rateKeys = ['回复率', 'Offer率']
                    return [rateKeys.includes(name) ? `${value}%` : value, name]
                  }}
                />
                <Legend iconType="line" wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
                {/* 实线=绝对数量，虚线=比率：线型区分保证色盲可读（不仅靠颜色） */}
                <Line
                  yAxisId="count"
                  type="monotone"
                  dataKey="submitted"
                  name="投递"
                  stroke={COLOR.submitted}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={!reduced}
                />
                <Line
                  yAxisId="count"
                  type="monotone"
                  dataKey="interview"
                  name="面试"
                  stroke={COLOR.interview}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={!reduced}
                />
                <Line
                  yAxisId="count"
                  type="monotone"
                  dataKey="offer"
                  name="Offer"
                  stroke={COLOR.offer}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  isAnimationActive={!reduced}
                />
                <Line
                  yAxisId="rate"
                  type="monotone"
                  dataKey="replyRate"
                  name="回复率"
                  stroke={COLOR.writtenTest}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  isAnimationActive={!reduced}
                />
                <Line
                  yAxisId="rate"
                  type="monotone"
                  dataKey="offerRate"
                  name="Offer率"
                  stroke="#059669"
                  strokeWidth={1.5}
                  strokeDasharray="2 3"
                  dot={false}
                  isAnimationActive={!reduced}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardShell>

      {/* ④面试轮次 + ⑤阶段停留 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CardShell icon={Users} title="面试轮次分布">
          {roundsLoading && !rounds ? (
            <ChartSkeleton height={200} />
          ) : roundsError ? (
            <ErrorState onRetry={() => void loadRounds()} />
          ) : roundsData.length === 0 ? (
            <p className="py-12 text-center text-xs text-slate-400">暂无面试记录</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: '平均轮次', value: rounds!.avg.toFixed(1) },
                  { label: '中位数', value: rounds!.median.toFixed(1) },
                  { label: '最长', value: String(rounds!.max) },
                ].map((k) => (
                  <div key={k.label} className="rounded-xl border border-line bg-canvas p-3">
                    <p className="text-xs text-muted">{k.label}</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-ink">
                      {k.value}
                      <span className="ml-1 text-xs font-normal text-slate-400">轮</span>
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 h-[180px]" role="img" aria-label="面试轮次分布直方图">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={roundsData} margin={{ top: 12, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke="#EEF2F6" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748B' }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: 'rgba(245,158,11,0.08)' }}
                      formatter={(value: any) => [`${value} 条投递`, '数量']}
                    />
                    <Bar
                      dataKey="count"
                      name="投递数"
                      fill={COLOR.interview}
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={!reduced}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </CardShell>

        <CardShell icon={Timer} title="阶段停留时长" extra={<span className="text-xs text-slate-400">中位数</span>}>
          {roundsLoading && !rounds ? (
            <ChartSkeleton height={200} />
          ) : roundsError ? (
            <ErrorState onRetry={() => void loadRounds()} />
          ) : stageData.length === 0 ? (
            <p className="py-12 text-center text-xs text-slate-400">暂无状态流转记录</p>
          ) : (
            <div className="space-y-4">
              {stageData.map((s) => {
                const color = TRANSITION_COLORS[s.transition] ?? COLOR.submitted
                const pct = Math.max(4, (s.medianDays / maxStageDays) * 100)
                return (
                  <div key={s.transition}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink">{TRANSITION_LABELS[s.transition]}</span>
                      <span className="tabular-nums text-muted">
                        中位 {s.medianDays.toFixed(1)} 天 · 最长 {s.maxDays.toFixed(1)} 天
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-canvas">
                      <div
                        className="h-full rounded-full transition-[width] duration-300"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400">{s.samples} 个样本</p>
                  </div>
                )
              })}
            </div>
          )}
        </CardShell>
      </div>
    </>
  )
}

export default TrendPanels
