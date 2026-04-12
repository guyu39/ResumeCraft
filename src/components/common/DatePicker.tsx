// ============================================================
// DatePicker — YYYY-MM 月份选择器
// ============================================================

import React from 'react'

interface DatePickerProps {
  value: string   // YYYY-MM
  onChange: (value: string) => void
  error?: boolean
  disabled?: boolean
}

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  String(i + 1).padStart(2, '0')
)

const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  error = false,
  disabled = false,
}) => {
  // 分离 year 和 month
  const parts = value ? value.split('-') : ['', '']
  const year = parts[0]
  const month = parts[1] ?? ''

  const currentYear = new Date().getFullYear()
  const years = Array.from(
    { length: 30 },
    (_, i) => String(currentYear - 20 + i)
  )

  return (
    <div className="flex gap-1.5 items-center">
      {/* 年份 */}
      <select
        value={year}
        disabled={disabled}
        onChange={(e) => {
          const y = e.target.value
          if (!y) {
            onChange('')
          } else if (month) {
            onChange(`${y}-${month}`)
          } else {
            onChange(`${y}-01`)
          }
        }}
        className={`
          flex-1 h-9 px-2 text-sm border rounded-md bg-white outline-none
          transition-all duration-150 appearance-none
          ${disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'text-gray-800'}
          ${error ? 'border-red-400' : 'border-gray-200 focus:border-primary'}
        `}
      >
        <option value="">年</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>

      <span className="text-gray-400 text-sm">年</span>

      {/* 月份 */}
      <select
        value={month}
        disabled={disabled || !year}
        onChange={(e) => {
          const m = e.target.value
          if (!year) return
          onChange(`${year}-${m || '01'}`)
        }}
        className={`
          flex-1 h-9 px-2 text-sm border rounded-md bg-white outline-none
          transition-all duration-150 appearance-none
          ${disabled || !year ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'text-gray-800'}
          ${error ? 'border-red-400' : 'border-gray-200 focus:border-primary'}
        `}
      >
        <option value="">月</option>
        {MONTHS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <span className="text-gray-400 text-sm">月</span>
    </div>
  )
}

export default DatePicker
