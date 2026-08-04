// ============================================================
// 首页 AI 日报面板：Tab 切换 「AI 日报」 / 「GitHub 最新项目」
// 固定容器大小，容器内独立滚动
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Newspaper, ChevronDown, RefreshCw, Lightbulb, Github, Star } from 'lucide-react'
import { homeApi, type DailyReport, type GithubGroup } from '@/api/home'
import { dateLabel } from '@/utils/dateLabel'

function ratingStars(rating: number): string {
  return '★'.repeat(Math.max(1, Math.min(5, rating)))
}

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}

// 条目右侧日期标签：今天/昨天/08-01
function itemDateLabel(tsOrDate: number | string | undefined): string | null {
  return dateLabel(tsOrDate)
}

type TabKey = 'daily' | 'github'

const DailyReportBlock: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('daily')
  const [reports, setReports] = useState<DailyReport[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [githubGroups, setGithubGroups] = useState<GithubGroup[] | null>(null)
  const [githubError, setGithubError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await homeApi.getDailyReports(7)
      setReports(data.reports || [])
    } catch (err) {
      setReports([])
      setError(err instanceof Error ? err.message : '日报加载失败')
    }
  }, [])

  const loadGithub = useCallback(async () => {
    setGithubError(null)
    try {
      const data = await homeApi.listGithubProjects(7)
      setGithubGroups(data.groups || [])
    } catch (err) {
      setGithubGroups([])
      setGithubError(err instanceof Error ? err.message : '项目加载失败')
    }
  }, [])

  useEffect(() => { void load(); void loadGithub() }, [load, loadGithub])

  const toggle = (rank: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(rank)) next.delete(rank)
      else next.add(rank)
      return next
    })
  }

  // 日报总数（近 7 天资讯数）
  const totalReportItems = useMemo(() => {
    if (!reports) return 0
    return reports.reduce((sum, r) => sum + r.items.length, 0)
  }, [reports])

  // 日报资讯：摊平所有日期，按发布时间倒序，每条带所属日期
  const flatReportItems = useMemo(() => {
    if (!reports) return []
    return reports
      .flatMap((r) => r.items.map((it) => ({ ...it, date: r.reportDate })))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [reports])

  // GitHub 项目：摊平所有分组，按同步时间倒序，最多取最新 10 条
  const flatGithubItems = useMemo(() => {
    if (!githubGroups) return []
    return githubGroups.flatMap((g) => g.items).sort((a, b) => b.syncedAt - a.syncedAt).slice(0, 10)
  }, [githubGroups])

  return (
    <section className="card-flat flex flex-col overflow-hidden" aria-label="AI 日报面板">
      {/* 区块头：标题 + 数量标签 + Tab 切换（两卡头部同构对齐） */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {tab === 'daily' ? (
            <Newspaper className="h-5 w-5 shrink-0 text-primary" />
          ) : (
            <Github className="h-5 w-5 shrink-0 text-primary" />
          )}
          <h2 className="truncate text-base font-semibold text-ink">
            {tab === 'daily' ? 'AI 日报' : 'GitHub 最新项目'}
          </h2>
          {tab === 'daily' && totalReportItems > 0 && (
            <span className="shrink-0 rounded-md bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-primary">
              {totalReportItems} 条
            </span>
          )}
          {tab === 'github' && flatGithubItems.length > 0 && (
            <span className="shrink-0 rounded-md bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-primary">
              {flatGithubItems.length} 个
            </span>
          )}
        </div>

        {/* Tab 切换 */}
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
          <button
            type="button"
            onClick={() => setTab('daily')}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              tab === 'daily' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-ink'
            }`}
            aria-pressed={tab === 'daily'}
          >
            <Newspaper className="h-3.5 w-3.5" />
            日报
          </button>
          <button
            type="button"
            onClick={() => setTab('github')}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              tab === 'github' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-ink'
            }`}
            aria-pressed={tab === 'github'}
          >
            <Github className="h-3.5 w-3.5" />
            GitHub
          </button>
        </div>
      </div>

      {/* 内容区：固定高度容器内滚动 */}
      <div className="h-[560px] overflow-y-auto no-scrollbar">
        {tab === 'daily' ? (
          error ? (
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
          ) : reports === null ? (
            <div className="space-y-4 px-5 py-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 w-4/5 animate-pulse rounded bg-slate-100" />
                  <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
                </div>
              ))}
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
              <Newspaper className="h-8 w-8 text-slate-300" />
              <p className="text-sm text-muted">近 7 日暂无日报资讯</p>
            </div>
          ) : (
            <>
              {/* 单一列表：按发布时间倒序，每条右侧标注日期（今天→今天） */}
              <ol className="divide-y divide-line">
                {flatReportItems.map((item) => {
                  const open = expanded.has(item.rank)
                  const label = itemDateLabel(item.date || item.publishedAt)
                  return (
                    <li key={`${item.date}-${item.rank}`} className="px-5 py-3.5">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-soft text-xs font-semibold text-primary">
                          {item.rank}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            {item.url ? (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-w-0 text-sm font-medium leading-snug text-ink transition-colors hover:text-primary"
                                aria-label={`${item.title}（原文链接）`}
                              >
                                <span className="line-clamp-2">{item.title}</span>
                              </a>
                            ) : (
                              <h3 className="min-w-0 text-sm font-medium leading-snug text-ink">{item.title}</h3>
                            )}
                            {label && (
                              <span
                                className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                                  label === '今天' ? 'bg-primary text-white' : 'bg-slate-100 text-muted'
                                }`}
                              >
                                {label}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                            <span className="text-primary">{ratingStars(item.rating)}</span>
                            <span>{item.source}</span>
                          </p>
                        </div>
                      </div>

                      <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-muted">{item.summary}</p>

                      <button
                        type="button"
                        onClick={() => toggle(item.rank)}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-blue-700"
                        aria-expanded={open}
                      >
                        <Lightbulb className="h-3.5 w-3.5" />
                        对开发者的启示
                        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
                      </button>
                      {open && (
                        <p className="mt-1.5 rounded-lg bg-brand-soft/60 px-3 py-2 text-[13px] leading-relaxed text-slate-700">
                          {item.insight}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ol>
            </>
          )
        ) : githubError ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <p className="text-sm text-red-600">{githubError}</p>
            <button
              type="button"
              onClick={() => void loadGithub()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-slate-400 hover:text-ink"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              重试
            </button>
          </div>
        ) : githubGroups === null ? (
          <div className="space-y-2.5 px-5 py-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : githubGroups.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <Github className="h-8 w-8 text-slate-300" />
            <p className="text-sm text-muted">近 7 日暂无同步项目</p>
          </div>
        ) : (
          <>
            {/* 单一列表：按同步时间倒序，每条右侧标注日期（今天→今天） */}
            <ul className="divide-y divide-line">
              {flatGithubItems.map((repo) => {
                const label = itemDateLabel(repo.syncedAt)
                return (
                <li key={repo.id}>
                  <a
                    href={repo.htmlUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-brand-soft"
                    aria-label={`${repo.fullName}，${repo.stars} star`}
                    onClick={(e) => { if (!repo.htmlUrl) e.preventDefault() }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-0.5 text-xs font-medium tabular-nums text-slate-600">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          {formatStars(repo.stars)}
                        </span>
                        {repo.language && (
                          <span className="text-xs text-muted">{repo.language}</span>
                        )}
                        <span className="truncate text-sm font-medium text-ink transition-colors group-hover:text-primary">
                          {repo.fullName}
                        </span>
                      </span>
                      {repo.description && (
                        <span className="mt-0.5 block truncate text-xs text-muted">{repo.description}</span>
                      )}
                    </span>
                    {label && (
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                          label === '今天' ? 'bg-primary text-white' : 'bg-slate-100 text-muted'
                        }`}
                      >
                        {label}
                      </span>
                    )}
                  </a>
                </li>
                )
              })}
            </ul>
            <div className="border-t border-line px-5 py-2.5 text-center">
              <a
                href="https://github.com/search?q=ai&type=repositories&s=updated&o=desc"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-primary"
              >
                <Github className="h-3.5 w-3.5" />
                在 GitHub 上查看更多
              </a>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

export default DailyReportBlock
