// ============================================================
// ModernTemplate — 现代双栏模板
// 左侧 35% 固定个人信息+技能，右侧主体内容
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

interface ModernTemplateProps {
  resume: Resume
}

// ---------- 左侧栏 ----------
const LeftCol: React.FC<{ resume: Resume }> = ({ resume }) => {
  const { modules, themeColor } = resume
  const styleSettings = resume.styleSettings ?? DEFAULT_RESUME_STYLE_SETTINGS
  const personalModule = modules.find((m) => m.type === 'personal')
  const skillsModule = modules.find((m) => m.type === 'skills')
  const summaryModule = modules.find((m) => m.type === 'summary')
  const languagesModule = modules.find((m) => m.type === 'languages')
  const personalData = personalModule?.data as PersonalData | undefined
  const skillsData = skillsModule?.data as SkillsData | undefined
  const summaryData = summaryModule?.data as SummaryData | undefined
  const languagesItems = (languagesModule?.data as { items: LanguageItem[] })?.items ?? []

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

  return (
    <div className="h-full" style={{ background: `${themeColor}08`, borderRight: `2px solid ${themeColor}30` }}>
      <div className="p-4">
        {personalModule?.visible !== false && personalData && (
          <div className="text-center mb-4">
            {personalData.avatar && (
              <img
                src={personalData.avatar}
                alt="头像"
                className={`mx-auto mb-3 object-cover border-2 ${personalData.avatarShape === 'square' ? 'rounded-lg' : 'rounded-full'}`}
                style={personalData.avatarShape === 'square' ? { width: '75px', height: '103.54px', borderColor: `${themeColor}40` } : { width: '75px', aspectRatio: '1/1', borderColor: `${themeColor}40` }}
              />
            )}
            <h1 className="text-[18pt] font-bold mb-1" style={{ color: themeColor }}>
              {personalData.name || '你的姓名'}
            </h1>
            {personalData.targetPosition?.trim() && (
              <p className="text-[9pt]" style={{ color: styleSettings.textColor }}>
                {personalData.targetPosition}
              </p>
            )}
          </div>
        )}

        {personalModule?.visible !== false && personalLines.length > 0 && (
          <div className="mb-4">
            <SidebarSection title="个人信息" themeColor={themeColor}>
              <div className="space-y-1">
                {personalLines.map((line) => (
                  <p key={line} className="text-[9pt] text-gray-600 break-all leading-relaxed">{line}</p>
                ))}
              </div>
            </SidebarSection>
          </div>
        )}

        {skillsModule?.visible !== false && skillsData && (
          <div className="mb-4">
            <SkillsPreview data={skillsData} themeColor={themeColor} />
          </div>
        )}

        {summaryModule?.visible !== false && summaryData && (
          <div className="mb-4">
            <SummaryPreview data={summaryData} themeColor={themeColor} />
          </div>
        )}

        {languagesModule?.visible !== false && languagesItems.length > 0 && (
          <div className="mb-4">
            <LanguagesPreview items={languagesItems} themeColor={themeColor} />
          </div>
        )}
      </div>
    </div>
  )
}

const SidebarSection: React.FC<{ title: string; themeColor: string; children: React.ReactNode }> = ({
  title, themeColor, children,
}) => (
  <div data-page-break-candidate>
    <div className="flex items-center gap-1.5 mb-2">
      <div className="w-1.5 h-3 rounded-full" style={{ backgroundColor: themeColor }} />
      <h4 className="text-[9pt] font-bold uppercase tracking-wider" style={{ color: themeColor }}>{title}</h4>
    </div>
    <div>{children}</div>
  </div>
)

// ---------- 右侧区块 ----------
const RightModules: React.FC<{ resume: Resume }> = ({ resume }) => {
  const { modules, themeColor } = resume
  const styleSettings = resume.styleSettings ?? DEFAULT_RESUME_STYLE_SETTINGS
  const otherModules = modules.filter(
    (m) => m.visible && m.type !== 'personal' && m.type !== 'skills' && m.type !== 'summary' && m.type !== 'languages'
  )

  const render = (m: typeof modules[number]) => {
    switch (m.type) {
      case 'education':
        return <EducationPreview key={m.id} items={(m.data as { items: EducationItem[] }).items} themeColor={themeColor} />
      case 'work':
        return <WorkPreview key={m.id} items={(m.data as { items: WorkItem[] }).items} themeColor={themeColor} title={m.title} />
      case 'project':
        return <ProjectPreview key={m.id} items={(m.data as { items: ProjectItem[] }).items} themeColor={themeColor} />
      case 'awards':
        return <AwardsPreview key={m.id} items={(m.data as { items: AwardItem[] }).items} themeColor={themeColor} />
      case 'certificates':
        return <CertificatesPreview key={m.id} items={(m.data as { items: CertificateItem[] }).items} themeColor={themeColor} />
      case 'portfolio':
        return <PortfolioPreview key={m.id} items={(m.data as { items: PortfolioItem[] }).items} themeColor={themeColor} />
      case 'custom':
        return <CustomPreview key={m.id} data={m.data as CustomData} themeColor={themeColor} />
      default:
        return null
    }
  }

  return (
    <div style={{ display: 'grid', gap: `${styleSettings.moduleSpacing}px` }}>
      {otherModules.map(render)}
    </div>
  )
}

// ---------- 主组件 ----------
const ModernTemplate: React.FC<ModernTemplateProps> = ({ resume }) => {
  const styleSettings = resume.styleSettings ?? DEFAULT_RESUME_STYLE_SETTINGS

  return (
    <div
      className="w-full flex bg-white resume-preview-content"
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
      <div className="w-[35%] flex-shrink-0">
        <LeftCol resume={resume} />
      </div>
      <div className="flex-1 px-4">
        <RightModules resume={resume} />
      </div>
    </div>
  )
}

export default ModernTemplate
