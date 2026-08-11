// ============================================================
// 首页近期笔面试待办：正文常驻区块（原右下角悬浮球内容迁移至此）
// 数据来源：GET /api/home/todos
// ============================================================

import React, { useCallback, useEffect, useState } from 'react'
import { ClipboardList, ChevronRight, RefreshCw, CalendarClock } from 'lucide-react'
import { homeApi, type HomeTodoItem } from '@/api/home'

// 首页仅展示最近 5 条，更多请跳转投递管理
const MAX_ITEMS = 5

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

// 待办场景下相对日期比绝对日期更好读；超出「后天」再退回 M/D
function formatDateLabel(ts: number): string {
  const target = new Date(ts)
  const diffDays = Math.round((startOfDay(target) - startOfDay(new Date())) / 86_400_000)
  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '明天'
  if (diffDays === 2) return '后天'
  if (diffDays === -1) return '昨天'
  return `${target.getMonth() + 1}/${target.getDate()}`
}

const TodoBlock: React.FC = () => {
  const [todos, setTodos] = useState<HomeTodoItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await homeApi.listTodos()
      setTodos(data.items || [])
    } catch (err) {
      setTodos([])
      setError(err instanceof Error ? err.message : '待办加载失败')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const goApplications = (applicationId?: string) => {
    const target = applicationId ? `/applications?id=${encodeURIComponent(applicationId)}` : '/applications'
    window.location.href = target
  }

  const total = todos?.length ?? 0
  const visible = todos?.slice(0, MAX_ITEMS) ?? []

  return (
    <section className="card-flat flex flex-col overflow-hidden" aria-label="近期笔面试待办">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <ClipboardList className="h-5 w-5 shrink-0 text-primary" />
          <h2 className="truncate text-base font-semibold text-ink">近期笔面试待办</h2>
          {total > 0 && (
            <span className="shrink-0 rounded-md bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-primary">
              {total} 项
            </span>
          )}
        </div>
        <a href="/applications" className="shrink-0 text-xs font-medium text-muted transition-colors hover:text-primary">
          查看全部
        </a>
      </div>

      <div className="h-[280px] overflow-y-auto no-scrollbar">
        {error ? (
          <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
            <p className="text-xs text-red-600">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs font-medium text-muted transition hover:border-slate-400 hover:text-ink"
            >
              <RefreshCw className="h-3 w-3" />
              重试
            </button>
          </div>
        ) : todos === null ? (
          <div className="space-y-2.5 px-5 py-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-8 w-12 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
            <CalendarClock className="h-7 w-7 text-slate-300" />
            <p className="text-xs text-muted">暂无待办安排</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => goApplications(item.applicationId)}
                  className="group flex w-full items-center gap-2.5 px-5 py-2.5 text-left transition-colors hover:bg-brand-soft"
                >
                  <span className="w-12 shrink-0 leading-tight">
                    <span className="block truncate text-[11px] text-muted">{formatDateLabel(item.scheduledAt)}</span>
                    <span className="block text-sm font-semibold tabular-nums text-ink">{formatTime(item.scheduledAt)}</span>
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                      item.type === 'interview' ? 'bg-brand-soft text-primary' : 'bg-amber-50 text-amber-600'
                    }`}
                  >
                    {item.type === 'interview' ? '面试' : '笔试'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {item.companyName || '未命名公司'}
                    {item.round ? ` · ${item.round}` : ''}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default TodoBlock
