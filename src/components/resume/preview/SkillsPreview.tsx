// ============================================================
// SkillsPreview — 技能特长预览
// 富文本展示（兼容历史 tags/bars 数据）
// ============================================================

import React from 'react'
import { SkillsData } from '@/types/resume'
import ModuleSection from './ModuleSection'
import RichTextPreview from '../../common/RichTextPreview'

interface SkillsPreviewProps {
  data: SkillsData
  themeColor: string
}

const SkillsPreview: React.FC<SkillsPreviewProps> = ({ data, themeColor }) => {
  const content = data.content?.trim() ?? ''
  const fallbackItems = data.items ?? []
  const fallbackText = fallbackItems.map((item) => `- ${item.name}`).join('\n')
  const renderText = content || fallbackText

  if (!renderText) {
    return (
      <ModuleSection title="专业技能" themeColor={themeColor}>
        <p className="text-[9pt] text-gray-300 italic">请填写专业技能</p>
      </ModuleSection>
    )
  }

  return (
    <ModuleSection title="专业技能" themeColor={themeColor}>
      <RichTextPreview text={renderText} className="text-[9.5pt] text-gray-700" />
    </ModuleSection>
  )
}

export default SkillsPreview
