// ============================================================
// 首页最近新增岗位：正文常驻区块（原右下角悬浮球内容迁移至此）
// 数据来源：GET /api/home/new-jobs（后端优先读 Redis 最近新增列表，最多 10 条，按新增时间倒序）
// ============================================================

import React, { useCallback, useEffect, useState } from 'react'
import { BriefcaseBusiness, MapPin, RefreshCw } from 'lucide-react'
import { homeApi, type NewJobItem } from '@/api/home'

function formatOpenDate(ts?: number): string {
  if (!ts) return '近期'
  const d = new Date(ts)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const day = new Date(d)
  day.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000)
  if (diff === 0) return '今天开放'
  if (diff === 1) return '昨天开放'
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

const NewJobsBlock: React.FC = () => {
  const [jobs, setJobs] = useState<NewJobItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await homeApi.listNewJobs()
      setJobs(data.items || [])
    } catch (err) {
      setJobs([])
      setError(err instanceof Error ? err.message : '岗位加载失败')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const total = jobs?.length ?? 0
  const visible = jobs ?? []

  return (
    <section className="card-flat flex flex-col overflow-hidden" aria-label="最近新增岗位">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <BriefcaseBusiness className="h-5 w-5 shrink-0 text-primary" />
          <h2 className="truncate text-base font-semibold text-ink">最近新增岗位</h2>
          {total > 0 && (
            <span className="shrink-0 rounded-md bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-primary">
              {total} 条
            </span>
          )}
        </div>
        <a href="/jobs" className="shrink-0 text-xs font-medium text-muted transition-colors hover:text-primary">
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
        ) : jobs === null ? (
          <div className="space-y-2.5 px-5 py-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-1/4 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
            <BriefcaseBusiness className="h-7 w-7 text-slate-300" />
            <p className="text-xs text-muted">暂无新增岗位</p>
            <a
              href="/jobs"
              className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white transition hover:bg-blue-700"
            >
              去招聘聚合看看
            </a>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((job) => (
              <li key={job.id}>
                <a
                  href={job.applicationUrl || '/jobs'}
                  target={job.applicationUrl ? '_blank' : undefined}
                  rel={job.applicationUrl ? 'noopener noreferrer' : undefined}
                  className="group flex items-center gap-2.5 px-5 py-2.5 transition-colors hover:bg-brand-soft"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink transition-colors group-hover:text-primary">
                      {job.companyName || '未知公司'}
                      {job.positions ? ` · ${job.positions}` : ''}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                      {job.recruitmentType && <span>{job.recruitmentType}</span>}
                      {job.location && (
                        <span className="inline-flex items-center gap-0.5">
                          <MapPin className="h-3 w-3" />
                          {job.location}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{formatOpenDate(job.openDate)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default NewJobsBlock
