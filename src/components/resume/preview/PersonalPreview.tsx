// ============================================================
// PersonalPreview — 个人信息预览
// 姓名居左 + 头像居右
// ============================================================

import React from 'react'
import { PersonalData } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import PersonalAvatar from '@/components/resume/PersonalAvatar'
import { useI18n } from '@/hooks/useI18n'

interface PersonalPreviewProps {
  data: PersonalData
  themeColor: string
  moduleId?: string
}

const PersonalPreview: React.FC<PersonalPreviewProps> = ({ data, themeColor, moduleId }) => {
  const { t, te, locale } = useI18n()
  // 个人信息优先从独立 personalData 读取（多快照共享），回退到模块 data
  const personalData = useResumeStore((s) => s.personalData)
  const avatarPosition = useResumeStore((s) => s.resume.styleSettings?.avatarPosition) ?? 'right'

  const {
    name,
    targetPosition,
    phone,
    email,
    city,
    avatar,
    avatarShape,
    workYears,
    age,
    hometown,
    politics,
    gender,
    education,
    personalAccount,
    extraInfos,
  } = data

  const birthDateDisplay = (() => {
    if (!age) return ''
    if (/^\d{4}-\d{2}$/.test(age)) {
      const [y, m] = age.split('-')
      return locale === 'en-US' ? `${m}/${y}` : `${y}年${m}月`
    }
    return age
  })()

  // 翻译枚举值（性别、学历、政治面貌、工作年限等）
  const genderDisplay = gender ? te(gender) : ''
  const educationDisplay = education ? te(education) : ''
  const politicsDisplay = politics ? te(politics) : ''
  const workYearsDisplay = workYears ? te(workYears) : ''

  const sep = locale === 'en-US' ? ': ' : '：'

  const contacts = [
    ...(birthDateDisplay ? [{ value: `${t('label.birthDate')}${sep}${birthDateDisplay}` }] : []),
    ...(hometown ? [{ value: `${t('label.hometown')}${sep}${hometown}` }] : []),
    ...(email ? [{ value: `${t('label.email')}${sep}${email}` }] : []),
    ...(phone ? [{ value: `${t('label.phone')}${sep}${phone}` }] : []),
    ...(city ? [{ value: `${t('label.city')}${sep}${city}` }] : []),
    ...(genderDisplay ? [{ value: `${t('label.gender')}${sep}${genderDisplay}` }] : []),
    ...(educationDisplay ? [{ value: `${t('label.education')}${sep}${educationDisplay}` }] : []),
    ...(politicsDisplay ? [{ value: `${t('label.politics')}${sep}${politicsDisplay}` }] : []),
    ...(workYearsDisplay ? [{ value: `${t('label.workYears')}${sep}${workYearsDisplay}` }] : []),
    ...(personalAccount?.platform && personalAccount?.url
      ? [{ value: `${personalAccount.platform}${sep}`, link: personalAccount.url }]
      : []),
    ...((extraInfos ?? [])
      .filter((item) => item.title && item.value)
      .map((item) => ({ value: `${item.title}${sep}${item.value}` }))),
  ]

  const showAvatar = !!(personalData?.avatar as string || avatar)
  const centerMode = avatarPosition === 'center'

  const avatarEl = showAvatar ? (
    <PersonalAvatar
      avatar={(personalData?.avatar as string) || avatar}
      avatarShape={(personalData?.avatarShape as 'circle' | 'square') || avatarShape || 'circle'}
      size={75}
      themeColor={themeColor}
    />
  ) : null

  return (
    <div className={`${centerMode ? 'text-center' : 'flex items-start gap-4'} mb-2`} data-module-id={moduleId}>
      {/* 居中模式：头像在上方 */}
      {centerMode && showAvatar && <div className="flex justify-center mb-2">{avatarEl}</div>}
      {/* 居左模式：头像在左侧 */}
      {avatarPosition === 'left' && avatarEl}
      {/* 姓名 + 求职意向 + 联系方式 */}
      <div className={`${centerMode ? '' : 'flex-1 min-w-0'}`}>
        <h1 className="text-[22pt] font-bold mb-0.5" style={{ color: themeColor }}>
          {name || t('personal.yourName')}
        </h1>
        {targetPosition && <p className="text-[10pt] text-gray-500 mb-3">{targetPosition}</p>}
        {contacts.length > 0 && (
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[9pt] text-gray-500 pb-3 ">
            {contacts.map((c, i) => (
              <span key={i} className="block min-w-0 break-all leading-relaxed">
                {c.value}
                {'link' in c && (
                  <a
                    href={c.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="!no-underline border-b border-dotted hover:underline"
                    style={{ color: themeColor, borderColor: themeColor }}
                  >
                    {c.link}
                  </a>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
      {/* 居右模式（默认）：头像在右侧 */}
      {!centerMode && avatarPosition !== 'left' && avatarEl}
    </div>
  )
}

export default PersonalPreview
