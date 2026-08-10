// ============================================================
// 首页 AI HOT 日报：sections 分组渲染 + 日期切换
// 主数据 /api/home/aihot/daily；AI HOT 不可用时回退旧日报链路（/api/home/daily-report）
// ============================================================

import React, { useCallback, useEffect, useState } from 'react'
import { RefreshCw, ExternalLink, CalendarDays } from 'lucide-react'
import { homeApi, type AihotDaily, type AihotDailySectionItem, type DailyReport } from '@/api/home'

function DailyItem({ item, index }: { item: AihotDailySectionItem; index: number }) {
  const href = item.links?.aihot || item.links?.original || '#'
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-soft text-xs font-semibold text-primary">
        {index}
      </span>
      <div className="min-w-0 flex-1">
        {href && href !== '#' ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="line-clamp-2 text-sm font-medium leading-snug text-ink transition-colors hover:text-primary"
          >
            {item.title}
          </a>
        ) : (
          <p className="line-clamp-2 text-sm font-medium leading-snug text-ink">{item.title}</p>
        )}
        {item.summary && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{item.summary}</p>
        )}
        {(item.source?.name || item.links?.original) && (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted">
            {item.source?.name && <span className="max-w-[60%] truncate text-primary/80">{item.source.name}</span>}
            {item.links?.original && (
              <a
                href={item.links.original}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 transition-colors hover:text-primary"
              >
                <ExternalLink className="h-2.5 w-2.5" />
                原文
              </a>
            )}
          </p>
        )}
      </div>
    </li>
  )
}

// 旧链路日报渲染（AI HOT 不可用时回退）
function LegacyDailyList({ reports }: { reports: DailyReport[] }) {
  const flat = reports
    .flatMap((r) => r.items.map((it) => ({ ...it, date: r.reportDate })))
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
  return (
    <ol className="divide-y divide-line">
      {flat.map((item, idx) => (
        <li key={`${item.date}-${item.rank}`} className="px-5 py-3.5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-soft text-xs font-semibold text-primary">
              {idx + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug text-ink">{item.title}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                <span className="text-primary">{'★'.repeat(Math.max(1, Math.min(5, item.rating)))}</span>
                <span>{item.source}</span>
              </p>
              {item.summary && (
                <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-muted">{item.summary}</p>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

const AihotDaily: React.FC = () => {
  const [daily, setDaily] = useState<AihotDaily | null>(null)
  const [dates, setDates] = useState<string[]>([])
  const [selected, setSelected] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // 降级：AI HOT 无数据时回退旧日报链路
  const [legacyReports, setLegacyReports] = useState<DailyReport[] | null>(null)

  const loadLegacy = useCallback(async () => {
    try {
      const data = await homeApi.getDailyReports(7)
      setLegacyReports(data.reports || [])
    } catch {
      setLegacyReports([])
    }
  }, [])

  const load = useCallback(async (date?: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await homeApi.getAihotDaily(date)
      setDaily(data.report)
      setDates(data.dates || [])
      setLegacyReports(null)
      if (!data.report) {
        // AI HOT 尚未同步 → 回退旧链路
        await loadLegacy()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '日报加载失败')
      setDaily(null)
      await loadLegacy()
    } finally {
      setLoading(false)
    }
  }, [loadLegacy])

  useEffect(() => {
    void load(selected || undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const sections = daily?.report?.sections || []
  const flashes = daily?.report?.flashes || []
  const reportDate = daily?.reportDate || daily?.report?.date || ''

  return (
    <div className="flex h-full flex-col">
      {/* 日期切换（AI HOT 日报近 7 期） */}
      {dates.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto px-5 py-3 no-scrollbar">
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted" />
          {dates.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setSelected(d)}
              className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                (selected === '' && d === dates[0]) || selected === d
                  ? 'border-transparent bg-primary text-white'
                  : 'border-line bg-white text-muted hover:text-ink'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        {loading ? (
          <div className="space-y-3 px-5 py-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-3.5 w-1/3 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : error && !legacyReports ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={() => void load(selected || undefined)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-slate-400 hover:text-ink"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              重试
            </button>
          </div>
        ) : legacyReports ? (
          legacyReports.length > 0 ? (
            <LegacyDailyList reports={legacyReports} />
          ) : (
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
              <p className="text-sm text-muted">暂无日报</p>
            </div>
          )
        ) : sections.length === 0 && flashes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <p className="text-sm text-muted">{reportDate ? `${reportDate} 日报暂无内容` : '暂无日报'}</p>
          </div>
        ) : (
          <div className="pb-2">
            {/* 快讯要点 */}
            {flashes.length > 0 && (
              <div className="mx-5 mt-3 rounded-xl border border-brand-soft bg-brand-soft/50 px-3.5 py-2.5">
                <p className="text-xs font-semibold text-primary">今日要点</p>
                <ul className="mt-1 space-y-1">
                  {flashes.map((f, i) => (
                    <li key={i} className="text-[13px] leading-snug text-slate-700">
                      {f.title ? <b className="font-semibold text-ink">{f.title}：</b> : null}
                      {f.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* sections 分组 */}
            {sections.map((sec) => (
              <div key={sec.label} className="px-5 pt-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <span className="h-3 w-1 rounded-full bg-gradient-to-b from-blue-500 to-violet-500" />
                  {sec.label}
                </p>
                <ol className="divide-y divide-dashed divide-line">
                  {(sec.items || []).map((it, i) => (
                    <DailyItem key={`${it.title}-${i}`} item={it} index={i + 1} />
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default AihotDaily
