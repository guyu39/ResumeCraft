// ============================================================
// JobPostingsPage — /jobs 招聘数据聚合页（表格布局）
// 默认按开启时间新→旧排序；行业/类型筛选复用 StyledSelect 下拉
// ============================================================

import React, { useCallback, useEffect, useState } from 'react'
import { Inbox, AlertTriangle, BriefcaseBusiness, FileText } from 'lucide-react'
import { jobPostingApi, type JobFilters, type JobPostingListResponse } from '@/api/jobPosting'
import JobTableRow from '@/components/job/JobTableRow'
import JobFilterBar, { type JobFilterValue } from '@/components/job/JobFilterBar'
import JobPagination from '@/components/job/JobPagination'

const PAGE_SIZE = 20
const AUTO_REFRESH_INTERVAL_MS = 60 * 60 * 1000

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

  const items = data?.items ?? []
  const pagination = data?.pagination ?? { page: 1, pageSize, total: 0, totalPages: 0 }

  return (
    <div className="flex h-screen h-[100dvh] min-h-0 flex-col overflow-hidden bg-slate-50 text-slate-900">
      {/* 头部 */}
      <header className="relative z-10 shrink-0 border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <h1 className="w-full shrink-0 text-lg font-semibold text-slate-900 sm:w-auto">
            校招 招聘聚合
          </h1>

          <div className="order-3 w-full min-w-0 xl:order-none xl:flex-1">
            <JobFilterBar
              value={filterValue}
              onChange={handleFilterChange}
              industries={filters.industries}
              types={filters.types}
            />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => (window.location.href = '/')}
              className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-blue-200 bg-blue-50 px-3 text-[13px] font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-100"
            >
              <FileText className="h-4 w-4" />
              我的简历
            </button>
            <button
              type="button"
              onClick={() => (window.location.href = '/applications')}
              className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              <BriefcaseBusiness className="h-4 w-4" />
              投递管理
            </button>
          </div>
        </div>
      </header>

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
              onClick={() => handleFilterChange({ industry: '', type: '', keyword: '' })}
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
