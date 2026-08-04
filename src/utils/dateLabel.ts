// 相对日期标签工具：今天/昨天/08-01 格式
// 用于首页日报简讯、GitHub 项目、个人项目推荐等条目的时间标识

// dateLabel 返回条目日期标签：
//   - 同一天 → 「今天」
//   - 昨天 → 「昨天」
//   - 7 天内 → 「MM-DD」 如 「08-01」
//   - 超过 7 天 → 返回 null（应由调用方过滤）
export function dateLabel(tsOrDate: number | string | undefined): string | null {
  const ts = resolveTs(tsOrDate)
  if (ts == null) return null

  const now = new Date()
  const target = new Date(ts)

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime()
  const dayDiff = Math.round((startOfToday - startOfTarget) / 86400000)

  if (dayDiff === 0) return '今天'
  if (dayDiff === 1) return '昨天'
  if (dayDiff >= 2 && dayDiff <= 6) {
    return `${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`
  }
  return null // 超过 7 天
}

// 是否在近 7 日内（含今天）
export function withinLast7Days(tsOrDate: number | string | undefined): boolean {
  const ts = resolveTs(tsOrDate)
  if (ts == null) return true // 无时间字段视为最新
  const startOfToday = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()
  return ts >= startOfToday - 6 * 86400000
}

function resolveTs(tsOrDate: number | string | undefined): number | null {
  if (tsOrDate == null) return null
  if (typeof tsOrDate === 'number') return tsOrDate
  // YYYY-MM-DD 字符串 → 当天零点时间戳
  const d = new Date(`${tsOrDate}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d.getTime()
}
