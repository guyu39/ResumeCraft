// ============================================================
// 首页 AI HOT 快讯流：分类过滤 + 关键词搜索 + 热度分
// 数据源 /api/home/aihot/items（后端缓存自 aihot.virxact.com v1）
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, RefreshCw, Flame } from 'lucide-react'
import { homeApi, type AihotItem } from '@/api/home'

const CATEGORIES = [
  { key: '', label: '全部' },
  { key: 'ai-models', label: '模型' },
  { key: 'ai-products', label: '产品' },
  { key: 'industry', label: '行业' },
  { key: 'paper', label: '论文' },
  { key: 'tip', label: '技巧' },
]

// RFC3339 → MM-DD HH:mm
function formatTime(ts?: string): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

const CATEGORY_LABEL: Record<string, string> = {
  'ai-models': '模型',
  'ai-products': '产品',
  industry: '行业',
  paper: '论文',
  tip: '技巧',
}

const AiNewsFeed: React.FC = () => {
  const [window, setWindow] = useState<'24h' | '7d'>('24h')
  const [category, setCategory] = useState('')
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')
  const [items, setItems] = useState<AihotItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (win: string, cat: string, query: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await homeApi.listAihotItems({
        window: win,
        category: cat || undefined,
        q: query || undefined,
        limit: 50,
      })
      setItems(data.items || [])
    } catch (err) {
      setItems([])
      setError(err instanceof Error ? err.message : '快讯加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(window, category, q)
  }, [load, window, category, q])

  const hotCount = useMemo(() => (items || []).filter((it) => it.score >= 60).length, [items])

  return (
    <div className="flex h-full flex-col">
      {/* 搜索栏 */}
      <div className="px-5 pt-3">
        <form
          className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2"
          onSubmit={(e) => {
            e.preventDefault()
            setQ(input.trim())
          }}
        >
          <Search className="h-4 w-4 shrink-0 text-muted" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="搜索最近 7 天的模型 / 公司 / 产品…"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white transition hover:opacity-90"
          >
            搜索
          </button>
        </form>
      </div>

      {/* 分类 chips + 时间窗 */}
      <div className="flex flex-wrap items-center gap-1.5 px-5 py-3">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(c.key)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              category === c.key
                ? 'border-transparent bg-primary text-white'
                : 'border-line bg-white text-muted hover:text-ink'
            }`}
          >
            {c.label}
          </button>
        ))}
        <div className="ml-auto flex shrink-0 items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
          {(['24h', '7d'] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindow(w)}
              className={`rounded-md px-2 py-0.5 text-xs font-medium transition ${
                window === w ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-ink'
              }`}
            >
              {w === '24h' ? '24 小时' : '7 天'}
            </button>
          ))}
        </div>
      </div>

      {/* 列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        {error ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={() => void load(window, category, q)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-slate-400 hover:text-ink"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              重试
            </button>
          </div>
        ) : loading && items === null ? (
          <div className="space-y-3 px-5 py-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-3.5 w-3/4 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : items && items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <Flame className="h-8 w-8 text-slate-300" />
            <p className="text-sm text-muted">暂无匹配的快讯</p>
          </div>
        ) : items ? (
          <ul className="divide-y divide-line">
            {items.map((it) => (
              <li key={it.id} className="px-5 py-3">
                <div className="flex items-start gap-2.5">
                  <div className="min-w-0 flex-1">
                    <a
                      href={it.linksAihot || it.linksOriginal || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="line-clamp-2 text-sm font-medium leading-snug text-ink transition-colors hover:text-primary"
                    >
                      {it.title}
                    </a>
                    {it.summary && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{it.summary}</p>
                    )}
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted">
                      {it.category && (
                        <span className="rounded bg-brand-soft px-1.5 py-0.5 font-medium text-primary">
                          {CATEGORY_LABEL[it.category] || it.category}
                        </span>
                      )}
                      <span className="max-w-[45%] truncate">{it.sourceName}</span>
                      <span>{formatTime(it.publishedAt)}</span>
                    </p>
                  </div>
                  {it.score > 0 && (
                    <span
                      className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                        it.score >= 60
                          ? 'bg-brand-soft text-primary'
                          : 'bg-slate-100 text-muted'
                      }`}
                      title="热度分"
                    >
                      {it.score}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* 统计角标（悬浮于列表右下） */}
      {items && items.length > 0 && (
        <div className="pointer-events-none absolute bottom-3 right-5 flex items-center gap-1 rounded-full bg-slate-900/70 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
          <Flame className="h-3 w-3 text-amber-400" />
          {hotCount} 条高热度
        </div>
      )}
    </div>
  )
}

export default AiNewsFeed
