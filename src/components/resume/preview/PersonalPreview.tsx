// ============================================================
// PersonalPreview — 个人信息预览
// 姓名居左 + 头像居右
// ============================================================

import React from 'react'
import { PersonalData } from '@/types/resume'
import { useI18n } from '@/hooks/useI18n'

interface PersonalPreviewProps {
  data: PersonalData
  themeColor: string
  moduleId?: string
}

const PersonalPreview: React.FC<PersonalPreviewProps> = ({ data, themeColor, moduleId }) => {
  const { t, te, locale } = useI18n()

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

  return (
    <div className="flex items-start gap-4 mb-2" data-module-id={moduleId}>
      {/* 左侧：姓名 + 求职意向 + 联系方式 */}
      <div className="flex-1 min-w-0">
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

      {/* 右侧：头像 */}
      {avatar && (
        <img
          src={avatar}
          alt={t('personal.avatar')}
          loading="lazy"
          decoding="async"
          className={`flex-shrink-0 object-cover border-2 ${avatarShape === 'square' ? 'rounded-lg' : 'rounded-full'}`}
          style={avatarShape === 'square' ? { width: '75px', height: '103.54px', borderColor: `${themeColor}40` } : { width: '75px', aspectRatio: '1/1', borderColor: `${themeColor}40` }}
        />
      )}
    </div>
  )
}

export default PersonalPreview
