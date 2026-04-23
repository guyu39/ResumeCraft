// ============================================================
// MinimalTemplate — 简约极简模板
// 大量留白，无装饰线，字体层级分明
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

interface MinimalTemplateProps {
  resume: Resume
}

const MinimalTemplate: React.FC<MinimalTemplateProps> = ({ resume }) => {
  const { modules, themeColor } = resume
  const styleSettings = resume.styleSettings ?? DEFAULT_RESUME_STYLE_SETTINGS
  const visibleModules = modules.filter((m) => m.visible)
  const personalData = modules.find((m) => m.type === 'personal')?.data as PersonalData | undefined

  const birthText = (() => {
    if (!personalData?.age) return ''
    if (/^\d{4}-\d{2}$/.test(personalData.age)) {
      const [year, month] = personalData.age.split('-')
      return `${year}年${month}月`
    }
    return personalData.age
  })()

  const personalLines = personalData
    ? [
      ...(birthText ? [`出生年月：${birthText}`] : []),
      ...(personalData.hometown ? [`籍贯：${personalData.hometown}`] : []),
      ...(personalData.email ? [`邮箱：${personalData.email}`] : []),
      ...(personalData.phone ? [`电话：${personalData.phone}`] : []),
      ...(personalData.city ? [`城市：${personalData.city}`] : []),
      ...(personalData.gender ? [`性别：${personalData.gender}`] : []),
      ...(personalData.education ? [`学历：${personalData.education}`] : []),
      ...(personalData.politics ? [`政治面貌：${personalData.politics}`] : []),
      ...(personalData.workYears ? [`工作年限：${personalData.workYears}`] : []),
      ...((personalData.extraInfos ?? [])
        .filter((item) => item.title && item.value)
        .map((item) => `${item.title}：${item.value}`)),
    ]
    : []

  const renderModule = (m: typeof modules[number]) => {
    switch (m.type) {
      case 'education':
        return <EducationPreview key={m.id} items={(m.data as { items: EducationItem[] }).items} themeColor={themeColor} />
      case 'work':
        return <WorkPreview key={m.id} items={(m.data as { items: WorkItem[] }).items} themeColor={themeColor} title={m.title} />
      case 'project':
        return <ProjectPreview key={m.id} items={(m.data as { items: ProjectItem[] }).items} themeColor={themeColor} />
      case 'skills':
        return <SkillsPreview key={m.id} data={m.data as SkillsData} themeColor={themeColor} />
      case 'awards':
        return <AwardsPreview key={m.id} items={(m.data as { items: AwardItem[] }).items} themeColor={themeColor} />
      case 'summary':
        return <SummaryPreview key={m.id} data={m.data as SummaryData} themeColor={themeColor} />
      case 'certificates':
        return <CertificatesPreview key={m.id} items={(m.data as { items: CertificateItem[] }).items} themeColor={themeColor} />
      case 'portfolio':
        return <PortfolioPreview key={m.id} items={(m.data as { items: PortfolioItem[] }).items} themeColor={themeColor} />
      case 'languages':
        return <LanguagesPreview key={m.id} items={(m.data as { items: LanguageItem[] }).items} themeColor={themeColor} />
      case 'custom':
        return <CustomPreview key={m.id} data={m.data as CustomData} themeColor={themeColor} />
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
      <div className="relative mb-1 pr-[92px]">
        <div className="min-w-0">
          <h1 className="text-[22pt] font-extrabold tracking-tight leading-tight" style={{ color: themeColor }}>
            {personalData?.name || '你的姓名'}
          </h1>
          {personalData?.targetPosition && (
            <p className="mt-0.5 text-[8.8pt] text-gray-500 leading-tight">{personalData.targetPosition}</p>
          )}
        </div>
        {personalData?.avatar && (
          <img
            src={personalData.avatar}
            alt="头像"
            className={`absolute right-0 top-0 object-cover border-2 ${personalData.avatarShape === 'square' ? 'rounded-lg' : 'rounded-full'}`}
            style={personalData.avatarShape === 'square' ? { width: '75px', height: '103.54px', borderColor: `${themeColor}40` } : { width: '75px', aspectRatio: '1/1', borderColor: `${themeColor}40` }}
          />
        )}
      </div>

      {personalLines.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-x-5 gap-y-0.5 text-[8.9pt] text-gray-500">
          {personalLines.map((line) => (
            <span key={line} className="block min-w-0 break-all leading-tight">{line}</span>
          ))}
        </div>
      )}

      {visibleModules.filter((m) => m.type !== 'personal').map(renderModule)}
    </div>
  )
}

export default MinimalTemplate
