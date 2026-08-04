// ============================================================
// 首页右下角悬浮球：待办 + 新增岗位 两个可折叠浮层面板
// 折叠时仅显示带数字的悬浮球；展开后浮于页面之上（右侧）
// ============================================================

import React, { useCallback, useEffect, useState } from 'react'
import {
  ClipboardList, BriefcaseBusiness, ChevronRight, X, RefreshCw, MapPin, CalendarClock,
} from 'lucide-react'
import { homeApi, type HomeTodoItem, type NewJobItem } from '@/api/home'

type PanelKey = 'todo' | 'jobs'

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

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

const FloatingActions: React.FC = () => {
  const [activePanel, setActivePanel] = useState<PanelKey | null>(null)
  const [todos, setTodos] = useState<HomeTodoItem[] | null>(null)
  const [todoError, setTodoError] = useState<string | null>(null)
  const [jobs, setJobs] = useState<NewJobItem[] | null>(null)
  const [jobError, setJobError] = useState<string | null>(null)

  const loadTodos = useCallback(async () => {
    setTodoError(null)
    try {
      const data = await homeApi.listTodos()
      setTodos(data.items || [])
    } catch (err) {
      setTodos([])
      setTodoError(err instanceof Error ? err.message : '待办加载失败')
    }
  }, [])

  const loadJobs = useCallback(async () => {
    setJobError(null)
    try {
      const data = await homeApi.listNewJobs(2, 20)
      setJobs(data.items || [])
    } catch (err) {
      setJobs([])
      setJobError(err instanceof Error ? err.message : '岗位加载失败')
    }
  }, [])

  // 首屏并行加载数据（球体数字用）；展开面板时确保已加载
  useEffect(() => { void loadTodos(); void loadJobs() }, [loadTodos, loadJobs])

  const toggle = (key: PanelKey) => {
    setActivePanel((prev) => (prev === key ? null : key))
  }

  const todoCount = todos?.length ?? 0
  const jobCount = jobs?.length ?? 0

  const goApplications = (applicationId?: string) => {
    const target = applicationId ? `/applications?id=${encodeURIComponent(applicationId)}` : '/applications'
    window.location.href = target
  }

  return (
    <>
      {/* 展开面板 */}
      {activePanel && (
        <div className="fixed bottom-24 right-5 z-50 flex w-[min(380px,calc(100vw-40px))] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
          {/* 面板头 */}
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              {activePanel === 'todo' ? (
                <ClipboardList className="h-4 w-4 text-primary" />
              ) : (
                <BriefcaseBusiness className="h-4 w-4 text-primary" />
              )}
              <h3 className="text-sm font-semibold text-ink">
                {activePanel === 'todo' ? '笔面试待办' : '今日新增岗位'}
              </h3>
              <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-primary">
                {activePanel === 'todo' ? `${todoCount} 项` : `${jobCount} 条`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActivePanel(null)}
              className="rounded-lg p-1 text-muted transition-colors hover:bg-slate-50 hover:text-ink"
              aria-label="关闭面板"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* 面板体：固定高度容器内滚动 */}
          <div className="h-72 overflow-y-auto no-scrollbar">
            {activePanel === 'todo' ? (
              todoError ? (
                <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
                  <p className="text-xs text-red-600">{todoError}</p>
                  <button
                    type="button"
                    onClick={() => void loadTodos()}
                    className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs font-medium text-muted transition hover:border-slate-400 hover:text-ink"
                  >
                    <RefreshCw className="h-3 w-3" />
                    重试
                  </button>
                </div>
              ) : todos === null ? (
                <div className="space-y-2.5 px-4 py-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-8 w-12 animate-pulse rounded bg-slate-100" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
                    </div>
                  ))}
                </div>
              ) : todos.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
                  <CalendarClock className="h-7 w-7 text-slate-300" />
                  <p className="text-xs text-muted">暂无待办安排</p>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {todos.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => goApplications(item.applicationId)}
                        className="group flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-brand-soft"
                      >
                        <span className="w-11 shrink-0 text-sm font-semibold tabular-nums text-ink">
                          {formatTime(item.scheduledAt)}
                        </span>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                            item.type === 'interview'
                              ? 'bg-brand-soft text-primary'
                              : 'bg-amber-50 text-amber-600'
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
              )
            ) : jobError ? (
              <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
                <p className="text-xs text-red-600">{jobError}</p>
                <button
                  type="button"
                  onClick={() => void loadJobs()}
                  className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs font-medium text-muted transition hover:border-slate-400 hover:text-ink"
                >
                  <RefreshCw className="h-3 w-3" />
                  重试
                </button>
              </div>
            ) : jobs === null ? (
              <div className="space-y-2.5 px-4 py-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
                    <div className="h-3 w-1/4 animate-pulse rounded bg-slate-100" />
                  </div>
                ))}
              </div>
            ) : jobs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
                <BriefcaseBusiness className="h-7 w-7 text-slate-300" />
                <p className="text-xs text-muted">今日暂无新增岗位</p>
                <a
                  href="/jobs"
                  className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white transition hover:bg-blue-700"
                >
                  去招聘聚合看看
                </a>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {jobs.map((job) => (
                  <li key={job.id}>
                    <a
                      href={job.applicationUrl || '/jobs'}
                      target={job.applicationUrl ? '_blank' : undefined}
                      rel={job.applicationUrl ? 'noopener noreferrer' : undefined}
                      className="group flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-brand-soft"
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

          {/* 面板底：跳转 */}
          <div className="border-t border-line px-4 py-2 text-center">
            <button
              type="button"
              onClick={() => activePanel === 'todo' ? goApplications() : (window.location.href = '/jobs')}
              className="inline-flex items-center gap-0.5 text-xs font-medium text-muted transition-colors hover:text-primary"
            >
              {activePanel === 'todo' ? '前往投递管理' : '前往招聘聚合'}
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* 悬浮球组 */}
      <div className="fixed bottom-6 right-5 z-50 flex flex-col items-end gap-3">
        {/* 待办球 */}
        <button
          type="button"
          onClick={() => toggle('todo')}
          className="group flex items-center gap-2 rounded-full bg-primary py-2 pl-3 pr-4 text-white shadow-lg shadow-primary/30 transition-all hover:-translate-y-0.5 hover:shadow-xl"
          aria-expanded={activePanel === 'todo'}
          aria-label="笔面试待办"
        >
          <ClipboardList className="h-5 w-5" />
          <span className="text-sm font-semibold tabular-nums">{todoCount}</span>
        </button>

        {/* 新岗位球 */}
        <button
          type="button"
          onClick={() => toggle('jobs')}
          className="group flex items-center gap-2 rounded-full bg-primary py-2 pl-3 pr-4 text-white shadow-lg shadow-primary/30 transition-all hover:-translate-y-0.5 hover:shadow-xl"
          aria-expanded={activePanel === 'jobs'}
          aria-label="今日新增岗位"
        >
          <BriefcaseBusiness className="h-5 w-5" />
          <span className="text-sm font-semibold tabular-nums">{jobCount}</span>
        </button>
      </div>
    </>
  )
}

export default FloatingActions
