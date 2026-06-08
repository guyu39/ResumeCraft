// ============================================================
// YearMonthPicker — 年月日选择器（支持日级别精度，向后兼容 YYYY-MM）
// 步骤：选年 → 选月 → （可选）选日
// ============================================================

/** YearMonthPicker 属性 */
export interface YearMonthPickerProps {
  value: string           // YYYY-MM 或 YYYY-MM-DD
  onChange: (value: string) => void
  placeholder?: string
  minYear?: number
  maxYear?: number
  presentLabel?: string   // 特殊值如 "至今"，选中后直接触发 onChange
  pastYears?: number      // 往前往后多少年，默认60
  futureYears?: number
  enableDay?: boolean     // 是否开启日期级别选择（默认 false，仅年月）
}

