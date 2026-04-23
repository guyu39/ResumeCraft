// ============================================================
// PersonalPreview — 个人信息预览
// 姓名居左 + 头像居右
// ============================================================

import React from 'react'
import { PersonalData } from '@/types/resume'

interface PersonalPreviewProps {
  data: PersonalData
  themeColor: string
}

const PersonalPreview: React.FC<PersonalPreviewProps> = ({ data, themeColor }) => {
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
    extraInfos,
  } = data

  const 出生年月展示 = (() => {
    if (!age) return ''
    if (/^\d{4}-\d{2}$/.test(age)) {
      const [年, 月] = age.split('-')
      return `${年}年${月}月`
    }
    return age
  })()

  const contacts = [
    ...(出生年月展示 ? [{ value: `出生年月：${出生年月展示}` }] : []),
    ...(hometown ? [{ value: `籍贯：${hometown}` }] : []),
    ...(email ? [{ value: `邮箱：${email}` }] : []),
    ...(phone ? [{ value: `电话：${phone}` }] : []),
    ...(city ? [{ value: `城市：${city}` }] : []),
    ...(gender ? [{ value: `性别：${gender}` }] : []),
    ...(education ? [{ value: `学历：${education}` }] : []),
    ...(politics ? [{ value: `政治面貌：${politics}` }] : []),
    ...(workYears ? [{ value: `工作年限：${workYears}` }] : []),
    ...((extraInfos ?? [])
      .filter((item) => item.title && item.value)
      .map((item) => ({ value: `${item.title}：${item.value}` }))),
    // ...(website ? [{ value: `网站：${website}` }] : []),
    // ...(github ? [{ value: `GitHub：${github}` }] : []),
    // ...(linkedin ? [{ value: `LinkedIn：${linkedin}` }] : []),
  ]

  return (
    <div className="flex items-start gap-4 mb-2">
      {/* 左侧：姓名 + 求职意向 + 联系方式 */}
      <div className="flex-1 min-w-0">
        <h1 className="text-[22pt] font-bold mb-0.5" style={{ color: themeColor }}>
          {name || '你的姓名'}
        </h1>
        {targetPosition && <p className="text-[10pt] text-gray-500 mb-3">{targetPosition}</p>}
        {contacts.length > 0 && (
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[9pt] text-gray-500 pb-3 ">
            {contacts.map((c, i) => (
              <span key={i} className="block min-w-0 break-all leading-relaxed">
                {c.value}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 右侧：头像 */}
      {avatar && (
        <img
          src={avatar}
          alt="头像"
          className={`flex-shrink-0 object-cover border-2 ${avatarShape === 'square' ? 'rounded-lg' : 'rounded-full'}`}
          style={avatarShape === 'square' ? { width: '75px', height: '103.54px', borderColor: `${themeColor}40` } : { width: '75px', aspectRatio: '1/1', borderColor: `${themeColor}40` }}
        />
      )}
    </div>
  )
}

export default PersonalPreview