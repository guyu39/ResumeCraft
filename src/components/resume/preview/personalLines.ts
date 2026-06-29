// ============================================================
// personalLines — 个人信息文本行构建
// 把原本在 Modern / Minimal 模板里各复制一份的个人信息行构建逻辑收敛到一处。
// Classic 走独立的 PersonalPreview 组件，不使用此工具。
// ============================================================

import { PersonalData } from '@/types/resume'

// 根据语言构建个人信息的标签/枚举翻译。
// 抽出后 Modern/Minimal 共用同一份中英枚举表，避免漂移。
export function buildPersonalLines(data: PersonalData | undefined, locale: string): string[] {
  if (!data) return []

  const isEn = locale === 'en-US'
  const sep = isEn ? ': ' : '：'

  const labelMap: Record<string, string> = isEn
    ? { birthDate: 'DOB', hometown: 'Hometown', email: 'Email', phone: 'Phone', city: 'City', gender: 'Gender', education: 'Education', politics: 'Political Status', workYears: 'Exp.', personalAccount: 'Account' }
    : { birthDate: '出生年月', hometown: '籍贯', email: '邮箱', phone: '电话', city: '城市', gender: '性别', education: '学历', politics: '政治面貌', workYears: '工作年限', personalAccount: '个人账号' }

  const enumMap: Record<string, string> = isEn
    ? { '男': 'Male', '女': 'Female', '初中': 'Junior High', '中专': 'Vocational', '高中': 'High School', '大专': 'Associate', '本科': "Bachelor's", '硕士': "Master's", '博士': 'Doctorate', '群众': 'Non-partisan', '共青团员': 'CYL Member', '中共党员': 'CPC Member', '中共预备党员': 'Probationary CPC Member', '民主党派': 'Democratic Party', '应届毕业生': 'Fresh Graduate', '1年以下': '< 1 year', '1-3年': '1-3 years', '3-5年': '3-5 years', '5-10年': '5-10 years', '10年以上': '10+ years' }
    : {}
  const te = (v: string) => enumMap[v] ?? v

  const birthText = (() => {
    if (!data.age) return ''
    if (/^\d{4}-\d{2}$/.test(data.age)) {
      const [year, month] = data.age.split('-')
      return isEn ? `${month}/${year}` : `${year}年${month}月`
    }
    return data.age
  })()

  return [
    ...(birthText ? [`${labelMap.birthDate}${sep}${birthText}`] : []),
    ...(data.hometown ? [`${labelMap.hometown}${sep}${data.hometown}`] : []),
    ...(data.email ? [`${labelMap.email}${sep}${data.email}`] : []),
    ...(data.phone ? [`${labelMap.phone}${sep}${data.phone}`] : []),
    ...(data.city ? [`${labelMap.city}${sep}${data.city}`] : []),
    ...(data.gender ? [`${labelMap.gender}${sep}${te(data.gender)}`] : []),
    ...(data.education ? [`${labelMap.education}${sep}${te(data.education)}`] : []),
    ...(data.politics ? [`${labelMap.politics}${sep}${te(data.politics)}`] : []),
    ...(data.workYears ? [`${labelMap.workYears}${sep}${te(data.workYears)}`] : []),
    ...(data.personalAccount?.platform && data.personalAccount?.url ? [`${labelMap.personalAccount || '个人账号'}${sep}${data.personalAccount.platform}`] : []),
    ...((data.extraInfos ?? [])
      .filter((item) => item.title && item.value)
      .map((item) => `${item.title}${sep}${item.value}`)),
  ]
}
