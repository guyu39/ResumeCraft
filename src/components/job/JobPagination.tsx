// ============================================================
// JobPagination — 底部分页
// 视觉与 ApplicationsPage 完全一致：border-t 底栏 + StyledSelect 每页条数
// + 中性翻页按钮 + 「第 X / Y 页」；保留紧凑页码便于大列表跳转
// ============================================================

import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Pagination } from '@/api/types'
import StyledSelect from '@/components/common/StyledSelect'

interface JobPaginationProps {
  pagination: Pagination
  onChange: (page: number, pageSize: number) => void
  disabled?: boolean
}

const PAGE_SIZE_OPTIONS = [12, 20, 40, 60]

// 生成紧凑页码集合：始终包含首/尾页与当前页附近，省略处用 -1 占位
function buildPages(current: number, totalPages: number): number[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const pages = new Set<number>([1, totalPages, current, current - 1, current + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b)
  const result: number[] = []
  let prev = 0
  for (const p of sorted) {
    if (p - prev > 1) result.push(-1) // 省略号占位
    result.push(p)
    prev = p
  }
  return result
}

const JobPagination: React.FC<JobPaginationProps> = ({ pagination, onChange, disabled }) => {
  const { page, pageSize, total, totalPages } = pagination

  const go = (p: number) => {
    if (disabled || p < 1 || p > totalPages || p === page) return
    onChange(p, pageSize)
  }

  const changeSize = (size: number) => {
    if (disabled || size === pageSize) return
    onChange(1, size) // 切换每页条数时回到第一页
  }

  if (total === 0) return null

  return (
    <div className="flex shrink-0 flex-col items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 text-sm sm:flex-row sm:px-6">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-slate-600">
          第 {page} / {totalPages} 页 · 共 <span className="text-slate-900">{total}</span> 条
        </span>
        <div className="w-28">
          <StyledSelect
            size="compact"
            direction="top"
            value={String(pageSize)}
            onChange={(v) => changeSize(Number(v))}
            options={PAGE_SIZE_OPTIONS.map((size) => ({
              label: `${size} 条/页`,
              value: String(size),
            }))}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => go(page - 1)}
          disabled={disabled || page <= 1}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          上一页
        </button>

        {buildPages(page, totalPages).map((p, idx) =>
          p === -1 ? (
            <span key={`gap-${idx}`} className="px-1.5 text-slate-400">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => go(p)}
              disabled={disabled}
              className={`h-8 min-w-[2rem] rounded-lg border px-2 text-xs font-medium transition ${
                p === page
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900'
              } disabled:cursor-not-allowed disabled:opacity-40`}
              aria-label={`第 ${p} 页`}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </button>
          ),
        )}

        <button
          type="button"
          onClick={() => go(page + 1)}
          disabled={disabled || page >= totalPages}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          下一页
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

export default JobPagination
