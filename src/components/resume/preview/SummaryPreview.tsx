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
}

const SummaryPreview: React.FC<SummaryPreviewProps> = ({ data, themeColor, title = '自我评价', moduleId }) => {
  const { t } = useI18n()

  return (
    <ModuleSection title={title} themeColor={themeColor} moduleId={moduleId}>
      {data.content ? (
        <RichTextPreview
          text={data.content}
          className="text-[9.5pt] text-gray-700"
        />
      ) : (
        <p className="text-[9pt] text-gray-300 italic">{t('summary.fillSummary')}</p>
      )}
    </ModuleSection>
  )
}

export default SummaryPreview
