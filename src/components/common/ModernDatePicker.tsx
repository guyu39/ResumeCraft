// ============================================================
// ModernDatePicker — 基于 react-datepicker 的年月选择器
// ============================================================

import React, { forwardRef, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { Calendar, ChevronDown } from 'lucide-react'

interface ModernDatePickerProps {
  value: string   // YYYY-MM
  onChange: (value: string) => void
  placeholder?: string
  minYear?: number
  maxYear?: number
  showPresentOption?: boolean
}

const ModernDatePicker: React.FC<ModernDatePickerProps> = ({
  value,
  onChange,
  placeholder = '选择年月',
  minYear,
  maxYear,
  showPresentOption = true,
}) => {
  const inBrowser = typeof document !== 'undefined'
  const [isOpen, setIsOpen] = useState(false)
  const currentYear = new Date().getFullYear()

  const 最小年份 = minYear ?? currentYear - 20
  const 最大年份 = maxYear ?? currentYear + 9
  const years = useMemo(() => {
    if (最小年份 > 最大年份) return [最大年份]
    return Array.from({ length: 最大年份 - 最小年份 + 1 }, (_, i) => 最小年份 + i)
  }, [最小年份, 最大年份])

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

  const selectedDate = parseYearMonth(value)

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

  const PickerInput = forwardRef<HTMLButtonElement, PickerInputProps>(({ value: inputValue, onClick, placeholder }, ref) => (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className="w-full h-9 px-3 border border-gray-200 rounded-md bg-white hover:border-primary focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all text-left"
    >
      <span className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <span className={`flex-1 text-sm truncate ${inputValue || value === '至今' ? 'text-gray-700' : 'text-gray-400'}`}>
          {value === '至今' ? '至今' : (formatDatePickerValue(inputValue) || placeholder)}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </span>
    </button>
  ))
  PickerInput.displayName = 'PickerInput'

  return (
    <div className="relative w-full">
      <DatePicker
        selected={selectedDate}
        onChange={(date: Date | null) => {
          if (date instanceof Date) {
            onChange(formatYearMonth(date))
            return
          }
          onChange('')
        }}
        onCalendarOpen={() => setIsOpen(true)}
        onCalendarClose={() => setIsOpen(false)}
        open={isOpen}
        onClickOutside={() => setIsOpen(false)}
        showMonthYearPicker
        dateFormat="yyyy-MM"
        minDate={new Date(最小年份, 0, 1)}
        maxDate={new Date(最大年份, 11, 1)}
        wrapperClassName="w-full"
        renderCustomHeader={({ date, changeYear, decreaseMonth, increaseMonth, prevMonthButtonDisabled, nextMonthButtonDisabled }) => (
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-100">
            <button
              type="button"
              onClick={decreaseMonth}
              disabled={prevMonthButtonDisabled}
              className="px-2 py-1 text-xs rounded hover:bg-gray-100 disabled:opacity-40"
            >
              上一月
            </button>
            <select
              value={date.getFullYear()}
              onChange={(event) => changeYear(Number(event.target.value))}
              className="h-8 px-2 text-xs border border-gray-200 rounded-md bg-white"
            >
              {years.map((option) => (
                <option key={option} value={option}>{option}年</option>
              ))}
            </select>
            <button
              type="button"
              onClick={increaseMonth}
              disabled={nextMonthButtonDisabled}
              className="px-2 py-1 text-xs rounded hover:bg-gray-100 disabled:opacity-40"
            >
              下一月
            </button>
          </div>
        )}
        customInput={<PickerInput placeholder={placeholder} />}
        calendarClassName="resume-datepicker"
        popperClassName="resume-datepicker-popper"
        popperContainer={({ children }) =>
          inBrowser ? createPortal(children, document.body) : children
        }
      />

      {isOpen && (
        <div className="absolute z-30 mt-1 w-full pointer-events-none">
          <div className="pointer-events-auto flex justify-end gap-2 pr-1">
            {showPresentOption && (
              <button
                type="button"
                onClick={() => {
                  onChange('至今')
                  setIsOpen(false)
                }}
                className="h-7 px-2 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20"
              >
                至今
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onChange('')
                setIsOpen(false)
              }}
              className="h-7 px-2 text-xs rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
            >
              清除
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ModernDatePicker