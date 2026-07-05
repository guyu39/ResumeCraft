// ============================================================
// TimeRangePicker — 时间段选择器（开始 ～ 结束）
// 复用已验证可用的 StyledSelect，保证展开面板样式和功能一致。
// ============================================================

import StyledSelect from './StyledSelect'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '15', '30', '45']

const HOUR_OPTIONS = HOURS.map((h) => ({ label: h, value: h }))
const MINUTE_OPTIONS = MINUTES.map((m) => ({ label: m, value: m }))

interface TimeRangePickerProps {
  startHour: string
  startMinute: string
  endHour: string
  endMinute: string
  onChangeStart: (hour: string, minute: string) => void
  onChangeEnd: (hour: string, minute: string) => void
  endBeforeStart?: boolean
  className?: string
}

const TimeRangePicker: React.FC<TimeRangePickerProps> = ({
  startHour, startMinute, endHour, endMinute,
  onChangeStart, onChangeEnd, endBeforeStart = false, className = '',
}) => {
  const errorRing = 'rounded-full font-medium ring-1 ring-red-200 bg-red-50 text-red-700'

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="min-w-[4.5rem]"><StyledSelect size="compact" value={startHour} onChange={(h) => onChangeStart(h, startMinute)} options={HOUR_OPTIONS} /></div>
      <span className="text-sm font-medium text-slate-400">:</span>
      <div className="min-w-[4.5rem]"><StyledSelect size="compact" value={startMinute} onChange={(m) => onChangeStart(startHour, m)} options={MINUTE_OPTIONS} /></div>
      <span className="mx-1 text-sm text-slate-300">—</span>
      <div className="min-w-[4.5rem]"><StyledSelect size="compact" value={endHour} onChange={(h) => onChangeEnd(h, endMinute)} options={HOUR_OPTIONS} buttonClassName={endBeforeStart ? errorRing : ''} /></div>
      <span className="text-sm font-medium text-slate-400">:</span>
      <div className="min-w-[4.5rem]"><StyledSelect size="compact" value={endMinute} onChange={(m) => onChangeEnd(endHour, m)} options={MINUTE_OPTIONS} buttonClassName={endBeforeStart ? errorRing : ''} /></div>
    </div>
  )
}

export default TimeRangePicker
