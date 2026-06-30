// ============================================================
// personalLines — 个人信息文本行构建
// Modern / Minimal 模板复用此工具构建个人信息行。
// 翻译统一走 useI18n（由调用方传入 t/te/locale），与 Classic 的 PersonalPreview 对齐，避免翻译漂移。
// ============================================================

import { PersonalData } from '@/types/resume'

interface I18nLike {
  t: (key: string, params?: Record<string, string | number>) => string
  te: (enumValue: string) => string
  locale: string
}

// 构建个人信息行。i18n 来自调用方的 useI18n()，确保与字典一致、随 resume.locale 切换。
export function buildPersonalLines(data: PersonalData | undefined, i18n: I18nLike): string[] {
  if (!data) return []

  const { t, te, locale } = i18n
  const sep = locale === 'en-US' ? ': ' : '：'

  const birthText = (() => {
    if (!data.age) return ''
    if (/^\d{4}-\d{2}$/.test(data.age)) {
      const [year, month] = data.age.split('-')
      return locale === 'en-US' ? `${month}/${year}` : `${year}年${month}月`
    }
    return data.age
  })()

  return [
    ...(birthText ? [`${t('label.birthDate')}${sep}${birthText}`] : []),
    ...(data.hometown ? [`${t('label.hometown')}${sep}${data.hometown}`] : []),
    ...(data.email ? [`${t('label.email')}${sep}${data.email}`] : []),
    ...(data.phone ? [`${t('label.phone')}${sep}${data.phone}`] : []),
    ...(data.city ? [`${t('label.city')}${sep}${data.city}`] : []),
    ...(data.gender ? [`${t('label.gender')}${sep}${te(data.gender)}`] : []),
    ...(data.education ? [`${t('label.education')}${sep}${te(data.education)}`] : []),
    ...(data.politics ? [`${t('label.politics')}${sep}${te(data.politics)}`] : []),
    ...(data.workYears ? [`${t('label.workYears')}${sep}${te(data.workYears)}`] : []),
    // 个人账号：与 PersonalPreview 一致，用 platform 名作标签（而非「个人账号」字样）
    ...(data.personalAccount?.platform && data.personalAccount?.url
      ? [`${data.personalAccount.platform}${sep}${data.personalAccount.url}`]
      : []),
    ...((data.extraInfos ?? [])
      .filter((item) => item.title && item.value)
      .map((item) => `${item.title}${sep}${item.value}`)),
  ]
}
