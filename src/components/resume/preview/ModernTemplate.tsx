// ============================================================
// ModernTemplate — 现代双栏模板
// 左侧 35% 固定个人信息+技能，右侧主体内容
// ============================================================

import React from 'react'
import {
  Resume,
  DEFAULT_RESUME_STYLE_SETTINGS,
  PersonalData,
  SkillsData,
  SummaryData,
  LanguageItem,
} from '@/types/resume'
import SkillsPreview from './SkillsPreview'
import SummaryPreview from './SummaryPreview'
import LanguagesPreview from './LanguagesPreview'
import PersonalAvatar from '@/components/resume/PersonalAvatar'
import { useResumeStore } from '@/store/resumeStore'
import { renderResumeModule } from './moduleRegistry'
import { useResumeStyleVars } from './useResumeStyleVars'
import { buildPersonalLines } from './personalLines'

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
  // 头像优先取 store 独立 personalData（多快照共享），回退模块 data，与 PersonalPreview 一致
  const storePersonal = useResumeStore((s) => s.personalData)
  const avatar = (storePersonal?.avatar as string) || personalData?.avatar || ''
  const avatarShape = (storePersonal?.avatarShape as 'circle' | 'square') || personalData?.avatarShape || 'circle'

  const personalLines = buildPersonalLines(personalData, resume.locale)

  return (
    <div className="h-full" style={{ background: `${themeColor}08`, borderRight: `2px solid ${themeColor}30` }}>
      <div className="py-4 pr-4">
        {personalModule?.visible !== false && personalData && (
          <div className="text-center mb-4" data-module-id={personalModule?.id}>
            {avatar && (
              <div className="flex justify-center mb-3">
                <PersonalAvatar
                  avatar={avatar}
                  avatarShape={avatarShape}
                  size={75}
                  themeColor={themeColor}
                />
              </div>
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
          <div className="mb-4" data-module-id={personalModule?.id}>
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
            <SkillsPreview data={skillsData} themeColor={themeColor} title={skillsModule?.title} moduleId={skillsModule?.id} />
          </div>
        )}

        {summaryModule?.visible !== false && summaryData && (
          <div className="mb-4">
            <SummaryPreview data={summaryData} themeColor={themeColor} title={summaryModule?.title} moduleId={summaryModule?.id} />
          </div>
        )}

        {languagesModule?.visible !== false && languagesItems.length > 0 && (
          <div className="mb-4">
            <LanguagesPreview items={languagesItems} themeColor={themeColor} title={languagesModule?.title} moduleId={languagesModule?.id} />
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
  // 左栏固定渲染 personal/skills/summary/languages，右栏渲染其余（归属硬编码）
  const otherModules = modules.filter(
    (m) => m.visible && m.type !== 'personal' && m.type !== 'skills' && m.type !== 'summary' && m.type !== 'languages'
  )

  return (
    <div style={{ display: 'grid', gap: `${styleSettings.moduleSpacing}px` }}>
      {otherModules.map((m) => renderResumeModule(m, { themeColor }))}
    </div>
  )
}

// ---------- 主组件 ----------
const ModernTemplate: React.FC<ModernTemplateProps> = ({ resume }) => {
  const { style, dataAttrs } = useResumeStyleVars(resume)

  return (
    <div className="w-full flex bg-white resume-preview-content" {...dataAttrs} style={style}>
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
