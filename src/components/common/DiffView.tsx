// ============================================================
// DiffView — 字段级差异展示（git 风格统一 diff）
// 从 CenterPanel 的快照对比弹窗内联逻辑抽出，供快照对比与多端冲突弹窗共用。
// 输入已定向好的 FieldDiff[]（before=旧/左，after=新/右），不关心快照上下文。
// ============================================================

import React from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { FieldDiff, DiffStats } from '@/api/resume'

interface DiffViewProps {
  diffs: FieldDiff[]
  stats?: DiffStats
  emptyHint?: string
  className?: string
}

/** 提取文本行（处理 HTML）：优先按 <li> 拆分，否则按换行 */
function extractLines(html: string): { lines: string[]; isList: boolean; wrapper: string[] } {
  const str = html || ''
  const ulMatch = str.match(/<ul[^>]*>([\s\S]*)<\/ul>/i) || str.match(/<ol[^>]*>([\s\S]*)<\/ol>/i)
  if (ulMatch) {
    const prefix = str.slice(0, str.indexOf(ulMatch[0]))
    const suffix = str.slice(str.indexOf(ulMatch[0]) + ulMatch[0].length)
    const items: string[] = []
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi
    let m: RegExpExecArray | null
    while ((m = liRegex.exec(ulMatch[1])) !== null) {
      items.push(m[0])
    }
    return { lines: items, isList: true, wrapper: [prefix, `<ul>`, `</ul>`, suffix] }
  }
  const textLines = str.split(/\n/).filter((l) => l.trim() !== '')
  return { lines: textLines.length > 0 ? textLines : [str], isList: false, wrapper: [str] }
}

function norm(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 生成 git 风格统一 diff HTML（+ 新增绿色，− 删除红色） */
export function renderUnifiedDiffHtml(before: string, after: string): string {
  const a = extractLines(before)
  const b = extractLines(after)

  const aNorm = a.lines.map(norm)
  const bNorm = b.lines.map(norm)
  const usedB = new Set<number>()
  const pairs: Array<{ type: '-' | '+' | '='; line: string }> = []

  const matchedA = new Set<number>()
  for (let i = 0; i < aNorm.length; i++) {
    for (let j = 0; j < bNorm.length; j++) {
      if (!usedB.has(j) && aNorm[i] === bNorm[j]) {
        matchedA.add(i)
        usedB.add(j)
        break
      }
    }
  }

  for (let i = 0; i < a.lines.length; i++) {
    if (matchedA.has(i)) {
      for (let j = 0; j < b.lines.length; j++) {
        if (aNorm[i] === bNorm[j]) {
          pairs.push({ type: '=', line: a.lines[i] })
          break
        }
      }
    } else {
      pairs.push({ type: '-', line: a.lines[i] })
    }
  }
  for (let j = 0; j < b.lines.length; j++) {
    if (!usedB.has(j)) {
      pairs.push({ type: '+', line: b.lines[j] })
    }
  }

  if (a.isList) {
    const diffParts = pairs.map((p) => {
      const bgClass = p.type === '-' ? 'bg-red-100' : p.type === '+' ? 'bg-green-100' : ''
      const prefix = p.type === '-' ? '<span class="text-red-600 font-bold mr-1">−</span>' :
        p.type === '+' ? '<span class="text-green-600 font-bold mr-1">+</span>' : ''
      return `<li class="${bgClass} px-1 py-0.5 rounded-sm my-px">${prefix}${p.line.replace(/<\/?li[^>]*>/gi, '')}</li>`
    })
    return a.wrapper[0] + a.wrapper[1] + diffParts.join('') + a.wrapper[2] + (a.wrapper[3] || '')
  }

  return pairs
    .map((p) => {
      const bgClass = p.type === '-' ? 'bg-red-100' : p.type === '+' ? 'bg-green-100' : ''
      const prefix = p.type === '-' ? '<b class="text-red-600">− </b>' : p.type === '+' ? '<b class="text-green-600">+ </b>' : '  '
      return `<div class="${bgClass} px-1 py-0.5 rounded-sm my-px font-mono whitespace-pre-wrap">${prefix}${escapeHtml(p.line)}</div>`
    })
    .join('')
}

const DiffView: React.FC<DiffViewProps> = ({ diffs, stats, emptyHint = '两个版本内容相同', className = '' }) => {
  return (
    <div className={className}>
      {stats && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          {stats.modulesRemoved > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-600">
              − 删除 {stats.modulesRemoved} 个模块
            </span>
          )}
          {stats.modulesAdded > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 font-medium text-green-600">
              + 新增 {stats.modulesAdded} 个模块
            </span>
          )}
          <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-600">
            修改 {stats.modulesModified} 个模块
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">
            {stats.fieldsChanged} 处字段
          </span>
        </div>
      )}
      {diffs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <CheckCircle2 className="mb-3 h-10 w-10 text-green-400" />
          <p className="text-sm">{emptyHint}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {diffs.map((d, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/50 px-4 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{d.moduleType}</span>
                <span className="text-slate-300">·</span>
                <span className="text-xs text-slate-500">{d.field}</span>
              </div>
              <div
                className="diff-content px-4 py-3 text-xs leading-relaxed"
                dangerouslySetInnerHTML={{ __html: renderUnifiedDiffHtml(String(d.before ?? ''), String(d.after ?? '')) }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default DiffView
