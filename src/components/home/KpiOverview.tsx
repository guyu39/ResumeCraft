// ============================================================
// 首页求职概览 KPI 条：已投递/笔试/面试/Offer 四项，整条可点击跳转数据分析
// 数据来源：GET /api/applications/stats（复用 FunnelAnalytics 已有接口与配色语义）
// ============================================================

import React, { useCallback, useEffect, useState } from 'react'
import { Send, FileCheck, Users, Trophy } from 'lucide-react'
import { applicationsApi, type FunnelStats } from '@/api/applications'

const KPI_CONFIG: Array<{
  key: keyof Omit<FunnelStats, 'total'>
  label: string
  icon: React.ComponentType<{ className?: string }>
  bg: string
  fg: string
}> = [
  { key: 'submitted', label: '已投递', icon: Send, bg: 'bg-blue-50', fg: 'text-blue-600' },
  { key: 'writtenTest', label: '笔试', icon: FileCheck, bg: 'bg-indigo-50', fg: 'text-indigo-600' },
  { key: 'interview', label: '面试', icon: Users, bg: 'bg-amber-50', fg: 'text-amber-600' },
  { key: 'offer', label: 'Offer', icon: Trophy, bg: 'bg-emerald-50', fg: 'text-emerald-600' },
]

const KpiOverview: React.FC = () => {
  const [stats, setStats] = useState<FunnelStats | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await applicationsApi.getStats()
      setStats(res.funnel)
    } catch {
      // 求职概览非首页核心必需数据，加载失败时静默隐藏，不阻塞其他区块渲染
      setStats(null)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const goAnalytics = () => { window.location.href = '/applications?view=analytics' }

  if (stats === null) {
    return (
      <div className="card-flat grid grid-cols-2 divide-x divide-line sm:grid-cols-4" aria-hidden="true">
        {KPI_CONFIG.map((cfg) => (
          <div key={cfg.key} className="flex items-center gap-3 px-5 py-4">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-slate-100" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-5 w-10 animate-pulse rounded bg-slate-100" />
              <div className="h-3 w-12 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={goAnalytics}
      className="card-flat grid w-full grid-cols-2 divide-x divide-line text-left transition hover:border-primary/40 sm:grid-cols-4"
      aria-label="查看求职数据分析"
    >
      {KPI_CONFIG.map((cfg) => {
        const Icon = cfg.icon
        return (
          <div key={cfg.key} className="flex items-center gap-3 px-5 py-4">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${cfg.bg} ${cfg.fg}`}>
              <Icon className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-bold tabular-nums text-ink">{stats[cfg.key]}</p>
              <p className="text-xs text-muted">{cfg.label}</p>
            </div>
          </div>
        )
      })}
    </button>
  )
}

export default KpiOverview
