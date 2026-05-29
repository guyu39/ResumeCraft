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
  const isEn = resume.locale === 'en-US'
  const personalModule = modules.find((m) => m.type === 'personal')
  const skillsModule = modules.find((m) => m.type === 'skills')
  const summaryModule = modules.find((m) => m.type === 'summary')
  const languagesModule = modules.find((m) => m.type === 'languages')
  const personalData = personalModule?.data as PersonalData | undefined
  const skillsData = skillsModule?.data as SkillsData | undefined
  const summaryData = summaryModule?.data as SummaryData | undefined
  const languagesItems = (languagesModule?.data as { items: LanguageItem[] })?.items ?? []

  // i18n 辅助
  const sep = isEn ? ': ' : '：'
  const labelMap: Record<string, string> = isEn
    ? { birthDate: 'DOB', hometown: 'Hometown', email: 'Email', phone: 'Phone', city: 'City', gender: 'Gender', education: 'Education', politics: 'Political Status', workYears: 'Exp.', personalAccount: 'Account' }
    : { birthDate: '出生年月', hometown: '籍贯', email: '邮箱', phone: '电话', city: '城市', gender: '性别', education: '学历', politics: '政治面貌', workYears: '工作年限', personalAccount: '个人账号' }

  // 翻译枚举值辅助
  const enumMap: Record<string, string> = isEn
    ? { '男': 'Male', '女': 'Female', '初中': 'Junior High', '中专': 'Vocational', '高中': 'High School', '大专': 'Associate', '本科': "Bachelor's", '硕士': "Master's", '博士': 'Doctorate', '群众': 'Non-partisan', '共青团员': 'CYL Member', '中共党员': 'CPC Member', '中共预备党员': 'Probationary CPC Member', '民主党派': 'Democratic Party', '应届毕业生': 'Fresh Graduate', '1年以下': '< 1 year', '1-3年': '1-3 years', '3-5年': '3-5 years', '5-10年': '5-10 years', '10年以上': '10+ years' }
    : {}
  const te = (v: string) => enumMap[v] ?? v

  const birthText = (() => {
    if (!personalData?.age) return ''
    if (/^\d{4}-\d{2}$/.test(personalData.age)) {
      const [year, month] = personalData.age.split('-')
      return isEn ? `${month}/${year}` : `${year}年${month}月`
    }
    return personalData.age
  })()

  const personalLines = personalData
    ? [
      ...(birthText ? [`${labelMap.birthDate}${sep}${birthText}`] : []),
      ...(personalData.hometown ? [`${labelMap.hometown}${sep}${personalData.hometown}`] : []),
      ...(personalData.email ? [`${labelMap.email}${sep}${personalData.email}`] : []),
      ...(personalData.phone ? [`${labelMap.phone}${sep}${personalData.phone}`] : []),
      ...(personalData.city ? [`${labelMap.city}${sep}${personalData.city}`] : []),
      ...(personalData.gender ? [`${labelMap.gender}${sep}${te(personalData.gender)}`] : []),
      ...(personalData.education ? [`${labelMap.education}${sep}${te(personalData.education)}`] : []),
      ...(personalData.politics ? [`${labelMap.politics}${sep}${te(personalData.politics)}`] : []),
      ...(personalData.workYears ? [`${labelMap.workYears}${sep}${te(personalData.workYears)}`] : []),
      ...(personalData.personalAccount ? [`${labelMap.personalAccount}${sep}${personalData.personalAccount}`] : []),
      ...((personalData.extraInfos ?? [])
        .filter((item) => item.title && item.value)
        .map((item) => `${item.title}${sep}${item.value}`)),
    ]
    : []

  return (
    <div className="h-full" style={{ background: `${themeColor}08`, borderRight: `2px solid ${themeColor}30` }}>
      <div className="py-4 pr-4">
        {personalModule?.visible !== false && personalData && (
          <div className="text-center mb-4">
            {personalData.avatar && (
              <img
                src={personalData.avatar}
                alt={isEn ? 'Avatar' : '头像'}
                className={`mx-auto mb-3 object-cover border-2 ${personalData.avatarShape === 'square' ? 'rounded-lg' : 'rounded-full'}`}
                style={personalData.avatarShape === 'square' ? { width: '75px', height: '103.54px', borderColor: `${themeColor}40` } : { width: '75px', aspectRatio: '1/1', borderColor: `${themeColor}40` }}
              />
            )}
            <h1 className="text-[18pt] font-bold mb-1" style={{ color: themeColor }}>
              {personalData.name || (isEn ? 'Your Name' : '你的姓名')}
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
            <SidebarSection title={isEn ? 'Personal Information' : '个人信息'} themeColor={themeColor}>
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
            <SkillsPreview data={skillsData} themeColor={themeColor} title={skillsModule?.title} />
          </div>
        )}

        {summaryModule?.visible !== false && summaryData && (
          <div className="mb-4">
            <SummaryPreview data={summaryData} themeColor={themeColor} title={summaryModule?.title} />
          </div>
        )}

        {languagesModule?.visible !== false && languagesItems.length > 0 && (
          <div className="mb-4">
            <LanguagesPreview items={languagesItems} themeColor={themeColor} title={languagesModule?.title} />
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
        return <EducationPreview key={m.id} items={(m.data as { items: EducationItem[] }).items} themeColor={themeColor} title={m.title} />
      case 'work':
        return <WorkPreview key={m.id} items={(m.data as { items: WorkItem[] }).items} themeColor={themeColor} title={m.title} />
      case 'project':
        return <ProjectPreview key={m.id} items={(m.data as { items: ProjectItem[] }).items} themeColor={themeColor} title={m.title} />
      case 'awards':
        return <AwardsPreview key={m.id} items={(m.data as { items: AwardItem[] }).items} themeColor={themeColor} title={m.title} />
      case 'certificates':
        return <CertificatesPreview key={m.id} items={(m.data as { items: CertificateItem[] }).items} themeColor={themeColor} title={m.title} />
      case 'portfolio':
        return <PortfolioPreview key={m.id} items={(m.data as { items: PortfolioItem[] }).items} themeColor={themeColor} title={m.title} />
      case 'custom':
        return <CustomPreview key={m.id} data={m.data as CustomData} themeColor={themeColor} title={m.title} />
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
      data-module-title-line-position={styleSettings.moduleTitleLinePosition ?? 'left'}
      data-module-title-marker-style={styleSettings.moduleTitleMarkerStyle ?? 'bar'}
      data-module-title-marker-visible={styleSettings.moduleTitleMarkerVisible === false ? 'false' : 'true'}
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
        ['--module-title-font-family' as string]: styleSettings.moduleTitleFontFamily ?? styleSettings.fontFamily,
        ['--module-title-font-size' as string]: `${styleSettings.moduleTitleFontSize ?? styleSettings.fontSize + 2}pt`,
        ['--module-title-color' as string]: resume.themeColor,
      }}
    >
      <div className="w-[35%] flex-shrink-0">
        <LeftCol resume={resume} />
      </div>
      <div className="flex-1 pl-4">
        <RightModules resume={resume} />
      </div>
    </div>
  )
}

export default ModernTemplate
