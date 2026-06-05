// ============================================================
// ClassicTemplate — 经典单栏模板
// 2026-06-05 移除 AdminCommentBadge / AdminCommentPanel（改用评论面板）
// ============================================================

import React, { useCallback } from 'react'
import {
  Resume,
  DEFAULT_RESUME_STYLE_SETTINGS,
  PersonalData,
  EducationItem,
  WorkItem,
  ProjectItem,
  SkillsData,
  AwardItem,
  SummaryData,
  CertificateItem,
  PortfolioItem,
  LanguageItem,
  CustomData,
  AIEngineeringData,
} from '@/types/resume'
import PersonalPreview from './PersonalPreview'
import EducationPreview from './EducationPreview'
import WorkPreview from './WorkPreview'
import ProjectPreview from './ProjectPreview'
import SkillsPreview from './SkillsPreview'
import AwardsPreview from './AwardsPreview'
import SummaryPreview from './SummaryPreview'
import CertificatesPreview from './CertificatesPreview'
import PortfolioPreview from './PortfolioPreview'
import LanguagesPreview from './LanguagesPreview'
import CustomPreview from './CustomPreview'
import AIEngineeringPreview from './AIEngineeringPreview'

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
  const styleSettings = resume.styleSettings ?? DEFAULT_RESUME_STYLE_SETTINGS
  const visibleModules = modules.filter((m) => m.visible)
  const personalModule = visibleModules.find((m) => m.type === "personal")
  const otherModules = visibleModules.filter((m) => m.type !== "personal")

  // 分享页 / 外部回调
  const getIconRenderer = useCallback(
    (moduleId: string) => {
      if (renderItemCommentIcon) {
        return (idx: number) => renderItemCommentIcon(moduleId, idx)
      }
      return undefined
    },
    [renderItemCommentIcon]
  )

  const getPanelRenderer = useCallback(
    (moduleId: string) => {
      if (renderItemCommentPanel) {
        return (idx: number) => renderItemCommentPanel(moduleId, idx)
      }
      return undefined
    },
    [renderItemCommentPanel]
  )

  const renderModule = (module: typeof visibleModules[number]) => {
    const { type, id, data, title } = module
    const icon = getIconRenderer(id)
    const panel = getPanelRenderer(id)

    switch (type) {
      case 'education':
        return <EducationPreview key={id} moduleId={id} items={(data as { items: EducationItem[] }).items} themeColor={themeColor} title={title} renderItemCommentIcon={icon} renderItemCommentPanel={panel} />
      case 'work':
        return <WorkPreview key={id} moduleId={id} items={(data as { items: WorkItem[] }).items} themeColor={themeColor} title={title} renderItemCommentIcon={icon} renderItemCommentPanel={panel} />
      case 'project':
        return <ProjectPreview key={id} moduleId={id} items={(data as { items: ProjectItem[] }).items} themeColor={themeColor} title={title} renderItemCommentIcon={icon} renderItemCommentPanel={panel} />
      case 'skills':
        return <SkillsPreview key={id} moduleId={id} data={data as SkillsData} themeColor={themeColor} title={title} renderItemCommentIcon={icon} renderItemCommentPanel={panel} />
      case 'awards':
        return <AwardsPreview key={id} moduleId={id} items={(data as { items: AwardItem[] }).items} themeColor={themeColor} title={title} renderItemCommentIcon={icon} renderItemCommentPanel={panel} />
      case 'summary':
        return <SummaryPreview key={id} moduleId={id} data={data as SummaryData} themeColor={themeColor} title={title} renderItemCommentIcon={icon} renderItemCommentPanel={panel} />
      case 'certificates':
        return <CertificatesPreview key={id} moduleId={id} items={(data as { items: CertificateItem[] }).items} themeColor={themeColor} title={title} renderItemCommentIcon={icon} renderItemCommentPanel={panel} />
      case 'portfolio':
        return <PortfolioPreview key={id} moduleId={id} items={(data as { items: PortfolioItem[] }).items} themeColor={themeColor} title={title} renderItemCommentIcon={icon} renderItemCommentPanel={panel} />
      case 'languages':
        return <LanguagesPreview key={id} moduleId={id} items={(data as { items: LanguageItem[] }).items} themeColor={themeColor} title={title} renderItemCommentIcon={icon} renderItemCommentPanel={panel} />
      case 'custom':
        return <CustomPreview key={id} moduleId={id} data={data as CustomData} themeColor={themeColor} title={title} renderItemCommentIcon={icon} renderItemCommentPanel={panel} />
      case 'ai-engineering':
        return <AIEngineeringPreview key={id} moduleId={id} data={data as AIEngineeringData} themeColor={themeColor} title={title} renderItemCommentIcon={icon} renderItemCommentPanel={panel} />
      default:
        return null
    }
  }

  return (
    <div
      className={`w-full bg-white resume-preview-content ${className}`}
      data-module-title-line-position={styleSettings.moduleTitleLinePosition ?? 'left'}
      data-module-title-marker-style={styleSettings.moduleTitleMarkerStyle ?? 'bar'}
      data-module-title-marker-visible={styleSettings.moduleTitleMarkerVisible === false ? 'false' : 'true'}
      style={{
        minHeight: overrideMinHeight ?? '842px',
        padding: `${styleSettings.pagePaddingVertical}px ${styleSettings.pagePaddingHorizontal}px`,
        fontFamily: styleSettings.fontFamily,
        fontSize: `${styleSettings.fontSize}pt`,
        color: styleSettings.textColor,
        lineHeight: styleSettings.lineHeight,
        ['--module-spacing' as string]: `${styleSettings.moduleSpacing}px`,
        ['--paragraph-spacing' as string]: `${styleSettings.paragraphSpacing}px`,
        ['--resume-font-family' as string]: styleSettings.fontFamily,
        ['--resume-text-color' as string]: styleSettings.textColor,
        ['--resume-font-scale' as string]: String(styleSettings.fontSize / DEFAULT_RESUME_STYLE_SETTINGS.fontSize),
        ['--module-title-font-family' as string]: styleSettings.moduleTitleFontFamily ?? styleSettings.fontFamily,
        ['--module-title-font-size' as string]: `${styleSettings.moduleTitleFontSize ?? styleSettings.fontSize + 2}pt`,
        ['--module-title-color' as string]: themeColor,
      }}
    >
      {personalModule && (
        <PersonalPreview moduleId={personalModule.id} data={personalModule.data as PersonalData} themeColor={themeColor} />
      )}
      {otherModules.map(renderModule)}
    </div>
  )
}

export default ClassicTemplate
