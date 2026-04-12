// ============================================================
// ModernDateRangePicker — 基于 react-datepicker 的日期范围选择器
// ============================================================

import React, { forwardRef } from 'react'
import { createPortal } from 'react-dom'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { Calendar } from 'lucide-react'

interface ModernDateRangePickerProps {
  startDate: string
  endDate: string
  onChange: (start: string, end: string) => void
  pastYears?: number
  futureYears?: number
}

const ModernDateRangePicker: React.FC<ModernDateRangePickerProps> = ({
  startDate,
  endDate,
  onChange,
  pastYears = 30,
  futureYears = 0,
}) => {
  const inBrowser = typeof document !== 'undefined'
  const currentYear = new Date().getFullYear()

  const minYear = currentYear - (pastYears - 1)
  const maxYear = currentYear + futureYears
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i)

  const parseYearMonth = (raw: string): Date | null => {
    if (!/^\d{4}-\d{2}$/.test(raw)) return null
    const [yearText, monthText] = raw.split('-')
    const year = Number(yearText)
    const month = Number(monthText)
    if (!year || month < 1 || month > 12) return null
    return new Date(year, month - 1, 1)
  }

  const formatYearMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
  }

  const start = parseYearMonth(startDate)
  const end = parseYearMonth(endDate)

  interface PickerInputProps {
    value?: string
    onClick?: () => void
    placeholder?: string
  }

  const formatDatePickerValue = (raw?: string) => {
    if (!raw) return ''
    if (/^\d{4}-\d{2}$/.test(raw)) {
      const [year, month] = raw.split('-')
      return `${year}年${month}月`
    }
    return raw
  }

  const PickerInput = forwardRef<HTMLButtonElement, PickerInputProps>(({ value, onClick, placeholder }, ref) => (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className="w-full h-9 px-3 border border-gray-200 rounded-md bg-white hover:border-primary focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all text-left"
    >
      <span className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <span className={`flex-1 text-sm truncate ${value ? 'text-gray-700' : 'text-gray-400'}`}>
          {formatDatePickerValue(value) || placeholder}
        </span>
      </span>
    </button>
  ))
  PickerInput.displayName = 'RangePickerInput'

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
        <p>开始时间</p>
        <p>结束时间（可不填）</p>
      </div>

      <div className="grid grid-cols-2 gap-2 items-start">
        <DatePicker
          selected={start}
          onChange={(date: Date | null) => onChange(date instanceof Date ? formatYearMonth(date) : '', endDate)}
          showMonthYearPicker
          dateFormat="yyyy-MM"
          minDate={new Date(minYear, 0, 1)}
          maxDate={new Date(maxYear, 11, 1)}
          wrapperClassName="w-full"
          renderCustomHeader={({ date, changeYear, decreaseMonth, increaseMonth, prevMonthButtonDisabled, nextMonthButtonDisabled }) => (
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-100">
              <button type="button" onClick={decreaseMonth} disabled={prevMonthButtonDisabled} className="px-2 py-1 text-xs rounded hover:bg-gray-100 disabled:opacity-40">上一月</button>
              <select value={date.getFullYear()} onChange={(event) => changeYear(Number(event.target.value))} className="h-8 px-2 text-xs border border-gray-200 rounded-md bg-white">
                {years.map((option) => (<option key={option} value={option}>{option}年</option>))}
              </select>
              <button type="button" onClick={increaseMonth} disabled={nextMonthButtonDisabled} className="px-2 py-1 text-xs rounded hover:bg-gray-100 disabled:opacity-40">下一月</button>
            </div>
          )}
          customInput={<PickerInput placeholder="开始年月" />}
          calendarClassName="resume-datepicker"
          popperClassName="resume-datepicker-popper"
          popperContainer={({ children }) =>
            inBrowser ? createPortal(children, document.body) : children
          }
        />

        <DatePicker
          selected={end}
          onChange={(date: Date | null) => onChange(startDate, date instanceof Date ? formatYearMonth(date) : '')}
          showMonthYearPicker
          dateFormat="yyyy-MM"
          minDate={start ?? new Date(minYear, 0, 1)}
          maxDate={new Date(maxYear, 11, 1)}
          wrapperClassName="w-full"
          renderCustomHeader={({ date, changeYear, decreaseMonth, increaseMonth, prevMonthButtonDisabled, nextMonthButtonDisabled }) => (
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-100">
              <button type="button" onClick={decreaseMonth} disabled={prevMonthButtonDisabled} className="px-2 py-1 text-xs rounded hover:bg-gray-100 disabled:opacity-40">上一月</button>
              <select value={date.getFullYear()} onChange={(event) => changeYear(Number(event.target.value))} className="h-8 px-2 text-xs border border-gray-200 rounded-md bg-white">
                {years.map((option) => (<option key={option} value={option}>{option}年</option>))}
              </select>
              <button type="button" onClick={increaseMonth} disabled={nextMonthButtonDisabled} className="px-2 py-1 text-xs rounded hover:bg-gray-100 disabled:opacity-40">下一月</button>
            </div>
          )}
          customInput={<PickerInput placeholder={endDate === '至今' ? '至今' : '不填默认为至今'} />}
          calendarClassName="resume-datepicker"
          popperClassName="resume-datepicker-popper"
          popperContainer={({ children }) =>
            inBrowser ? createPortal(children, document.body) : children
          }
        />
      </div>


      {/* <p className="text-xs text-gray-400">
        {formatDisplay(startDate, '开始年月')} - {formatDisplay(endDate || '至今', '至今')}
      </p> */}
    </div>
  )
}

export default ModernDateRangePicker