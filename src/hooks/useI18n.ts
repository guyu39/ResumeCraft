import { useResumeStore } from '@/store/resumeStore'
import type { ResumeLocale } from '@/types/resume'
import dict from '@/i18n/resume'

/**
 * 简历组件 i18n hook
 *
 * 根据当前 resume.locale 返回对应的翻译文本
 *
 * 用法:
 *   const { t, locale } = useI18n()
 *   t('personal.birthDate')  // → '出生年月' | 'Date of Birth'
 *   t('common.itemN', { n: 2 })  // → '第2条' | 'Item 2'
 */
export function useI18n() {
  const locale = useResumeStore((s) => s.resume.locale) as ResumeLocale

  function t(key: string, params?: Record<string, string | number>): string {
    const entry = dict[key]
    if (!entry) {
      console.warn(`[i18n] Missing key: ${key}`)
      return key
    }
    let text = entry[locale] ?? entry['zh-CN'] ?? key
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      })
    }
    return text
  }

  /** 翻译枚举值（如学历、性别等）— 输入中文值，返回对应 locale 的文本 */
  function te(enumValue: string): string {
    // 在字典中查找 zh-CN 值匹配 enumValue 的条目，返回对应 locale 的文本
    for (const entry of Object.values(dict)) {
      if (entry['zh-CN'] === enumValue) {
        return entry[locale] ?? enumValue
      }
    }
    return enumValue
  }

  /** 格式化日期范围 */
  function formatDate(startDate?: string, endDate?: string): string {
    const fmt = (d: string) => {
      const [y, m] = d.split('-')
      if (locale === 'en-US') {
        return m && y ? `${m}/${y}` : d
      }
      return m && y ? `${y}年${m}月` : d
    }
    const start = startDate ? fmt(startDate) : ''
    const end = endDate ? fmt(endDate) : ''
    if (!start && !end) return ''
    return `${start} - ${end || t('enum.present')}`
  }

  return { t, te, locale, formatDate }
}
