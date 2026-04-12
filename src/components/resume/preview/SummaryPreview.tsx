// ============================================================
// SummaryPreview — 自我评价预览
// ============================================================

import React from 'react'
import { SummaryData } from '@/types/resume'
import ModuleSection from './ModuleSection'
import RichTextPreview from '@/components/common/RichTextPreview'

interface SummaryPreviewProps {
  data: SummaryData
  themeColor: string
}

const SummaryPreview: React.FC<SummaryPreviewProps> = ({ data, themeColor }) => {
  return (
    <ModuleSection title="自我评价" themeColor={themeColor}>
      {data.content ? (
        <RichTextPreview
          text={data.content}
          className="text-[9.5pt] text-gray-700"
        />
      ) : (
        <p className="text-[9pt] text-gray-300 italic">请填写自我评价</p>
      )}
    </ModuleSection>
  )
}

export default SummaryPreview
