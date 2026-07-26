// ============================================================
// JobFilterBar — 行业 / 类型 / 关键词 筛选栏
// 行业、类型复用全局统一的 StyledSelect（Headless UI Listbox）下拉，
// 不提供时间排序（列表默认按开启时间新→旧）。
// ============================================================

import React, { useEffect, useRef, useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import StyledSelect from '@/components/common/StyledSelect'

export interface JobFilterValue {
  industry: string
  type: string
  keyword: string
}

interface JobFilterBarProps {
  value: JobFilterValue
  onChange: (next: JobFilterValue) => void
  industries: string[]
  types: string[]
  /** 当前结果总数（可选，用于展示「共 N 条」） */
  total?: number
}

const toOptions = (all: string[], emptyLabel: string) => [
  { label: emptyLabel, value: '' },
  ...all.map((it) => ({ label: it, value: it })),
]

const JobFilterBar: React.FC<JobFilterBarProps> = ({
  value,
  onChange,
  industries,
  types,
  total,
}) => {
  const [keywordInput, setKeywordInput] = useState(value.keyword)
  const debounceRef = useRef<number | undefined>(undefined)

  // 关键词输入防抖 300ms 后触发 onChange
  useEffect(() => {
    if (keywordInput === value.keyword) return
    window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      onChange({ ...value, keyword: keywordInput })
    }, 300)
    return () => window.clearTimeout(debounceRef.current)
  }, [keywordInput])

  // 外部筛选被重置（如清除筛选）时同步输入框
  useEffect(() => {
    setKeywordInput(value.keyword)
  }, [value.keyword])

  const hasActiveFilter = value.industry || value.type || value.keyword

  return (
    <div className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/85 px-4 py-3 shadow-sm backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <SlidersHorizontal className="h-4 w-4 text-blue-600" />
          筛选
        </div>

        {/* 行业 */}
        <StyledSelect
          value={value.industry}
          onChange={(v) => onChange({ ...value, industry: v })}
          options={toOptions(industries, '全部行业')}
          placeholder="全部行业"
          searchable
          searchPlaceholder="搜索行业..."
          className="min-w-[160px]"
        />

        {/* 招聘类型 */}
        <StyledSelect
          value={value.type}
          onChange={(v) => onChange({ ...value, type: v })}
          options={toOptions(types, '全部类型')}
          placeholder="全部类型"
          searchable
          searchPlaceholder="搜索类型..."
          className="min-w-[160px]"
        />

        {/* 关键词搜索 */}
        <div className="relative flex-1 lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder="搜索企业 / 岗位 / 地点..."
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-[13px] text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          />
          {keywordInput && (
            <button
              type="button"
              onClick={() => setKeywordInput('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 transition hover:text-slate-600"
              aria-label="清除关键词"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* 清除筛选 */}
        {hasActiveFilter && (
          <button
            type="button"
            onClick={() => onChange({ industry: '', type: '', keyword: '' })}
            className="text-[13px] text-slate-500 transition hover:text-red-600"
          >
            清除筛选
          </button>
        )}

        {/* 结果计数 */}
        {typeof total === 'number' && (
          <span className="ml-auto whitespace-nowrap text-[13px] text-slate-400">
            共 <span className="font-semibold text-slate-600">{total}</span> 条
            <span className="ml-1 text-slate-300">（仅显示 2026 年及以后）</span>
          </span>
        )}
      </div>
    </div>
  )
}

export default JobFilterBar
