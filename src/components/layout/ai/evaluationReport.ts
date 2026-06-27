// ============================================================
// evaluationReport — 把简历评估结果渲染成自包含 HTML 片段，
// 供前端 html2canvas + jsPDF 离屏截图生成 PDF（无打印对话框、无 URL 页脚）。
// 样式全内联且避免现代 CSS（渐变/oklch），保证 html2canvas 兼容。
// ============================================================

import type { ResumeEvaluateOutput } from '@/ai'

const SEVERITY_TEXT: Record<string, string> = { high: '高', medium: '中', low: '低' }
const SEVERITY_COLOR: Record<string, string> = {
  high: '#dc2626',
  medium: '#d97706',
  low: '#2563eb',
}

function scoreColor(score: number): string {
  if (score >= 85) return '#16a34a'
  if (score >= 70) return '#d97706'
  return '#dc2626'
}

function esc(s: string): string {
  return (s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

/**
 * 生成评估报告 HTML 片段（内联样式，宽度固定 794px ≈ A4）。
 * 返回的是 body 内部 HTML，调用方挂到离屏容器后用 html2canvas 截图。
 */
export function buildEvaluationReportHTML(
  result: ResumeEvaluateOutput,
  meta: { resumeTitle?: string; evaluatedAt?: number },
): string {
  const title = esc(meta.resumeTitle || '简历')
  const dateStr = meta.evaluatedAt ? new Date(meta.evaluatedAt).toLocaleString('zh-CN') : new Date().toLocaleString('zh-CN')

  const dimensions = (result.dimensions ?? [])
    .map((d) => `
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span style="font-weight:600">${esc(d.label)}</span>
          <span style="font-weight:700;color:${scoreColor(d.score)}">${d.score}</span>
        </div>
        <div style="height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${Math.max(0, Math.min(100, d.score))}%;background:${scoreColor(d.score)}"></div>
        </div>
        ${d.comment ? `<p style="font-size:11px;color:#6b7280;margin-top:3px">${esc(d.comment)}</p>` : ''}
      </div>`)
    .join('')

  const issues = (result.issues ?? [])
    .map((i) => `
      <div style="border:1px solid #f3f4f6;border-radius:8px;padding:10px 12px;margin-bottom:8px;background:#fafafa">
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:11px;font-weight:600;color:${SEVERITY_COLOR[i.severity] ?? SEVERITY_COLOR.medium}">${SEVERITY_TEXT[i.severity] ?? '中'}优先级</span>
          <span style="font-size:12px;font-weight:600">${esc(i.title)}</span>
        </div>
        ${i.description ? `<p style="font-size:11px;color:#6b7280;margin-top:3px">${esc(i.description)}</p>` : ''}
        ${i.suggestion ? `<p style="font-size:11px;color:#2563eb;margin-top:3px">建议：${esc(i.suggestion)}</p>` : ''}
      </div>`)
    .join('')

  const actions = (result.actionItems ?? [])
    .map((a) => `<li style="font-size:12px;margin-bottom:4px">${esc(a)}</li>`)
    .join('')

  const sectionTitle = (t: string) =>
    `<h2 style="font-size:14px;color:#111827;margin:18px 0 10px;padding-left:8px;border-left:3px solid #6366f1">${t}</h2>`

  return `
  <div style="font-family:'Microsoft YaHei','PingFang SC',sans-serif;color:#1f2937;font-size:13px;line-height:1.6;background:#ffffff;padding:32px 40px;width:794px;box-sizing:border-box">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #6366f1;padding-bottom:12px;margin-bottom:20px">
      <h1 style="font-size:20px;color:#111827">${title} — AI 评估报告</h1>
      <div style="font-size:11px;color:#9ca3af;text-align:right">评估时间：${dateStr}${result.model ? `<br>模型：${esc(result.model)}` : ''}</div>
    </div>
    <div style="display:flex;align-items:center;gap:20px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:18px 24px;margin-bottom:22px">
      <div>
        <div style="font-size:44px;font-weight:700;line-height:1;color:${scoreColor(result.overallScore)}">${result.overallScore}</div>
        <div style="font-size:14px;color:#6b7280;margin-top:4px">综合评级 ${esc(result.level || '-')}</div>
      </div>
      <div style="flex:1;font-size:12px;color:#4b5563">${esc(result.summary || '')}</div>
    </div>
    ${dimensions ? sectionTitle('维度分析') + dimensions : ''}
    ${issues ? sectionTitle('问题清单') + issues : ''}
    ${actions ? sectionTitle('改进建议') + `<ul style="padding-left:20px">${actions}</ul>` : ''}
    <div style="margin-top:24px;padding-top:10px;border-top:1px solid #f3f4f6;font-size:10px;color:#c0c4cc;text-align:center">由 ResumeCraft AI 生成，仅供参考</div>
  </div>`
}
