// ============================================================
// SummaryPreview — 自我评价预览
// ============================================================

import React from 'react'
import { SummaryData } from '@/types/resume'
import ModuleSection from './ModuleSection'
import RichTextPreview from '@/components/common/RichTextPreview'
import { useI18n } from '@/hooks/useI18n'

interface SummaryPreviewProps {
  data: SummaryData
  themeColor: string
  title?: string
  moduleId?: string
  renderItemCommentIcon?: (itemIndex: number) => React.ReactNode
  renderItemCommentPanel?: (itemIndex: number) => React.ReactNode
}

const SummaryPreview: React.FC<SummaryPreviewProps> = ({ data, themeColor, title = '自我评价', moduleId, renderItemCommentIcon, renderItemCommentPanel }) => {
  const { t } = useI18n()

  return (
    <ModuleSection title={title} themeColor={themeColor} moduleId={moduleId}>
      {data.content ? (
        <div>
          <div className="relative">
            {renderItemCommentIcon && (
              <div className="absolute -left-12 top-0.5">{renderItemCommentIcon(0)}</div>
            )}
            <div>
              <RichTextPreview
                text={data.content}
                className="text-[9.5pt] text-gray-700"
              />
            </div>
          </div>
          {renderItemCommentPanel?.(0)}
        </div>
      ) : (
        <p className="text-[9pt] text-gray-300 italic">{t('summary.fillSummary')}</p>
      )}
    </ModuleSection>
  )
}

export default SummaryPreview
