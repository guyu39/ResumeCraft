// ============================================================
// ClassicTemplate — 经典单栏模板
// 2026-06-05 移除 AdminCommentBadge / AdminCommentPanel（改用评论面板）
// 公共渲染（registry / 样式变量）已抽到 preview/ 下共用工具
// ============================================================

import React from 'react'
import { Resume, PersonalData } from '@/types/resume'
import PersonalPreview from './PersonalPreview'
import { renderResumeModule } from './moduleRegistry'
import { useResumeStyleVars } from './useResumeStyleVars'

interface ClassicTemplateProps {
  resume: Resume
  renderItemCommentIcon?: (moduleId: string, itemIndex: number) => React.ReactNode
  renderItemCommentPanel?: (moduleId: string, itemIndex: number) => React.ReactNode
  className?: string
  overrideMinHeight?: string
}

const ClassicTemplate: React.FC<ClassicTemplateProps> = ({
  resume,
  renderItemCommentIcon,
  renderItemCommentPanel,
  className = "",
  overrideMinHeight,
}) => {
  const { modules, themeColor } = resume
  const visibleModules = modules.filter((m) => m.visible)
  const personalModule = visibleModules.find((m) => m.type === "personal")
  const otherModules = visibleModules.filter((m) => m.type !== "personal")
  const { style, dataAttrs } = useResumeStyleVars(resume, { overrideMinHeight })

  return (
    <div className={`w-full bg-white resume-preview-content ${className}`} {...dataAttrs} style={style}>
      {personalModule && (
        <PersonalPreview moduleId={personalModule.id} data={personalModule.data as PersonalData} themeColor={themeColor} />
      )}
      {otherModules.map((m) =>
        renderResumeModule(m, { themeColor, renderItemCommentIcon, renderItemCommentPanel })
      )}
    </div>
  )
}

export default ClassicTemplate
