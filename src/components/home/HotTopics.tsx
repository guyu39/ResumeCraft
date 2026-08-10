// ============================================================
// 首页 AI HOT 热点榜：热度榜前 10 + 事件时间线展开
// 数据源 /api/home/aihot/hot-topics + /api/home/aihot/stories/{publicId}
// ============================================================

import React, { useCallback, useEffect, useState } from 'react'
import { RefreshCw, TrendingUp, ChevronDown, Link2, Newspaper } from 'lucide-react'
import { homeApi, type AihotHotTopic, type AihotStory } from '@/api/home'

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

// 从 story 链接提取 publicId（末尾 uuid）
function extractPublicId(linksStory?: string): string | null {
  if (!linksStory) return null
  const seg = linksStory.replace(/\/+$/, '').split('/').pop()
  return seg && /^[0-9a-fA-F-]{36}$/.test(seg) ? seg : null
}

const HotTopics: React.FC = () => {
  const [topics, setTopics] = useState<AihotHotTopic[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [stories, setStories] = useState<Record<string, AihotStory>>({})
  const [loadingStory, setLoadingStory] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await homeApi.listAihotHotTopics()
      setTopics(data.items || [])
    } catch (err) {
      setTopics([])
      setError(err instanceof Error ? err.message : '热点榜加载失败')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const toggle = async (topic: AihotHotTopic) => {
    const pid = extractPublicId(topic.linksStory)
    if (!pid) return
    if (expandedId === pid) {
      setExpandedId(null)
      return
    }
    setExpandedId(pid)
    if (!stories[pid]) {
      setLoadingStory(pid)
      try {
        const data = await homeApi.getAihotStory(pid)
        setStories((prev) => ({ ...prev, [pid]: data.story }))
      } catch {
        // 静默失败：保留展开态但无详情
      } finally {
        setLoadingStory(null)
      }
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        {error ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-slate-400 hover:text-ink"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              重试
            </button>
          </div>
        ) : topics === null ? (
          <div className="space-y-3 px-5 py-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-4 w-4 animate-pulse rounded bg-slate-100" />
                <div className="h-4 flex-1 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-16 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : topics.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <TrendingUp className="h-8 w-8 text-slate-300" />
            <p className="text-sm text-muted">热点榜暂不可用</p>
          </div>
        ) : (
          <ol className="divide-y divide-line">
            {topics.map((t) => {
              const pid = extractPublicId(t.linksStory)
              const open = pid !== null && expandedId === pid
              const story = pid ? stories[pid] : undefined
              const width = Math.max(12, Math.min(100, Math.round(t.sourceCount * 9 + 10)))
              const rankClass =
                t.rank === 1 ? 'text-red-500' : t.rank === 2 ? 'text-amber-500' : t.rank === 3 ? 'text-blue-500' : 'text-slate-300'
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => void toggle(t)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-brand-soft/50"
                    disabled={!pid}
                  >
                    <span className={`w-5 shrink-0 text-center font-mono text-base font-bold ${rankClass}`}>
                      {t.rank}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-sm font-medium text-ink">{t.title}</span>
                      <span className="mt-0.5 block text-[11px] text-muted">
                        {t.sourceCount} 个信源{t.latestAt ? ` · 最新 ${formatTime(t.latestAt)}` : ''}
                      </span>
                    </span>
                    <span className="hidden w-20 shrink-0 sm:block">
                      <span className="block h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <span
                          className="block h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500"
                          style={{ width: `${width}%` }}
                        />
                      </span>
                    </span>
                    {pid && (
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
                      />
                    )}
                  </button>

                  {/* 展开：事件时间线 + AI 综述 */}
                  {open && (
                    <div className="border-t border-dashed border-line bg-brand-soft/40 px-5 py-3">
                      {loadingStory === pid ? (
                        <div className="space-y-2 py-2">
                          <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
                          <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
                          <div className="h-3 w-5/6 animate-pulse rounded bg-slate-200" />
                        </div>
                      ) : story ? (
                        <div className="space-y-3">
                          {story.digest && (
                            <div>
                              <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                                <TrendingUp className="h-3.5 w-3.5" />
                                AI 综述
                              </p>
                              <p className="mt-1 line-clamp-4 text-[13px] leading-relaxed text-slate-700">
                                {story.digest}
                              </p>
                            </div>
                          )}
                          {story.reports && story.reports.length > 0 && (
                            <div>
                              <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                                <Newspaper className="h-3.5 w-3.5" />
                                报道时间线（{story.reports.length}）
                              </p>
                              <ul className="mt-1.5 space-y-2">
                                {story.reports.slice(0, 6).map((r) => (
                                  <li key={r.id} className="flex items-start gap-2">
                                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                                    <div className="min-w-0">
                                      <a
                                        href={r.linksAihot || r.linksOriginal || '#'}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[13px] font-medium leading-snug text-ink transition-colors hover:text-primary"
                                      >
                                        {r.title}
                                      </a>
                                      <span className="mt-0.5 block text-[11px] text-muted">
                                        {r.sourceName}
                                        {r.publishedAt ? ` · ${formatTime(r.publishedAt)}` : ''}
                                      </span>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <div className="flex items-center gap-3 pt-0.5 text-[11px] text-muted">
                            <a
                              href={story.linksAihot || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                            >
                              <Link2 className="h-3 w-3" />
                              查看完整事件
                            </a>
                          </div>
                        </div>
                      ) : (
                        <p className="py-1 text-xs text-muted">事件详情暂不可用</p>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}

export default HotTopics
