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
  renderItemCommentIcon?: (itemIndex: number) => React.ReactNode
  renderItemCommentPanel?: (itemIndex: number) => React.ReactNode
}

const SkillsPreview: React.FC<SkillsPreviewProps> = ({ data, themeColor, title = '专业技能', moduleId, renderItemCommentIcon, renderItemCommentPanel }) => {
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
      <div>
        <div className="relative">
          {renderItemCommentIcon && (
            <div className="absolute -left-12 top-0.5">{renderItemCommentIcon(0)}</div>
          )}
          <div>
            <RichTextPreview text={renderText} className="text-[9.5pt] text-gray-700" />
          </div>
        </div>
        {renderItemCommentPanel?.(0)}
      </div>
    </ModuleSection>
  )
}

export default SkillsPreview
