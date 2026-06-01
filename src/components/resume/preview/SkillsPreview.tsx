// ============================================================
// SkillsPreview — 技能特长预览
// 富文本展示（兼容历史 tags/bars 数据）
// ============================================================

import React from 'react'
import { SkillsData } from '@/types/resume'
import ModuleSection from './ModuleSection'
import RichTextPreview from '../../common/RichTextPreview'
import { useI18n } from '@/hooks/useI18n'

interface SkillsPreviewProps {
  data: SkillsData
  themeColor: string
  title?: string
  moduleId?: string
}

const SkillsPreview: React.FC<SkillsPreviewProps> = ({ data, themeColor, title = '专业技能', moduleId }) => {
  const { t } = useI18n()
  const content = data.content?.trim() ?? ''
  const fallbackItems = data.items ?? []
  const fallbackText = fallbackItems.map((item) => `- ${item.name}`).join('\n')
  const renderText = content || fallbackText

  if (!renderText) {
    return (
      <ModuleSection title={title} themeColor={themeColor} moduleId={moduleId}>
        <p className="text-[9pt] text-gray-300 italic">{t('skills.fillSkills')}</p>
      </ModuleSection>
    )
  }

  return (
    <ModuleSection title={title} themeColor={themeColor} moduleId={moduleId}>
      <RichTextPreview text={renderText} className="text-[9.5pt] text-gray-700" />
    </ModuleSection>
  )
}

export default SkillsPreview
