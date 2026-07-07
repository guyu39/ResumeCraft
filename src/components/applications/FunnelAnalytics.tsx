// ============================================================
// FunnelAnalytics — 求职漏斗 + 简历版本 A/B 对比
// 数据来源：GET /api/applications/stats
// ============================================================

import React, { useEffect, useState } from 'react'
import { Send, FileCheck, Users, Trophy, RefreshCw } from 'lucide-react'
import { applicationsApi, type FunnelStatsResponse } from '@/api/applications'
import { toast } from '@/components/common/Toast'

// 漏斗阶段定义（顺序即漏斗从上到下）
const STAGES = [
  { key: 'submitted', label: '已投递', icon: Send },
  { key: 'writtenTest', label: '笔试', icon: FileCheck },
  { key: 'interview', label: '面试', icon: Users },
  { key: 'offer', label: 'Offer', icon: Trophy },
] as const

const pct = (n: number, d: number): string => (d > 0 ? Math.round((n / d) * 100) + '%' : '—')

const FunnelAnalytics: React.FC = () => {
  const [data, setData] = useState<FunnelStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)

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

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> 加载中...
      </div>
    )
  }

  if (!data) return null

  const { funnel, bySnapshot } = data
  const isEmpty = funnel.total === 0

  // A/B 对比：回复率条形图最大宽度基准
  const maxReplyRate = bySnapshot.reduce((m, s) => Math.max(m, s.replyRate), 0) || 1

  return (
    <div className="h-full overflow-y-auto px-6 py-6 no-scrollbar">
      <div className="mx-auto max-w-[1680px] space-y-6">
        {/* 顶部刷新 */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">基于全部投递记录统计，实时反映数据变化</p>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-muted transition hover:bg-slate-50 hover:text-ink"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> 刷新
          </button>
        </div>

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
                { label: '整体回复率', value: pct(funnel.interview, funnel.submitted), icon: FileCheck, hint: '面试/投递', isText: true },
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

            {/* 漏斗图 */}
            <div className="rounded-2xl border border-line bg-surface p-5">
              <h3 className="text-sm font-semibold text-ink">求职漏斗</h3>
              <p className="mt-0.5 text-xs text-slate-400">投递 → 笔试 → 面试 → Offer 各阶段人数与转化率</p>
              <div className="mt-4 space-y-2">
                {STAGES.map((stage, i) => {
                  const value = funnel[stage.key]
                  const prevValue = i === 0 ? funnel.submitted : funnel[STAGES[i - 1].key]
                  const widthPct = funnel.submitted > 0 ? Math.max(8, (value / funnel.submitted) * 100) : 0
                  const stepRate = i === 0 ? null : pct(value, prevValue)
                  const Icon = stage.icon
                  return (
                    <div key={stage.key} className="flex items-center gap-3">
                      <div className="flex w-20 shrink-0 items-center gap-1.5 text-xs text-muted">
                        <Icon className="h-3.5 w-3.5" /> {stage.label}
                      </div>
                      <div className="flex flex-1 items-center gap-2">
                        <div className="relative h-8 flex-1 overflow-hidden rounded-lg bg-brand-soft">
                          <div
                            className="flex h-full items-center justify-end rounded-lg bg-primary/80 px-2 text-[11px] font-medium text-white transition-all"
                            style={{ width: `${widthPct}%` }}
                          >
                            {value > 0 && <span className="tabular-nums">{value}</span>}
                          </div>
                        </div>
                        <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-muted">
                          {pct(value, funnel.submitted)}
                        </span>
                      </div>
                      {i > 0 && (
                        <span className="w-14 shrink-0 text-right text-[11px] text-slate-400">
                          环比 {stepRate}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 简历版本 A/B 对比 */}
            <div className="rounded-2xl border border-line bg-surface p-5">
              <h3 className="text-sm font-semibold text-ink">简历版本对比</h3>
              <p className="mt-0.5 text-xs text-slate-400">按投递时绑定的简历版本分组，对比回复率（面试/投递）</p>

              {bySnapshot.length === 0 ? (
                <p className="mt-4 text-center text-xs text-slate-400">暂无版本对比数据</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {bySnapshot.map((s) => {
                    const label = s.snapshotLabel || `${s.snapshotVersionId.slice(0, 8)}…`
                    const barWidth = Math.round((s.replyRate / maxReplyRate) * 100)
                    return (
                      <div key={s.snapshotVersionId + s.resumeId} className="rounded-xl border border-line bg-canvas px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-ink">
                              {label}
                              <span className="ml-2 text-xs font-normal text-slate-400">{s.resumeTitle || '未命名简历'}</span>
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-400">
                              投递 {s.submitted} · 面试 {s.interview} · Offer {s.offer}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-bold tabular-nums text-primary">
                            {Math.round(s.replyRate * 100)}%
                          </span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
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
