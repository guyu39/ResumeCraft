// ============================================================
// 首页简历项目推荐：toC 场景项目，可展开 STAR 描述
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Rocket, ChevronDown, RefreshCw, Star, Clock } from 'lucide-react'
import { homeApi, type ProjectGroup } from '@/api/home'
import { dateLabel } from '@/utils/dateLabel'

function difficultyStars(n: number): string {
  return '★'.repeat(Math.max(1, Math.min(5, n)))
}

// 条目右侧日期标签：今天/昨天/08-01
function itemDateLabel(ts?: number): string | null {
  return dateLabel(ts)
}

// 更新时间：今天 →「今天 14:30」；昨天 →「昨天」；更早 →「MM-DD」
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
  // 依次提取 S/T → A → R（冒号为中文全角）
  let rest = summary
  // 依次提取 S/T → A → R
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
  // 兼容无前缀的兜底：若完全没拆开，整段归入 A
  if (!parts.st && !parts.a && !parts.r) parts.a = summary.trim()
  return parts
}

const Projects: React.FC = () => {
  const [groups, setGroups] = useState<ProjectGroup[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await homeApi.listProjects(7)
      setGroups(data.groups || [])
    } catch (err) {
      setGroups([])
      setError(err instanceof Error ? err.message : '项目推荐加载失败')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 近 7 天项目总数
  const totalItems = useMemo(() => {
    if (!groups) return 0
    return groups.reduce((sum, g) => sum + g.items.length, 0)
  }, [groups])

  // 项目：摊平所有分组，按更新时间倒序，每条带所属日期
  const flatItems = useMemo(() => {
    if (!groups) return []
    return groups
      .flatMap((g) => g.items.map((p) => ({ ...p, groupDate: g.date })))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  }, [groups])

  return (
    <section className="card-flat flex min-h-0 flex-col overflow-hidden" aria-label="简历项目推荐">
      {/* 区块头：标题 + 数量标签 + 右侧占位按钮（与日报头部同构等高） */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Rocket className="h-5 w-5 shrink-0 text-primary" />
          <h2 className="truncate text-base font-semibold text-ink">简历项目推荐</h2>
          {totalItems > 0 && (
            <span className="shrink-0 rounded-md bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-primary">
              {totalItems} 个
            </span>
          )}
        </div>
        {/* 占位按钮：与左侧 Tab 组等高，保证两卡头部高度一致 */}
        <div className="flex h-[30px] shrink-0 items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
          <span className="inline-flex items-center gap-1 rounded-md px-2.5 text-xs font-medium text-muted">
            全部项目
          </span>
        </div>
      </div>

      {/* 内容区：固定高度容器内滚动 */}
      <div className="h-[560px] overflow-y-auto no-scrollbar">
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
        ) : groups === null ? (
          <div className="space-y-3 px-5 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-1.5 rounded-xl border border-line p-3">
                <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <Rocket className="h-8 w-8 text-slate-300" />
            <p className="text-sm text-muted">暂无项目推荐</p>
          </div>
        ) : (
          <>
            {/* 单一列表：按更新时间倒序，每条右侧标注日期（今天→今天） */}
            <ul className="divide-y divide-line">
              {flatItems.map((project) => {
                const open = expanded.has(project.id)
                const label = itemDateLabel(project.updatedAt)
                return (
                  <li key={`${project.groupDate}-${project.name}`} className="px-5 py-3.5">
                  <button
                    type="button"
                    onClick={() => toggle(project.id)}
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
      </div>
    </section>
  )
}

export default Projects
