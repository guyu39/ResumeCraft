// ============================================================
// ApplicationCalendar — 投递日程视图（月视图 / 周时间轴 + 冲突检测）
// 数据来源：GET /api/applications/calendar?from=<ms>&to=<ms>
// 设计依据：openspec/changes/application-calendar-view/ui-spec.md
// 不引入 fullcalendar，月历与周时间轴用 CSS Grid 手写，避免 +300KB bundle
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react'
import { applicationsApi, type CalendarEvent, type CalendarResponse } from '@/api/applications'

type ViewMode = 'month' | 'week'

// 周视图时间轴范围：覆盖绝大多数笔面试时段，超出范围的事件夹在首/末小时
const HOUR_START = 8
const HOUR_END = 22
const HOUR_HEIGHT = 60
const DEFAULT_DURATION_MS = 60 * 60 * 1000

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

// 与全站漏斗语义色一致：笔试 indigo / 面试 amber / 冲突 red
const EVENT_STYLE = {
  writtenTest: { dot: 'bg-indigo-500', block: 'bg-indigo-100 border-indigo-500', text: 'text-indigo-700' },
  interview: { dot: 'bg-amber-500', block: 'bg-amber-100 border-amber-500', text: 'text-amber-700' },
} as const

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** 周起始按周一（国内排期习惯），getDay() 的周日=0 需特殊处理 */
function startOfWeek(d: Date): Date {
  const x = startOfDay(d)
  const day = x.getDay()
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day))
  return x
}

