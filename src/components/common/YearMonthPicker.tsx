// ============================================================
// YearMonthPicker — 年月选择器（九宫格选年 + 月份网格）
// 两步选择：先选年，再选月，确认后关闭
// ============================================================

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'

interface YearMonthPickerProps {
  value: string           // YYYY-MM
  onChange: (value: string) => void
  placeholder?: string
  minYear?: number
  maxYear?: number
  /** 特殊值如"至今"，选中后直接触发 onChange */
  presentLabel?: string
  /** 往前往后多少年，默认60 */
  pastYears?: number
  futureYears?: number
}

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

// 九宫格年份面板（每页9年：3列×3行）
const YEAR_COLS = 3
const YEAR_ROWS = 3
const YEARS_PER_PAGE = YEAR_COLS * YEAR_ROWS  // 9

const YearMonthPicker: React.FC<YearMonthPickerProps> = ({
  value,
  onChange,
  placeholder = '选择年月',
  minYear,
  maxYear,
  presentLabel,
  pastYears = 60,
  futureYears = 1,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [panelPosition, setPanelPosition] = useState<{ top: number; left: number } | null>(null)
  const [step, setStep] = useState<'year' | 'month'>('year') // two-step: 选年 → 选月
  const [pageStart, setPageStart] = useState<number | null>(null) // 当前页起始年

  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inBrowser = typeof document !== 'undefined'

  const currentYear = new Date().getFullYear()
  const min = minYear ?? currentYear - pastYears
  const max = maxYear ?? currentYear + futureYears

  // 当前选中值
  const parsed = useMemo((): { year: number; month: number } | null => {
    if (!value || value === '至今') return null
    if (!/^\d{4}-\d{2}$/.test(value)) return null
    const [y, m] = value.split('-').map(Number)
    return { year: y, month: m }
  }, [value])

  // 初始化 pageStart
  useEffect(() => {
    if (isOpen && pageStart === null && parsed) {
      // 打开时定位到已选中的年份所在页
      const page = Math.floor((parsed.year - min) / YEARS_PER_PAGE)
      setPageStart(min + page * YEARS_PER_PAGE)
    }
  }, [isOpen, parsed, min, pageStart])

  const openCalendar = () => {
    // 初始化 pageStart 为当前年份所在页
    const initialYear = parsed?.year ?? currentYear
    const page = Math.floor((initialYear - min) / YEARS_PER_PAGE)
    setPageStart(min + page * YEARS_PER_PAGE)
    setStep('year')

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPanelPosition({ top: rect.bottom + 6, left: rect.left })
    }
    setIsOpen(true)
  }

  const closeCalendar = () => {
    setIsOpen(false)
    setStep('year')
  }

  // 年份页向前翻（更早）
  const prevPage = () => {
    if (pageStart === null) return
    const newStart = Math.max(min, pageStart - YEARS_PER_PAGE)
    setPageStart(newStart)
  }

  // 年份页向后翻（更晚）
  const nextPage = () => {
    if (pageStart === null) return
    const newStart = pageStart + YEARS_PER_PAGE
    if (newStart > max) return
    setPageStart(newStart)
  }

  // 选中年份 → 进入月份选择
  const selectYear = (year: number) => {
    // 如果是已选中年份，直接进入月份选择
    setPageStart(year)
    setStep('month')
  }

  // 选中月份
  const selectMonth = (month: number) => {
    if (pageStart === null) return
    onChange(`${pageStart}-${String(month).padStart(2, '0')}`)
    closeCalendar()
  }

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (buttonRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      closeCalendar()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  // 键盘支持
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCalendar()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen])

  const formatDisplay = (v: string) => {
    if (!v || v === '至今') return ''
    if (/^\d{4}-\d{2}$/.test(v)) {
      const [y, m] = v.split('-')
      return `${y}年${m}月`
    }
    return v
  }

  // 计算当前页的9个年份
  const pageYears = useMemo(() => {
    if (pageStart === null) return []
    const years: number[] = []
    for (let i = 0; i < YEARS_PER_PAGE; i++) {
      years.push(pageStart + i)
    }
    return years
  }, [pageStart])

  // 判断年份是否超出范围
  const isYearOutOfRange = (y: number) => y < min || y > max
  const canPrevPage = pageStart !== null && pageStart - YEARS_PER_PAGE >= min
  const canNextPage = pageStart !== null && pageStart + YEARS_PER_PAGE <= max

  const panelContent = isOpen ? (
    <div
      ref={panelRef}
      className="fixed z-[9999] bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 w-[300px]"
      style={panelPosition ? { top: panelPosition.top, left: panelPosition.left } : {}}
    >
      {/* 顶部导航 */}
      <div className="flex items-center justify-between mb-4">
        {step === 'month' && (
          <button
            type="button"
            onClick={() => setStep('year')}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            返回
          </button>
        )}
        {step === 'year' && (
          <div className="w-8" /> /* 占位 */
        )}
        <span className="text-sm font-semibold text-gray-700">
          {step === 'year' ? '选择年份' : `${pageStart}年`}
        </span>
        <button
          type="button"
          onClick={closeCalendar}
          className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100"
        >
          取消
        </button>
      </div>

      {/* 年份网格 */}
      {step === 'year' && (
        <>
          <div className="flex items-center justify-center gap-3 mb-3">
            <button
              type="button"
              onClick={prevPage}
              disabled={!canPrevPage}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-gray-500" />
            </button>
            <span className="text-xs text-gray-400 w-20 text-center">
              {pageStart !== null ? `${pageStart}–${Math.min(pageStart + YEARS_PER_PAGE - 1, max)}` : ''}
            </span>
            <button
              type="button"
              onClick={nextPage}
              disabled={!canNextPage}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {pageYears.map((y) => {
              const outOfRange = isYearOutOfRange(y)
              const isCurrent = parsed?.year === y
              return (
                <button
                  key={y}
                  type="button"
                  disabled={outOfRange}
                  onClick={() => !outOfRange && selectYear(y)}
                  className={`h-10 rounded-xl text-sm font-medium transition-colors ${
                    isCurrent
                      ? 'bg-primary text-white'
                      : outOfRange
                      ? 'text-gray-200 cursor-not-allowed'
                      : 'bg-gray-50 text-gray-600 hover:bg-primary/10 hover:text-primary'
                  }`}
                >
                  {y}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* 月份网格 */}
      {step === 'month' && pageStart !== null && (
        <>
          <div className="mb-3 px-1">
            <span className="text-xs text-primary font-medium">{pageStart}年</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {MONTHS.map((label, i) => {
              const monthNum = i + 1
              const isCurrent = parsed?.year === pageStart && parsed?.month === monthNum
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => selectMonth(monthNum)}
                  className={`h-10 rounded-xl text-sm font-medium transition-colors ${
                    isCurrent
                      ? 'bg-primary text-white'
                      : 'bg-gray-50 text-gray-600 hover:bg-primary/10 hover:text-primary'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* 特殊按钮：至今 */}
      {presentLabel && step === 'year' && (
        <button
          type="button"
          onClick={() => { onChange('至今'); closeCalendar() }}
          className="mt-3 w-full h-10 rounded-xl bg-gray-50 text-gray-500 hover:bg-primary/10 hover:text-primary text-sm font-medium transition-colors"
        >
          {presentLabel}
        </button>
      )}
    </div>
  ) : null

  return (
    <div className="relative w-full">
      {/* 触发按钮 */}
      <button
        ref={buttonRef}
        type="button"
        onClick={openCalendar}
        className="w-full h-9 px-3 border border-gray-200 rounded-md bg-white hover:border-primary focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all text-left"
      >
        <span className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className={`flex-1 text-sm truncate ${value ? 'text-gray-700' : 'text-gray-400'}`}>
            {value === '至今' ? '至今' : (formatDisplay(value) || placeholder)}
          </span>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {inBrowser ? createPortal(panelContent, document.body) : null}
    </div>
  )
}

export default YearMonthPicker
