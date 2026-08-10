// ============================================================
// 首页资讯面板：五 Tab 「AI 日报」/「快讯」/「热点」/「GitHub」/「简历项目」
// 日报、快讯、热点数据来自 AI HOT；GitHub 与简历项目保持原逻辑
// 固定容器大小，容器内独立滚动
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Newspaper, ChevronDown, RefreshCw, Github, Star, Rocket, Clock, Flame, TrendingUp,
} from 'lucide-react'
import { homeApi, type GithubGroup, type ProjectGroup } from '@/api/home'
import { dateLabel } from '@/utils/dateLabel'
import AihotDaily from '@/components/home/AihotDaily'
import AiNewsFeed from '@/components/home/AiNewsFeed'
import HotTopics from '@/components/home/HotTopics'

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}

// 条目右侧日期标签：今天/昨天/08-01
function itemDateLabel(tsOrDate: number | string | undefined): string | null {
  return dateLabel(tsOrDate)
}

// 项目难度星级（1-5）
function difficultyStars(n: number): string {
  return '★'.repeat(Math.max(1, Math.min(5, n)))
}

// 项目更新时间：今天 →「今天 14:30」；昨天 →「昨天」；更早 →「MM-DD」
function formatUpdateTime(ts: number): string {
  const label = dateLabel(ts)
  if (label === '今天') {
    const d = new Date(ts)
    return `今天 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  if (label === '昨天') return '昨天'
  if (label) return label
  return new Date(ts).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

// StarParts 将单字段 STAR 文本按 S/T、A、R 拆分为三部分（兼容缺段）
interface StarParts {
  st: string
  a: string
  r: string
}

function parseStar(summary: string): StarParts {
  const parts: StarParts = { st: '', a: '', r: '' }
  if (!summary) return parts
  let rest = summary
  const stMatch = rest.match(/^S\/T：([\s\S]*?)(?=A：|R：|$)/)
  if (stMatch) {
    parts.st = stMatch[1].trim()
    rest = rest.slice(stMatch[0].length + stMatch.index!)
  }
  const aMatch = rest.match(/^A：([\s\S]*?)(?=R：|$)/)
  if (aMatch) {
    parts.a = aMatch[1].trim()
    rest = rest.slice(aMatch[0].length + aMatch.index!)
  }
  const rMatch = rest.match(/^R：([\s\S]*)$/)
  if (rMatch) parts.r = rMatch[1].trim()
  if (!parts.st && !parts.a && !parts.r) parts.a = summary.trim()
  return parts
}

type TabKey = 'daily' | 'news' | 'hot' | 'github' | 'projects'

const TABS: { key: TabKey; label: string; icon: React.ReactNode; aihot?: boolean }[] = [
  { key: 'daily', label: '日报', icon: <Newspaper className="h-3.5 w-3.5" />, aihot: true },
  { key: 'news', label: '快讯', icon: <Flame className="h-3.5 w-3.5" />, aihot: true },
  { key: 'hot', label: '热点', icon: <TrendingUp className="h-3.5 w-3.5" />, aihot: true },
  { key: 'github', label: 'GitHub', icon: <Github className="h-3.5 w-3.5" /> },
  { key: 'projects', label: '简历项目', icon: <Rocket className="h-3.5 w-3.5" /> },
]

const TAB_TITLES: Record<TabKey, string> = {
  daily: 'AI 日报',
  news: 'AI 快讯',
  hot: 'AI 热点',
  github: 'GitHub 最新项目',
  projects: '简历项目推荐',
}

const DailyReportBlock: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('daily')
  const [githubGroups, setGithubGroups] = useState<GithubGroup[] | null>(null)
  const [githubError, setGithubError] = useState<string | null>(null)
  const [projectGroups, setProjectGroups] = useState<ProjectGroup[] | null>(null)
  const [projectError, setProjectError] = useState<string | null>(null)
  const [projectExpanded, setProjectExpanded] = useState<Set<number>>(new Set())

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

  const loadProjects = useCallback(async () => {
    setProjectError(null)
    try {
      const data = await homeApi.listProjects(7)
      setProjectGroups(data.groups || [])
    } catch (err) {
      setProjectGroups([])
      setProjectError(err instanceof Error ? err.message : '项目推荐加载失败')
    }
  }, [])

  useEffect(() => { void loadGithub(); void loadProjects() }, [loadGithub, loadProjects])

  const toggleProject = (id: number) => {
    setProjectExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // GitHub 项目：摊平所有分组，按同步时间倒序，最多取最新 10 条
  const flatGithubItems = useMemo(() => {
    if (!githubGroups) return []
    return githubGroups.flatMap((g) => g.items).sort((a, b) => b.syncedAt - a.syncedAt).slice(0, 10)
  }, [githubGroups])

  // 简历项目：近 7 天项目总数
  const totalProjectItems = useMemo(() => {
    if (!projectGroups) return 0
    return projectGroups.reduce((sum, g) => sum + g.items.length, 0)
  }, [projectGroups])

  // 简历项目：摊平所有分组，按更新时间倒序，每条带所属日期
  const flatProjectItems = useMemo(() => {
    if (!projectGroups) return []
    return projectGroups
      .flatMap((g) => g.items.map((p) => ({ ...p, groupDate: g.date })))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  }, [projectGroups])

  const isAihotTab = tab === 'daily' || tab === 'news' || tab === 'hot'

  return (
    <section className="card-flat relative flex flex-col overflow-hidden" aria-label="AI 资讯面板">
      {/* 区块头：标题 + 数量标签 + Tab 切换 */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {tab === 'daily' ? (
            <Newspaper className="h-5 w-5 shrink-0 text-primary" />
          ) : tab === 'news' ? (
            <Flame className="h-5 w-5 shrink-0 text-primary" />
          ) : tab === 'hot' ? (
            <TrendingUp className="h-5 w-5 shrink-0 text-primary" />
          ) : tab === 'github' ? (
            <Github className="h-5 w-5 shrink-0 text-primary" />
          ) : (
            <Rocket className="h-5 w-5 shrink-0 text-primary" />
          )}
          <h2 className="truncate text-base font-semibold text-ink">{TAB_TITLES[tab]}</h2>
          {tab === 'projects' && totalProjectItems > 0 && (
            <span className="shrink-0 rounded-md bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-primary">
              {totalProjectItems} 个
            </span>
          )}
        </div>

        {/* Tab 切换 */}
        <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto rounded-lg bg-slate-100 p-0.5 no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === t.key ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-ink'
              }`}
              aria-pressed={tab === t.key}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区：固定高度容器内滚动 */}
      <div className="h-[560px] overflow-y-auto no-scrollbar">
        {tab === 'daily' ? (
          <AihotDaily />
        ) : tab === 'news' ? (
          <AiNewsFeed />
        ) : tab === 'hot' ? (
          <HotTopics />
        ) : tab === 'github' ? (
          githubError ? (
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
              <ul className="divide-y divide-line">
                {flatGithubItems.map((repo) => {
                  const label = itemDateLabel(repo.syncedAt)
                  return (
                    <li key={`${repo.id}-${repo.fullName}`}>
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
                          {(repo.summaryZh || repo.description) && (
                            <span className="mt-0.5 block truncate text-xs text-muted">
                              {repo.summaryZh || repo.description}
                            </span>
                          )}
                          {repo.highlightZh && (
                            <span className="mt-0.5 block truncate text-[11px] italic text-primary/80">
                              AI 点评：{repo.highlightZh}
                            </span>
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
          )
        ) : projectError ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <p className="text-sm text-red-600">{projectError}</p>
            <button
              type="button"
              onClick={() => void loadProjects()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-slate-400 hover:text-ink"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              重试
            </button>
          </div>
        ) : projectGroups === null ? (
          <div className="space-y-3 px-5 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-1.5 rounded-xl border border-line p-3">
                <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : projectGroups.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <Rocket className="h-8 w-8 text-slate-300" />
            <p className="text-sm text-muted">暂无项目推荐</p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {flatProjectItems.map((project) => {
                const open = projectExpanded.has(project.id)
                const label = itemDateLabel(project.updatedAt)
                return (
                  <li key={`${project.groupDate}-${project.name}`} className="px-5 py-3.5">
                    <button
                      type="button"
                      onClick={() => toggleProject(project.id)}
                      className="w-full text-left"
                      aria-expanded={open}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="truncate text-sm font-semibold text-ink">{project.name}</h3>
                        <span className="flex shrink-0 items-center gap-2">
                          {label && (
                            <span
                              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                                label === '今天' ? 'bg-primary text-white' : 'bg-slate-100 text-muted'
                              }`}
                            >
                              {label}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-0.5 text-amber-500">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            <span className="text-[11px]">难度 {difficultyStars(project.difficulty)}</span>
                          </span>
                          <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted">{project.tagline}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                        {project.duration && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {project.duration}
                          </span>
                        )}
                        {project.updatedAt && (
                          <span className="inline-flex items-center gap-1" title="更新时间">
                            <Clock className="h-3 w-3" />
                            {formatUpdateTime(project.updatedAt)}
                          </span>
                        )}
                        <span className="truncate text-primary/80">{project.trendRelation}</span>
                      </div>
                    </button>

                    {open && (
                      <div className="mt-3 space-y-3 border-t border-line pt-3">
                        {project.techStack.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted">技术栈</p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {project.techStack.map((tech) => (
                                <span
                                  key={tech}
                                  className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600"
                                >
                                  {tech}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {project.modules.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted">核心功能模块</p>
                            <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[13px] leading-relaxed text-slate-700">
                              {project.modules.map((m) => (
                                <li key={m}>{m}</li>
                              ))}
                            </ol>
                          </div>
                        )}
                        {project.starSummary && (
                          <div>
                            <p className="text-xs font-medium text-muted">简历亮点（STAR）</p>
                            {(() => {
                              const star = parseStar(project.starSummary)
                              const cols: { key: string; label: string; text: string }[] = []
                              if (star.st) cols.push({ key: 'st', label: 'S/T', text: star.st })
                              if (star.a) cols.push({ key: 'a', label: 'A', text: star.a })
                              if (star.r) cols.push({ key: 'r', label: 'R', text: star.r })
                              return (
                                <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
                                  {cols.map((col) => (
                                    <div key={col.key} className="rounded-lg bg-slate-50 p-2.5">
                                      <span className="text-[11px] font-semibold text-primary">{col.label}</span>
                                      <p className="mt-0.5 text-[13px] leading-relaxed text-slate-700">{col.text}</p>
                                    </div>
                                  ))}
                                </div>
                              )
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {/* AI HOT 数据署名（合规） */}
        {isAihotTab && (
          <div className="border-t border-line py-2 text-center text-[11px] text-muted">
            数据来源：
            <a
              href="https://aihot.virxact.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline"
            >
              AI HOT
            </a>
          </div>
        )}
      </div>
    </section>
  )
}

export default DailyReportBlock
