// ============================================================
// YearMonthPicker — 年月日选择器（支持日级别精度，向后兼容 YYYY-MM）
// 步骤：选年 → 选月 → （可选）选日
// ============================================================

import React, { useState, useRef, useEffect, useMemo } from "react"
import { createPortal } from "react-dom"
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"

interface YearMonthPickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minYear?: number
  maxYear?: number
  presentLabel?: string
  pastYears?: number
  futureYears?: number
  enableDay?: boolean
}

const MONTHS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"]
const YEARS_PER_PAGE = 9
const DAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"]
type Step = "year" | "month" | "day"

const YearMonthPicker: React.FC<YearMonthPickerProps> = ({
  value, onChange, placeholder, minYear, maxYear,
  presentLabel, pastYears = 60, futureYears = 1, enableDay = false,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [panelPosition, setPanelPosition] = useState<{ top: number; left: number } | null>(null)
  const [step, setStep] = useState<Step>("year")
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [pageStart, setPageStart] = useState<number | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inBrowser = typeof document !== "undefined"

  const currentYear = new Date().getFullYear()
  const min = minYear ?? currentYear - pastYears
  const max = maxYear ?? currentYear + futureYears

  const parsed = useMemo(() => {
    if (!value || value === "至今") return null
    const ddMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (ddMatch) return { year: Number(ddMatch[1]), month: Number(ddMatch[2]), day: Number(ddMatch[3]) }
    const mmMatch = value.match(/^(\d{4})-(\d{2})$/)
    if (mmMatch) return { year: Number(mmMatch[1]), month: Number(mmMatch[2]), day: null }
    return null
  }, [value])

  useEffect(() => {
    if (isOpen && pageStart === null && parsed) {
      setPageStart(min + Math.floor((parsed.year - min) / YEARS_PER_PAGE) * YEARS_PER_PAGE)
    }
  }, [isOpen, parsed, min, pageStart])

  const openCalendar = () => {
    const initialYear = parsed?.year ?? currentYear
    setPageStart(min + Math.floor((initialYear - min) / YEARS_PER_PAGE) * YEARS_PER_PAGE)
    setSelectedYear(parsed?.year ?? null)
    setStep("year")
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPanelPosition({ top: rect.bottom + 6, left: rect.left })
    }
    setIsOpen(true)
  }

  const closeCalendar = () => { setIsOpen(false); setStep("year") }
  const prevPage = () => { if (pageStart !== null) setPageStart(Math.max(min, pageStart - YEARS_PER_PAGE)) }
  const nextPage = () => { if (pageStart !== null && pageStart + YEARS_PER_PAGE <= max) setPageStart(pageStart + YEARS_PER_PAGE) }
  const selectYear = (year: number) => { setSelectedYear(year); setStep("month") }
  const selectMonth = (month: number) => {
    if (selectedYear === null) return
    if (enableDay) { setStep("day") }
    else { onChange(selectedYear + "-" + String(month).padStart(2, "0")); closeCalendar() }
  }
  const selectDay = (day: number) => {
    if (selectedYear === null) return
    const month = parsed?.month ?? 1
    onChange(selectedYear + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0"))
    closeCalendar()
  }

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (buttonRef.current?.contains(e.target as Node)) return
      if (panelRef.current?.contains(e.target as Node)) return
      closeCalendar()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closeCalendar() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [isOpen])

  const effPlaceholder = placeholder || (enableDay ? "选择日期" : "选择年月")

  const formatDisplay = (v: string) => {
    if (!v || v === "至今") return ""
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, d] = v.split("-"); return y + "年" + m + "月" + d + "日" }
    if (/^\d{4}-\d{2}$/.test(v)) { const [y, m] = v.split("-"); return y + "年" + m + "月" }
    return v
  }

  const pageYears = useMemo(() => {
    if (pageStart === null) return []
    const years: number[] = []
    for (let i = 0; i < YEARS_PER_PAGE; i++) years.push(pageStart + i)
    return years
  }, [pageStart])

  const isYearOutOfRange = (y: number) => y < min || y > max
  const canPrevPage = pageStart !== null && pageStart - YEARS_PER_PAGE >= min
  const canNextPage = pageStart !== null && pageStart + YEARS_PER_PAGE <= max

  const activeYearMonth = useMemo(() => {
    if (step !== "day") return null
    if (parsed?.year && parsed?.month) return { year: parsed.year, month: parsed.month }
    if (selectedYear !== null && parsed?.month) return { year: selectedYear, month: parsed.month }
    return selectedYear !== null ? { year: selectedYear, month: 1 } : null
  }, [step, parsed, selectedYear])

  const panelContent = isOpen ? (
    <div ref={panelRef} className="fixed z-[9999] bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 w-[300px]"
      style={panelPosition ? { top: panelPosition.top, left: panelPosition.left } : {}}>
      <div className="flex items-center justify-between mb-4">
        {step !== "year" ? (
          <button type="button" onClick={() => setStep(step === "day" ? "month" : "year")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
            <ChevronLeft className="w-4 h-4" />返回
          </button>
        ) : <div className="w-8" />}
        <span className="text-sm font-semibold text-gray-700">
          {step === "year" ? "选择年份" : step === "month" && selectedYear !== null ? selectedYear + "年" : activeYearMonth ? activeYearMonth.year + "年" + activeYearMonth.month + "月" : ""}
        </span>
        <button type="button" onClick={closeCalendar} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100">关闭</button>
      </div>

      {step === "year" && (
        <>
          <div className="flex items-center justify-center gap-3 mb-3">
            <button type="button" onClick={prevPage} disabled={!canPrevPage} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-30">
              <ChevronLeft className="w-4 h-4 text-gray-500" />
            </button>
            <span className="text-xs text-gray-400 w-20 text-center">{pageStart !== null ? pageStart + "–" + Math.min(pageStart + 8, max) : ""}</span>
            <button type="button" onClick={nextPage} disabled={!canNextPage} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-30">
              <ChevronRight className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {pageYears.map(y => {
              const out = isYearOutOfRange(y); const cur = parsed?.year === y
              return <button key={y} type="button" disabled={out} onClick={() => !out && selectYear(y)}
                className={"h-10 rounded-xl text-sm font-medium " + (cur ? "bg-primary text-white" : out ? "text-gray-200" : "bg-gray-50 text-gray-600 hover:bg-primary/10 hover:text-primary")}>{y}</button>
            })}
          </div>
        </>
      )}

      {step === "month" && selectedYear !== null && (
        <>
          <div className="mb-3 px-1"><span className="text-xs text-primary font-medium">{selectedYear}年</span></div>
          <div className="grid grid-cols-4 gap-2">
            {MONTHS.map((label, i) => {
              const mn = i + 1; const cur = parsed?.year === selectedYear && parsed?.month === mn
              return <button key={label} type="button" onClick={() => selectMonth(mn)}
                className={"h-10 rounded-xl text-sm font-medium " + (cur ? "bg-primary text-white" : "bg-gray-50 text-gray-600 hover:bg-primary/10 hover:text-primary")}>{label}</button>
            })}
          </div>
        </>
      )}

      {step === "day" && activeYearMonth && (
        <>
          <div className="mb-3 px-1"><span className="text-xs text-primary font-medium">{activeYearMonth.year}年{activeYearMonth.month}月</span></div>
          <div className="grid grid-cols-7 gap-1">
            {DAY_NAMES.map(n => <div key={n} className="h-7 flex items-center justify-center text-[10px] font-medium text-gray-400">{n}</div>)}
            {(() => {
              const { year, month } = activeYearMonth
              const totalDays = new Date(year, month, 0).getDate()
              const startDow = new Date(year, month - 1, 1).getDay()
              const cells: React.ReactNode[] = []
              for (let i = 0; i < startDow; i++) cells.push(<div key={"e" + i} className="h-9" />)
              for (let d = 1; d <= totalDays; d++) {
                const sel = parsed?.year === year && parsed?.month === month && parsed?.day === d
                const today = year === new Date().getFullYear() && month === new Date().getMonth() + 1 && d === new Date().getDate()
                cells.push(<button key={d} type="button" onClick={() => selectDay(d)}
                  className={"h-9 rounded-lg text-sm font-medium " + (sel ? "bg-primary text-white" : today ? "bg-primary/10 text-primary border border-primary/30" : "hover:bg-primary/10 hover:text-primary text-gray-600")}>{d}</button>)
              }
              return cells
            })()}
          </div>
        </>
      )}

      {presentLabel && step === "year" && (
        <button type="button" onClick={() => { onChange("至今"); closeCalendar() }}
          className="mt-3 w-full h-10 rounded-xl bg-gray-50 text-gray-500 hover:bg-primary/10 hover:text-primary text-sm font-medium">{presentLabel}</button>
      )}
    </div>
  ) : null

  return (
    <div className="relative w-full">
      <button ref={buttonRef} type="button" onClick={openCalendar}
        className="w-full h-9 px-3 border border-gray-200 rounded-md bg-white hover:border-primary focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all text-left">
        <span className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className={"flex-1 text-sm truncate " + (value ? "text-gray-700" : "text-gray-400")}>
            {value === "至今" ? "至今" : (formatDisplay(value) || effPlaceholder)}
          </span>
          <ChevronDown className={"w-4 h-4 text-gray-400 transition-transform " + (isOpen ? "rotate-180" : "")} />
        </span>
      </button>
      {inBrowser ? createPortal(panelContent, document.body) : null}
    </div>
  )
}

export default YearMonthPicker
