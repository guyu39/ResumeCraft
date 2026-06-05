// ============================================================
// AIEngineeringPreview — AI 工程预览组件（多项目）
// ============================================================

import React from 'react'
import ModuleSection from './ModuleSection'
import { useI18n } from '@/hooks/useI18n'
import type { AIEngineeringData } from '@/types/resume'
import { AI_STANDARD_LABELS } from '@/types/resume'

interface Props {
  data: AIEngineeringData
  themeColor: string
  title?: string
  moduleId?: string
  renderItemCommentIcon?: (itemIndex: number) => React.ReactNode
  renderItemCommentPanel?: (itemIndex: number) => React.ReactNode
}

const AIEngineeringPreview: React.FC<Props> = ({ data, themeColor, title = 'AI 工程', moduleId, renderItemCommentIcon, renderItemCommentPanel }) => {
  const { t } = useI18n()
  const items = data?.items?.length ? data.items : []
  if (!items.length) {
    return <ModuleSection title={title} themeColor={themeColor} moduleId={moduleId}><p className="text-[9pt] text-gray-300 italic">{t('ai-engineering.empty')}</p></ModuleSection>
  }

  return (
    <ModuleSection title={title} themeColor={themeColor} moduleId={moduleId}>
      <div className="space-y-3.5">
        {items.map((it, idx) => (
          <div key={it.id || idx}>
            <div className="relative">
              {renderItemCommentIcon && (
                <div className="absolute -left-12 top-0.5">{renderItemCommentIcon(idx)}</div>
              )}
              <div className="flex-1 min-w-0 text-[9pt]">
                {/* 第一行：命名 + 角色 + 时间 */}
                <div className="flex items-center gap-1.5 mb-0.5">
                  {it.practiceName && <span className="font-semibold text-gray-800">{it.practiceName}</span>}
                  {it.role && <span className="text-gray-500">· {it.role}</span>}
                  {it.timeRange && <span className="text-gray-400 text-[8pt] ml-auto">{it.timeRange}</span>}
                </div>

                {/* 第二行：项目地址（完整 URL） */}
                {it.projectUrl && (
                  <div className="text-[8pt] text-gray-500 mb-0.5 break-all">
                    项目地址：<a href={it.projectUrl} target="_blank" rel="noreferrer" className="text-blue-500 !no-underline">{it.projectUrl}</a>
                  </div>
                )}

                {/* 工具链 */}
                {it.toolchain && it.toolchain.length > 0 && (
                  <div className="text-[8pt] font-semibold text-gray-700 mb-0.5">工具链：{it.toolchain.join('、')}</div>
                )}

                {/* 规范标签 */}
                {it.standards && it.standards.length > 0 && (
                  <div className="flex flex-wrap gap-1 text-[8pt] mb-0.5">
                    {it.standards.map(s => <span key={s} className="px-1 py-0 bg-gray-100 text-gray-700 font-semibold rounded">{AI_STANDARD_LABELS[s] || s}</span>)}
                  </div>
                )}

                {/* 场景描述 */}
                {it.scenario && <div className="text-gray-600 leading-relaxed mb-0.5" dangerouslySetInnerHTML={{ __html: it.scenario }} />}

                {/* 量化指标 */}
                {it.efficiency && it.efficiency.filter(m => m.label).length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[8pt] text-gray-500">
                    {it.efficiency.filter(m => m.label).map((m, i) => <span key={i}>{m.label}: <b className="text-gray-700">{m.value}</b></span>)}
                  </div>
                )}

                {/* 团队资产 */}
                {it.assets && it.assets.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5 text-[8pt]">
                    {it.assets.map((a, i) => <span key={i} className="px-1 py-0 bg-green-50 text-green-700 rounded">{a}</span>)}
                  </div>
                )}
              </div>
            </div>
            {renderItemCommentPanel?.(idx)}
          </div>
        ))}
      </div>
    </ModuleSection>
  )
}

export default AIEngineeringPreview
