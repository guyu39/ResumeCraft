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
  const isEn = resume.locale === 'en-US'

  // i18n 辅助
  const sep = isEn ? ': ' : '：'
  const labelMap: Record<string, string> = isEn
    ? { birthDate: 'DOB', hometown: 'Hometown', email: 'Email', phone: 'Phone', city: 'City', gender: 'Gender', education: 'Education', politics: 'Political Status', workYears: 'Exp.', personalAccount: 'Account' }
    : { birthDate: '出生年月', hometown: '籍贯', email: '邮箱', phone: '电话', city: '城市', gender: '性别', education: '学历', politics: '政治面貌', workYears: '工作年限', personalAccount: '个人账号' }

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

  const renderModule = (m: typeof modules[number]) => {
    switch (m.type) {
      case 'education':
        return <EducationPreview key={m.id} moduleId={m.id} items={(m.data as { items: EducationItem[] }).items} themeColor={themeColor} title={m.title} />
      case 'work':
        return <WorkPreview key={m.id} moduleId={m.id} items={(m.data as { items: WorkItem[] }).items} themeColor={themeColor} title={m.title} />
      case 'project':
        return <ProjectPreview key={m.id} moduleId={m.id} items={(m.data as { items: ProjectItem[] }).items} themeColor={themeColor} title={m.title} />
      case 'skills':
        return <SkillsPreview key={m.id} moduleId={m.id} data={m.data as SkillsData} themeColor={themeColor} title={m.title} />
      case 'awards':
        return <AwardsPreview key={m.id} moduleId={m.id} items={(m.data as { items: AwardItem[] }).items} themeColor={themeColor} title={m.title} />
      case 'summary':
        return <SummaryPreview key={m.id} moduleId={m.id} data={m.data as SummaryData} themeColor={themeColor} title={m.title} />
      case 'certificates':
        return <CertificatesPreview key={m.id} moduleId={m.id} items={(m.data as { items: CertificateItem[] }).items} themeColor={themeColor} title={m.title} />
      case 'portfolio':
        return <PortfolioPreview key={m.id} moduleId={m.id} items={(m.data as { items: PortfolioItem[] }).items} themeColor={themeColor} title={m.title} />
      case 'languages':
        return <LanguagesPreview key={m.id} moduleId={m.id} items={(m.data as { items: LanguageItem[] }).items} themeColor={themeColor} title={m.title} />
      case 'custom':
        return <CustomPreview key={m.id} moduleId={m.id} data={m.data as CustomData} themeColor={themeColor} title={m.title} />
      default:
        return null
    }
  }

  return (
    <div
      className="w-full bg-white resume-preview-content"
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
        ['--module-title-color' as string]: themeColor,
      }}
    >
      <div className="relative mb-1 pr-[92px]" data-module-id={modules.find(m => m.type === 'personal')?.id}>
        <div className="min-w-0">
          <h1 className="text-[22pt] font-extrabold tracking-tight leading-tight" style={{ color: themeColor }}>
            {personalData?.name || (isEn ? 'Your Name' : '你的姓名')}
          </h1>
          {personalData?.targetPosition && (
            <p className="mt-0.5 text-[8.8pt] text-gray-500 leading-tight">{personalData.targetPosition}</p>
          )}
        </div>
        {personalData?.avatar && (
          <img
            src={personalData.avatar}
            alt={isEn ? 'Avatar' : '头像'}
            className={`absolute right-0 top-0 object-cover border-2 ${personalData.avatarShape === 'square' ? 'rounded-lg' : 'rounded-full'}`}
            style={personalData.avatarShape === 'square' ? { width: '75px', height: '103.54px', borderColor: `${themeColor}40` } : { width: '75px', aspectRatio: '1/1', borderColor: `${themeColor}40` }}
          />
        )}
      </div>

      {personalLines.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-x-5 gap-y-0.5 text-[8.9pt] text-gray-500" data-module-id={modules.find(m => m.type === 'personal')?.id}>
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
