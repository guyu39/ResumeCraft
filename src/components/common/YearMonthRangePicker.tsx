// ============================================================
// YearMonthRangePicker — 年月范围选择器（两个 YearMonthPicker 并排）
// 内建校验：开始时间不能晚于结束时间（"至今"视为有效结束值）
// ============================================================

import React, { useMemo } from 'react'
import NoticeCenter from './NoticeCenter'
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
  const dateError = useMemo(() => {
    if (startDate && endDate && endDate !== '至今' && startDate > endDate) {
      return '结束时间不能早于开始时间'
    }
    return null
  }, [startDate, endDate])

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
        <p>开始时间</p>
        <p>结束时间（可不填）</p>
      </div>

      <div className={`grid grid-cols-2 gap-2 items-start ${dateError ? '[&_button]:border-red-400 [&_button]:ring-2 [&_button]:ring-red-200' : ''}`}>
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

      {dateError && (
        <NoticeCenter
          compact
          items={[
            {
              id: 'date-range-error',
              tone: 'error',
              title: '时间范围有冲突',
              description: dateError,
            },
          ]}
        />
      )}
    </div>
  )
}

export default YearMonthRangePicker
