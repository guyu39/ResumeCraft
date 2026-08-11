// ============================================================
// 投递分析图表共享主题
// 漏斗语义色为全站单一事实来源：投递=primary蓝 / 笔试=indigo / 面试=amber / Offer=emerald
// 各段对比分明且对白底 ≥3:1，满足 WCAG AA（大字号/图形元素）
// ============================================================

export const CHART_COLOR = {
  submitted: '#1A56DB',
  writtenTest: '#6366F1',
  interview: '#F59E0B',
  offer: '#10B981',
} as const

export const chartTooltipStyle = {
  borderRadius: 12,
  border: '1px solid #E2E8F0',
  boxShadow: '0 6px 20px rgba(15,23,42,0.10)',
  fontSize: 12,
  padding: '8px 10px',
}
