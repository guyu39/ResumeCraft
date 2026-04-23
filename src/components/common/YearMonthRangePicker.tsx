// ============================================================
// YearMonthRangePicker — 年月范围选择器（两个 YearMonthPicker 并排）
// ============================================================

import React from 'react'
import YearMonthPicker from './YearMonthPicker'

interface YearMonthRangePickerProps {
  startDate: string
  endDate: string
  onChange: (start: string, end: string) => void
  startPlaceholder?: string
  endPlaceholder?: string
  pastYears?: number
  futureYears?: number
}

const YearMonthRangePicker: React.FC<YearMonthRangePickerProps> = ({
  startDate,
  endDate,
  onChange,
  startPlaceholder = '开始年月',
  endPlaceholder = '结束年月',
  pastYears = 60,
  futureYears = 1,
}) => {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
        <p>开始时间</p>
        <p>结束时间（可不填）</p>
      </div>

      <div className="grid grid-cols-2 gap-2 items-start">
        <YearMonthPicker
          value={startDate}
          onChange={(v) => onChange(v, endDate)}
          placeholder={startPlaceholder}
          pastYears={pastYears}
          futureYears={futureYears}
        />
        <YearMonthPicker
          value={endDate}
          onChange={(v) => onChange(startDate, v)}
          placeholder={endDate === '至今' ? '至今' : endPlaceholder}
          pastYears={pastYears}
          futureYears={futureYears}
          presentLabel="至今"
        />
      </div>
    </div>
  )
}

export default YearMonthRangePicker
