// ============================================================
// ClassicTemplate — 经典单栏模板
// ============================================================

import React from 'react'
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

interface ClassicTemplateProps {
  resume: Resume
}

const ClassicTemplate: React.FC<ClassicTemplateProps> = ({ resume }) => {
  const { modules, themeColor } = resume
  const styleSettings = resume.styleSettings ?? DEFAULT_RESUME_STYLE_SETTINGS
  const visibleModules = modules.filter((m) => m.visible)
  const personalModule = visibleModules.find((m) => m.type === 'personal')
  const otherModules = visibleModules.filter((m) => m.type !== 'personal')

  const renderModule = (module: typeof visibleModules[number]) => {
    const { type, id, data, title } = module
    switch (type) {
      case 'education':
        return <EducationPreview key={id} items={(data as { items: EducationItem[] }).items} themeColor={themeColor} />
      case 'work':
        return <WorkPreview key={id} items={(data as { items: WorkItem[] }).items} themeColor={themeColor} title={title} />
      case 'project':
        return <ProjectPreview key={id} items={(data as { items: ProjectItem[] }).items} themeColor={themeColor} />
      case 'skills':
        return <SkillsPreview key={id} data={data as SkillsData} themeColor={themeColor} />
      case 'awards':
        return <AwardsPreview key={id} items={(data as { items: AwardItem[] }).items} themeColor={themeColor} />
      case 'summary':
        return <SummaryPreview key={id} data={data as SummaryData} themeColor={themeColor} />
      case 'certificates':
        return <CertificatesPreview key={id} items={(data as { items: CertificateItem[] }).items} themeColor={themeColor} />
      case 'portfolio':
        return <PortfolioPreview key={id} items={(data as { items: PortfolioItem[] }).items} themeColor={themeColor} />
      case 'languages':
        return <LanguagesPreview key={id} items={(data as { items: LanguageItem[] }).items} themeColor={themeColor} />
      case 'custom':
        return <CustomPreview key={id} data={data as CustomData} themeColor={themeColor} />
      default:
        return null
    }
  }

  return (
    <div
      className="w-full bg-white resume-preview-content"
      style={{
        minHeight: '842px',
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
      }}
    >
      {personalModule && (
        <PersonalPreview data={personalModule.data as PersonalData} themeColor={themeColor} />
      )}
      {otherModules.map(renderModule)}
    </div>
  )
}

export default ClassicTemplate
