// ============================================================
// JobPostingsPage — /jobs 招聘数据聚合页（表格布局）
// 默认按开启时间新→旧排序；行业/类型筛选复用 StyledSelect 下拉
// ============================================================

import React, { useCallback, useEffect, useState } from 'react'
import { Inbox, AlertTriangle } from 'lucide-react'
import { jobPostingApi, type JobFilters, type JobPostingListResponse } from '@/api/jobPosting'
import type { JobPosting } from '@/api/jobPosting'
import JobTableRow from '@/components/job/JobTableRow'
import JobFilterBar, { type JobFilterValue } from '@/components/job/JobFilterBar'
import JobPagination from '@/components/job/JobPagination'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/components/common/Toast'
import HomeHeader from '@/components/home/HomeHeader'

const PAGE_SIZE = 20
const AUTO_REFRESH_INTERVAL_MS = 60 * 60 * 1000

const JobPostingsPage: React.FC = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const logout = useAuthStore((s) => s.logout)
  const [filterValue, setFilterValue] = useState<JobFilterValue>({
    industry: '',
    type: '',
    keyword: '',
    applied: '',
  })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [data, setData] = useState<JobPostingListResponse | null>(null)
  const [filters, setFilters] = useState<JobFilters>({ industries: [], types: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 加载筛选枚举
  const loadFilters = useCallback(async () => {
    try {
      setFilters(await jobPostingApi.getJobFilters())
    } catch {
      // 筛选枚举失败不影响列表展示。
    }
  }, [])

  const loadData = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const res = await jobPostingApi.getJobPostings({
        industry: filterValue.industry || undefined,
        type: filterValue.type || undefined,
        keyword: filterValue.keyword || undefined,
        applied: filterValue.applied || undefined,
        page,
        pageSize,
      })
      setData(res)
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : '招聘数据加载失败')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [filterValue, page, pageSize])

  useEffect(() => {
    void loadFilters()
  }, [loadFilters])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadData(true)
      void loadFilters()
    }, AUTO_REFRESH_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [loadData, loadFilters])

  const handleFilterChange = (next: JobFilterValue) => {
    setFilterValue(next)
    setPage(1) // 筛选变化回到第一页
  }

  const handlePageChange = (p: number, ps: number) => {
    setPage(p)
    if (ps !== pageSize) setPageSize(ps)
  }

  // 本地乐观更新「已投递」标记，失败时回滚，避免整页重新加载抢先跳动
  const handleToggleApplied = async (job: JobPosting) => {
    const nextApplied = !job.applied
    setData((prev) =>
      prev
        ? { ...prev, items: prev.items.map((it) => (it.id === job.id ? { ...it, applied: nextApplied } : it)) }
        : prev,
    )
    try {
      await jobPostingApi.setJobPostingMark(job.id, nextApplied)
    } catch (e) {
      setData((prev) =>
        prev
          ? { ...prev, items: prev.items.map((it) => (it.id === job.id ? { ...it, applied: job.applied } : it)) }
          : prev,
      )
      toast(e instanceof Error ? e.message : '标记失败，请重试', 'error')
    }
  }

  const handleLogout = async () => {
    await logout()
    localStorage.removeItem('resumecraft_current_resume_id')
    window.location.href = '/'
  }

  const items = data?.items ?? []
  const pagination = data?.pagination ?? { page: 1, pageSize, total: 0, totalPages: 0 }

  return (
    <div className="flex h-screen h-[100dvh] min-h-0 flex-col overflow-hidden bg-canvas text-slate-900">
      <HomeHeader onLogout={() => void handleLogout()} title="招聘聚合" />

      {/* 筛选栏（导航高度补偿 pt-14=56px） */}
      <div className="shrink-0 border-b border-line bg-surface pt-14">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="w-full min-w-0">
            <JobFilterBar
              value={filterValue}
              onChange={handleFilterChange}
              industries={filters.industries}
              types={filters.types}
              isAuthenticated={isAuthenticated}
            />
          </div>
        </div>
      </div>

      {/* 内容区 */}
      <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        {error && (
          <div className="m-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 sm:mx-6">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => void loadData()}
              className="rounded-lg border border-red-300 px-3 py-1 font-medium transition hover:bg-red-100"
            >
              重试
            </button>
          </div>
        )}

        {/* 加载骨架 */}
        {loading && !data && (
          <div className="no-scrollbar min-h-0 flex-1 overflow-auto border-y border-slate-200 bg-white">
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
                      <div className="h-5 w-20 animate-pulse rounded-full bg-slate-100" />
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
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center border-y border-dashed border-slate-200 bg-white px-6 py-16 text-center">
            <Inbox className="h-10 w-10 text-slate-300" />
            <p className="mt-4 text-base text-slate-500">暂无匹配的招聘信息</p>
            <button
              type="button"
              onClick={() => handleFilterChange({ industry: '', type: '', keyword: '', applied: '' })}
              className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-[13px] font-medium text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-blue-600/30"
            >
              清除筛选条件
            </button>
          </div>
        )}

        {/* 表格 */}
        {!loading && !error && items.length > 0 && (
          <div className="no-scrollbar min-h-0 flex-1 overflow-auto border-y border-slate-200 bg-white">
            <table className="w-full min-w-[1100px] border-collapse text-sm">
              <thead className="sticky top-0 z-[1] bg-gray-100/95 shadow-[0_1px_0_0_rgb(229_231_235)] backdrop-blur-sm">
                <tr className="border-b border-gray-200 text-left text-xs font-semibold text-gray-700">
                  <th className="px-3 py-3">企业</th>
                  <th className="px-3 py-3">行业</th>
                  <th className="px-3 py-3">招聘岗位</th>
                  <th className="px-3 py-3">类型</th>
                  <th className="px-3 py-3">开启时间</th>
                  <th className="px-3 py-3">地点</th>
                  <th className="px-3 py-3">是否投递</th>
                  <th className="px-3 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((job) => (
                  <JobTableRow
                    key={job.id}
                    job={job}
                    isAuthenticated={isAuthenticated}
                    onToggleApplied={handleToggleApplied}
                  />
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
