// ============================================================
// MinimalTemplate — 简约极简模板
// 大量留白，无装饰线，字体层级分明
// ============================================================

import React from 'react'
import { Resume, DEFAULT_RESUME_STYLE_SETTINGS, PersonalData } from '@/types/resume'
import PersonalAvatar from '@/components/resume/PersonalAvatar'
import { useResumeStore } from '@/store/resumeStore'
import { useI18n } from '@/hooks/useI18n'
import { renderResumeModule } from './moduleRegistry'
import { useResumeStyleVars } from './useResumeStyleVars'
import { buildPersonalLines } from './personalLines'

interface MinimalTemplateProps {
  resume: Resume
}

const MinimalTemplate: React.FC<MinimalTemplateProps> = ({ resume }) => {
  const { modules, themeColor } = resume
  const styleSettings = resume.styleSettings ?? DEFAULT_RESUME_STYLE_SETTINGS
  const visibleModules = modules.filter((m) => m.visible)
  const personalData = modules.find((m) => m.type === 'personal')?.data as PersonalData | undefined
  const isEn = resume.locale === 'en-US'
  const i18n = useI18n()
  const personalLines = buildPersonalLines(personalData, i18n)
  const { style, dataAttrs } = useResumeStyleVars(resume)
  // 头像优先取 store 独立 personalData（多快照共享），回退模块 data，与 PersonalPreview 一致
  const storePersonal = useResumeStore((s) => s.personalData)
  const avatar = (storePersonal?.avatar as string) || personalData?.avatar || ''
  const avatarShape = (storePersonal?.avatarShape as 'circle' | 'square') || personalData?.avatarShape || 'circle'

  return (
    <div className="w-full bg-white resume-preview-content" {...dataAttrs} style={style}>
      <div className={`relative mb-1 ${styleSettings.avatarPosition === 'right' || !styleSettings.avatarPosition ? 'pr-[92px]' : ''}`} data-module-id={modules.find(m => m.type === 'personal')?.id}>
        {/* 居中模式：头像在上方 */}
        {styleSettings.avatarPosition === 'center' && avatar && (
          <div className="flex justify-center mb-2">
            <PersonalAvatar
              avatar={avatar}
              avatarShape={avatarShape}
              size={75}
              themeColor={themeColor}
            />
          </div>
        )}
        {/* 居左模式：头像在左侧 */}
        {styleSettings.avatarPosition === 'left' && avatar && (
          <PersonalAvatar
            avatar={avatar}
            avatarShape={avatarShape}
            size={75}
            themeColor={themeColor}
            className="absolute left-0 top-0"
          />
        )}
        <div className={`min-w-0 ${styleSettings.avatarPosition === 'left' ? 'ml-[92px]' : ''}`}>
          <h1 className="text-[22pt] font-extrabold tracking-tight leading-tight" style={{ color: themeColor }}>
            {personalData?.name || (isEn ? 'Your Name' : '你的姓名')}
          </h1>
          {personalData?.targetPosition && (
            <p className="mt-0.5 text-[8.8pt] text-gray-500 leading-tight">{personalData.targetPosition}</p>
          )}
        </div>
        {/* 居右模式：头像在右侧 */}
        {(!styleSettings.avatarPosition || styleSettings.avatarPosition === 'right') && avatar && (
          <PersonalAvatar
            avatar={avatar}
            avatarShape={avatarShape}
            size={75}
            themeColor={themeColor}
            className="absolute right-0 top-0"
          />
        )}
      </div>

      {personalLines.length > 0 && (
        <div className={`mb-5 grid grid-cols-2 gap-x-5 gap-y-0.5 text-[8.9pt] text-gray-500 ${styleSettings.avatarPosition === 'left' ? 'ml-[92px]' : ''}`} data-module-id={modules.find(m => m.type === 'personal')?.id}>
          {personalLines.map((line) => (
            <span key={line} className="block min-w-0 break-all leading-tight">{line}</span>
          ))}
        </div>
      )}

      {visibleModules.filter((m) => m.type !== 'personal').map((m) => renderResumeModule(m, { themeColor }))}
    </div>
  )
}

export default MinimalTemplate
