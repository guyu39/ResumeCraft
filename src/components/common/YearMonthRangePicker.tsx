﻿﻿﻿﻿﻿// ============================================================
// YearMonthRangePicker — 年月范围选择器（支持日级别精度）
// ============================================================

import React, { useMemo } from "react"
import NoticeCenter from "./NoticeCenter"
import YearMonthPicker from "./YearMonthPicker"

interface YearMonthRangePickerProps {
  startDate: string
  endDate: string
  onChange: (start: string, end: string) => void
  startPlaceholder?: string
  endPlaceholder?: string
  pastYears?: number
  futureYears?: number
  enableDay?: boolean
}

const YearMonthRangePicker: React.FC<YearMonthRangePickerProps> = ({
  startDate, endDate, onChange,
  startPlaceholder, endPlaceholder,
  pastYears = 60, futureYears = 1,
  enableDay = false,
}) => {
  const effStartPlaceholder = startPlaceholder || (enableDay ? "开始日期" : "开始年月")
  const effEndPlaceholder = endPlaceholder || (enableDay ? "结束日期" : "结束年月")

  const dateError = useMemo(() => {
    if (startDate && endDate && endDate !== "至今" && startDate > endDate) {
      return "结束时间不能早于开始时间"
    }
    return null
  }, [startDate, endDate])

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
        <p>开始时间</p>
        <p>结束时间</p>
      </div>

      <div className={"grid grid-cols-2 gap-2 items-start " + (dateError ? "[&_button]:border-red-400 [&_button]:ring-2 [&_button]:ring-red-200" : "")}>
        <YearMonthPicker
          value={startDate}
          onChange={(v) => onChange(v, endDate)}
          placeholder={effStartPlaceholder}
          pastYears={pastYears}
          futureYears={futureYears}
          enableDay={enableDay}
        />
        <YearMonthPicker
          value={endDate}
          onChange={(v) => onChange(startDate, v)}
          placeholder={endDate === "至今" ? "至今" : effEndPlaceholder}
          pastYears={pastYears}
          futureYears={futureYears}
          presentLabel="至今"
          enableDay={enableDay}
        />
      </div>

      {dateError && (
        <NoticeCenter compact items={[{ id: "date-range-error", tone: "error", title: "时间范围有冲突", description: dateError }]} />
      )}
    </div>
  )
}

export default YearMonthRangePicker