function startOfMonth(d: Date): Date {
  const x = startOfDay(d)
  x.setDate(1)
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function addMonths(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(1)
  x.setMonth(x.getMonth() + n)
  return x
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseDateParam(raw: string | null): Date {
  if (!raw) return new Date()
  // 必须按本地时间构造：new Date('2026-08-11') 会被规范按 UTC 解析，
  // 在 UTC 负偏移时区会把 anchor 回退一天，导致分享链接加载错误的周/月
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return Number.isNaN(d.getTime()) ? new Date() : d
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function eventEnd(ev: CalendarEvent): number {
  return ev.scheduledEnd > ev.scheduledAt ? ev.scheduledEnd : ev.scheduledAt + DEFAULT_DURATION_MS
}

function eventLabel(ev: CalendarEvent): string {
  if (ev.eventType === 'writtenTest') return '笔试'
  return ev.round || '面试'
}

function ariaLabelFor(ev: CalendarEvent): string {
  const d = new Date(ev.scheduledAt)
  const range = `${d.getMonth() + 1}月${d.getDate()}日 ${fmtTime(ev.scheduledAt)}-${fmtTime(eventEnd(ev))}`
  return `${ev.companyName || '未填写公司'} ${eventLabel(ev)}，${range}${ev.conflictGroupId > 0 ? '，存在时间冲突' : ''}`
}

/**
 * 单日内重叠事件的并排布局：贪心分配泳道，
 * 已结束的泳道可复用，泳道总数决定每个块占日列宽度的比例。
 */
function assignLanes(events: CalendarEvent[]): { items: Array<{ ev: CalendarEvent; lane: number }>; laneCount: number } {
  const laneEnds: number[] = []
  const items = events.map((ev) => {
    const end = eventEnd(ev)
    let lane = laneEnds.findIndex((e) => e <= ev.scheduledAt)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(end)
    } else {
      laneEnds[lane] = end
    }
    return { ev, lane }
  })
  return { items, laneCount: Math.max(1, laneEnds.length) }
}

interface Props {
  onSelectApplication: (applicationId: string) => void
}

const ApplicationCalendar: React.FC<Props> = ({ onSelectApplication }) => {
  const search = new URLSearchParams(window.location.search)
  const [mode, setMode] = useState<ViewMode>(search.get('mode') === 'week' ? 'week' : 'month')
  const [anchor, setAnchor] = useState<Date>(() => parseDateParam(search.get('date')))
  const [data, setData] = useState<CalendarResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const highlightRef = useRef<HTMLElement | null>(null)

  // 月视图取整屏 6 周网格，周视图取 1 周；请求区间与渲染区间一致，避免边缘事件缺失
  const range = useMemo(() => {
    if (mode === 'week') {
      const from = startOfWeek(anchor)
      return { from, to: addDays(from, 7) }
    }
    const gridStart = startOfWeek(startOfMonth(anchor))
    return { from: gridStart, to: addDays(gridStart, 42) }
  }, [mode, anchor])

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await applicationsApi.getCalendar({ from: range.from.getTime(), to: range.to.getTime() })
      setData(res)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to])

  useEffect(() => {
    void load()
  }, [load])

  // URL 同步：日程视图可被分享/回溯（UX 指南 Deep Linking）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set('view', 'calendar')
    params.set('mode', mode)
    params.set('date', dateKey(anchor))
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
  }, [mode, anchor])

  const step = useCallback(
    (dir: -1 | 1) => {
      setAnchor((prev) => (mode === 'week' ? addDays(prev, dir * 7) : addMonths(prev, dir)))
      setExpandedDay(null)
    },
    [mode],
  )

  // 快捷键：← → 翻页，T 回今天，M/W 切视图
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 't' || e.key === 'T') setAnchor(new Date())
      else if (e.key === 'm' || e.key === 'M') setMode('month')
      else if (e.key === 'w' || e.key === 'W') setMode('week')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  const events = data?.events ?? []

  // 按日期分组，供月视图格子与周视图列复用
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const ev of events) {
      const key = dateKey(new Date(ev.scheduledAt))
      const list = map.get(key)
      if (list) list.push(ev)
      else map.set(key, [ev])
    }
    return map
  }, [events])

  const conflictDays = useMemo(() => {
    const set = new Set<string>()
    for (const ev of events) {
      if (ev.conflictGroupId > 0) set.add(dateKey(new Date(ev.scheduledAt)))
    }
    return set
  }, [events])

  // setAnchor 会触发异步重载，同步滚动时目标节点还没挂载，
  // 因此等 highlightId 与 data 都就绪后再定位
  useEffect(() => {
    if (!highlightId) return
    highlightRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const timer = window.setTimeout(() => setHighlightId(null), 2000)
    return () => window.clearTimeout(timer)
  }, [highlightId, data])

  const openEvent = (ev: CalendarEvent) => onSelectApplication(ev.applicationId)

  const today = new Date()

  const monthCells = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(anchor))
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  }, [anchor])

  const weekDays = useMemo(() => {
    const from = startOfWeek(anchor)
    return Array.from({ length: 7 }, (_, i) => addDays(from, i))
  }, [anchor])

  const title =
    mode === 'week'
      ? `${weekDays[0].getFullYear()}/${weekDays[0].getMonth() + 1}/${weekDays[0].getDate()} - ${weekDays[6].getMonth() + 1}/${weekDays[6].getDate()}`
      : `${anchor.getFullYear()} 年 ${anchor.getMonth() + 1} 月`

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto px-0 py-0 no-scrollbar">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label={mode === 'week' ? '上一周' : '上一月'}
          className="rounded-lg border border-line p-1.5 text-muted transition hover:border-primary/40 hover:text-ink focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setAnchor(new Date())}
          className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink transition hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {mode === 'week' ? '本周' : '本月'}
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label={mode === 'week' ? '下一周' : '下一月'}
          className="rounded-lg border border-line p-1.5 text-muted transition hover:border-primary/40 hover:text-ink focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <h3 className="ml-1 text-sm font-semibold tabular-nums text-ink">{title}</h3>

        <div className="ml-auto flex overflow-hidden rounded-lg border border-line" role="tablist" aria-label="视图模式">
          {(['month', 'week'] as ViewMode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 text-xs transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary ${
                mode === m ? 'bg-primary text-white' : 'bg-surface text-muted hover:text-ink'
              }`}
            >
              {m === 'month' ? '月视图' : '周视图'}
            </button>
          ))}
        </div>
      </div>

      {/* 主内容 */}
      <div className="rounded-2xl border border-line bg-surface p-4">
        {loading && !data ? (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        ) : error ? (
          <div className="flex h-56 flex-col items-center justify-center gap-2 text-sm text-muted">
            <span>加载失败</span>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-line px-3 py-1 text-xs text-primary transition hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              重试
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 text-center">
            <CalendarClock className="h-10 w-10 text-slate-300" />
            <p className="text-sm text-muted">暂无笔面试安排</p>
            <p className="text-xs text-slate-400">投递后填写笔试/面试时间，系统将自动同步到此日程</p>
          </div>
        ) : mode === 'month' ? (
          <div>
            <div className="grid grid-cols-7 gap-1 pb-2">
              {WEEKDAY_LABELS.map((w) => (
                <div key={w} className="text-center text-xs font-medium text-muted">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthCells.map((day) => {
                const key = dateKey(day)
                const dayEvents = eventsByDay.get(key) ?? []
                const outside = day.getMonth() !== anchor.getMonth()
                const hasConflict = conflictDays.has(key)
                const isToday = isSameDay(day, today)
                const expanded = expandedDay === key
                const visible = expanded ? dayEvents : dayEvents.slice(0, 3)
                return (
                  <div
                    key={key}
                    role="gridcell"
                    aria-label={`${day.getMonth() + 1} 月 ${day.getDate()} 日，${dayEvents.length} 项安排${hasConflict ? '，存在冲突' : ''}`}
                    className={`relative min-h-[88px] rounded-lg border p-1.5 ${
                      hasConflict
                        ? 'border-red-300 bg-red-50/60'
                        : dayEvents.length > 0
                          ? 'border-primary/40 bg-primary-light/50'
                          : 'border-line bg-canvas'
                    } ${outside ? 'opacity-30' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-sm tabular-nums ${
                          isToday
                            ? 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white'
                            : 'text-ink'
                        }`}
                      >
                        {day.getDate()}
                      </span>
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {visible.map((ev) => {
                        const style = EVENT_STYLE[ev.eventType]
                        const isHighlight = highlightId === ev.id
                        return (
                          <li key={ev.id}>
                            <button
                              type="button"
                              ref={highlightId === ev.id ? (el) => { highlightRef.current = el } : undefined}
                              onClick={() => openEvent(ev)}
                              aria-label={ariaLabelFor(ev)}
                              className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] transition hover:bg-white ${
                                isHighlight ? 'animate-pulse ring-2 ring-red-400' : ''
                              } focus:outline-none focus:ring-2 focus:ring-primary`}
                            >
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
                              <span className="shrink-0 tabular-nums text-slate-500">{fmtTime(ev.scheduledAt)}</span>
                              <span className="truncate text-ink">{ev.companyName || '未填写'} · {eventLabel(ev)}</span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                    {dayEvents.length > 3 ? (
                      <button
                        type="button"
                        onClick={() => setExpandedDay(expanded ? null : key)}
                        className="mt-0.5 text-[11px] text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        {expanded ? '收起' : `+${dayEvents.length - 3}`}
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div>
            {/* 周视图表头：日期列 */}
            <div className="grid pb-2" style={{ gridTemplateColumns: `56px repeat(7, minmax(0, 1fr))` }}>
              <div />
              {weekDays.map((day, i) => (
                <div key={dateKey(day)} className="text-center">
                  <p className="text-xs text-muted">{WEEKDAY_LABELS[i]}</p>
                  <p
                    className={`text-sm tabular-nums ${
                      isSameDay(day, today) ? 'font-bold text-primary' : 'text-ink'
                    }`}
                  >
                    {day.getMonth() + 1}/{day.getDate()}
                  </p>
                </div>
              ))}
            </div>

            {/* 周视图时间轴：容器固定高度可滚动，避免整页过长 */}
            <div className="max-h-[560px] overflow-y-auto">
              <div className="grid" style={{ gridTemplateColumns: `56px repeat(7, minmax(0, 1fr))` }}>
                {/* 时间刻度列 */}
                <div>
                  {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                    <div
                      key={i}
                      className="border-t border-line pr-2 text-right text-[10px] tabular-nums text-slate-400"
                      style={{ height: HOUR_HEIGHT }}
                    >
                      {String(HOUR_START + i).padStart(2, '0')}:00
                    </div>
                  ))}
                </div>

                {/* 7 个日列 */}
                {weekDays.map((day) => {
                  const key = dateKey(day)
                  const dayEvents = eventsByDay.get(key) ?? []
                  const { items, laneCount } = assignLanes(dayEvents)
                  return (
                    <div key={key} className="relative border-l border-line">
                      {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                        <div key={i} className="border-t border-line" style={{ height: HOUR_HEIGHT }} />
                      ))}
                      {items.map(({ ev, lane }) => {
                        const start = new Date(ev.scheduledAt)
                        const startHours = start.getHours() + start.getMinutes() / 60
                        const endMs = eventEnd(ev)
                        const durationHours = (endMs - ev.scheduledAt) / 3600000
                        // 超出时间轴范围的事件夹在边界内（上夹到 0、下夹到末行），保证始终可见可点
                        const gridHeight = (HOUR_END - HOUR_START) * HOUR_HEIGHT
                        const height = Math.max(30, durationHours * HOUR_HEIGHT)
                        const top = Math.min(
                          Math.max(0, gridHeight - 30),
                          Math.max(0, (startHours - HOUR_START) * HOUR_HEIGHT),
                        )
                        const style = EVENT_STYLE[ev.eventType]
                        const conflicted = ev.conflictGroupId > 0
                        const isHighlight = highlightId === ev.id
                        return (
                          <button
                            key={ev.id}
                            type="button"
                            ref={highlightId === ev.id ? (el) => { highlightRef.current = el } : undefined}
                            onClick={() => openEvent(ev)}
                            aria-label={ariaLabelFor(ev)}
                            className={`absolute overflow-hidden rounded border-l-2 px-1 py-0.5 text-left transition hover:brightness-95 ${style.block} ${
                              conflicted ? '!border-red-500' : ''
                            } ${isHighlight ? 'animate-pulse ring-2 ring-red-400' : ''} focus:outline-none focus:ring-2 focus:ring-primary`}
                            style={{
                              top,
                              height,
                              left: `${(lane / laneCount) * 100}%`,
                              width: `${(1 / laneCount) * 100}%`,
                            }}
                          >
                            <span className={`block truncate text-[11px] font-medium ${style.text}`}>
                              {ev.companyName || '未填写'}
                            </span>
                            <span className="block truncate text-[10px] text-slate-500">
                              {eventLabel(ev)} · {fmtTime(ev.scheduledAt)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="pb-2 text-center text-[11px] text-slate-400">
        快捷键：← → 翻页 · T 回到今天 · M 月视图 · W 周视图
      </p>
    </div>
  )
}

export default ApplicationCalendar
