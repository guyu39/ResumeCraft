// ============================================================
// JobPostingsPage — /jobs 招聘数据聚合页（表格布局）
// 默认按开启时间新→旧排序；行业/类型筛选复用 StyledSelect 下拉
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, Inbox, AlertTriangle } from 'lucide-react'
import { jobPostingApi, type JobFilters, type JobPostingListResponse } from '@/api/jobPosting'
import { getToken } from '@/api/client'
import { toast } from '@/components/common/Toast'
import JobTableRow from '@/components/job/JobTableRow'
import JobFilterBar, { type JobFilterValue } from '@/components/job/JobFilterBar'
import JobPagination from '@/components/job/JobPagination'

const PAGE_SIZE = 20

const JobPostingsPage: React.FC = () => {
  const [filterValue, setFilterValue] = useState<JobFilterValue>({
    industry: '',
    type: '',
    keyword: '',
  })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [data, setData] = useState<JobPostingListResponse | null>(null)
  const [filters, setFilters] = useState<JobFilters>({ industries: [], types: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [cooldownSec, setCooldownSec] = useState(0)
  const cooldownTimer = useRef<number | null>(null)

  // 手动同步后前端倒计时禁用：与后端 1 分钟限流对齐，避免按钮被狂点
  useEffect(() => {
    if (cooldownSec <= 0) return
    cooldownTimer.current = window.setTimeout(() => setCooldownSec((s) => s - 1), 1000)
    return () => {
      if (cooldownTimer.current) window.clearTimeout(cooldownTimer.current)
    }
  }, [cooldownSec])

  const isAuthed = !!getToken()

  // 加载筛选枚举
  useEffect(() => {
    jobPostingApi
      .getJobFilters()
      .then(setFilters)
      .catch(() => {
        /* 筛选枚举失败不影响列表展示 */
      })
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await jobPostingApi.getJobPostings({
        industry: filterValue.industry || undefined,
        type: filterValue.type || undefined,
        keyword: filterValue.keyword || undefined,
        page,
        pageSize,
      })
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : '招聘数据加载失败')
    } finally {
      setLoading(false)
    }
  }, [filterValue, page, pageSize])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleFilterChange = (next: JobFilterValue) => {
    setFilterValue(next)
    setPage(1) // 筛选变化回到第一页
  }

  const handlePageChange = (p: number, ps: number) => {
    setPage(p)
    if (ps !== pageSize) setPageSize(ps)
  }

  const handleSync = async () => {
    if (syncing) return
    if (cooldownSec > 0) {
      toast(`同步冷却中，请 ${cooldownSec}s 后再试`, 'info')
      return
    }
    setSyncing(true)
    try {
      const r = await jobPostingApi.syncJobPostings()
      toast(
        `同步完成：新增 ${r.inserted} · 更新 ${r.updated} · 失效 ${r.deactivated}`,
        'success',
      )
      await Promise.all([loadData(), jobPostingApi.getJobFilters().then(setFilters)])
      setCooldownSec(60) // 同步成功后锁定 60s，与后端限流一致
    } catch (e) {
      const msg = e instanceof Error ? e.message : '同步失败'
      // 后端限流时把剩余秒数同步到前端倒计时，按钮进入可见冷却，避免再次秒点
      const m = msg.match(/请\s*(\d+)\s*[s秒]\s*后重试/)
      if (m) setCooldownSec(parseInt(m[1], 10))
      const limited = msg.includes('过于频繁') || msg.includes('正在进行中')
      toast(msg, limited ? 'info' : 'error')
    } finally {
      setSyncing(false)
    }
  }

  const items = data?.items ?? []
  const pagination = data?.pagination ?? { page: 1, pageSize, total: 0, totalPages: 0 }

  return (
    <div className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_48%,#f8fafc_100%)] text-slate-900">
      {/* 头部 */}
      <header className="border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">校招 / 实习招聘聚合</h1>
            <p className="mt-1 text-[13px] text-slate-500">
              汇总公开招聘文档，按行业、类型与开启时间一站式浏览（默认新→旧）。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => (window.location.href = '/')}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 shadow-lg shadow-blue-600/10 transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-100"
            >
              返回简历
            </button>
            {isAuthed && (
              <button
                type="button"
                onClick={handleSync}
                disabled={syncing}
                className={`inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-blue-600/30 disabled:cursor-not-allowed disabled:opacity-60 ${cooldownSec > 0 ? 'cursor-not-allowed opacity-60 hover:translate-y-0 hover:bg-blue-600' : ''}`}
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                {cooldownSec > 0 ? `${cooldownSec}s 后可同步` : syncing ? '同步中...' : '手动同步'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 筛选栏 */}
      <JobFilterBar
        value={filterValue}
        onChange={handleFilterChange}
        industries={filters.industries}
        types={filters.types}
        total={pagination.total}
      />

      {/* 内容区 */}
      <main className="w-full flex-1 px-4 py-6 sm:px-6">
        {error && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={loadData}
              className="rounded-lg border border-red-300 px-3 py-1 font-medium transition hover:bg-red-100"
            >
              重试
            </button>
          </div>
        )}

        {/* 加载骨架 */}
        {loading && !data && (
          <div className="thin-scrollbar overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[1100px]">
              <tbody>
                {Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-4">
                      <div className="h-4 w-32 animate-pulse rounded bg-slate-100" />
                    </td>
                    <td className="px-3 py-4">
                      <div className="h-5 w-20 animate-pulse rounded-full bg-slate-100" />
                    </td>
                    <td className="px-3 py-4">
                      <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
                    </td>
                    <td className="px-3 py-4">
                      <div className="h-5 w-16 animate-pulse rounded-full bg-slate-100" />
                    </td>
                    <td className="px-3 py-4">
                      <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                    </td>
                    <td className="px-3 py-4">
                      <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
                    </td>
                    <td className="px-3 py-4">
                      <div className="ml-auto h-7 w-16 animate-pulse rounded-lg bg-slate-100" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 空态 */}
        {!loading && !error && data && items.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
            <Inbox className="h-10 w-10 text-slate-300" />
            <p className="mt-4 text-base text-slate-500">暂无匹配的招聘信息</p>
            <button
              type="button"
              onClick={() => handleFilterChange({ industry: '', type: '', keyword: '' })}
              className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-[13px] font-medium text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-blue-600/30"
            >
              清除筛选条件
            </button>
          </div>
        )}

        {/* 表格 */}
        {!loading && !error && items.length > 0 && (
          <div className="thin-scrollbar overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[1100px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3">企业</th>
                  <th className="px-3 py-3">行业</th>
                  <th className="px-3 py-3">招聘岗位</th>
                  <th className="px-3 py-3">类型</th>
                  <th className="px-3 py-3">开启时间</th>
                  <th className="px-3 py-3">地点</th>
                  <th className="px-3 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((job) => (
                  <JobTableRow key={job.id} job={job} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* 分页 */}
      <JobPagination pagination={pagination} onChange={handlePageChange} disabled={loading} />
    </div>
  )
}

export default JobPostingsPage
