// ============================================================
// ai/shared — 右侧 AI 面板共享的小工具（评分配色、严重度映射）
// 此前在 JDMatchPanel / ResumeScoreDrawer / InterviewPrepPanel 各复制一份，统一到此处。
// ============================================================

/** 按分数返回文字颜色 class：≥85 绿、≥70 琥珀、否则红 */
export const scoreClass = (score: number): string => {
  if (score >= 85) return 'text-green-600'
  if (score >= 70) return 'text-amber-600'
  return 'text-red-600'
}

export type Severity = 'high' | 'medium' | 'low'

/** 严重度 → 中文文案 */
export const severityTextMap: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

/** 严重度 → 标签配色 class */
export const severityClassMap: Record<string, string> = {
  high: 'border-red-100 bg-red-50 text-red-700',
  medium: 'border-amber-100 bg-amber-50 text-amber-700',
  low: 'border-blue-100 bg-blue-50 text-blue-700',
}
