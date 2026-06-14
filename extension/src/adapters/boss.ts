import type { PlatformAdapter, FieldSelectorMap } from './types'

const BOSS_SELECTORS: FieldSelectorMap = {
  'personal.name': 'input[name="name"], .name-input input, input[placeholder*="姓名"]',
  'personal.phone': 'input[name="phone"], input[placeholder*="手机"], input[placeholder*="电话"]',
  'personal.email': 'input[name="email"], input[placeholder*="邮箱"], input[type="email"]',
  'personal.gender': '.gender-select select, [class*="gender"] select, select[name="gender"]',
  'personal.education': '.education-select select, [class*="education"] select, select[name="education"]',
  'personal.workYears': '.work-year-select select, [class*="workYear"] select, select[name="workYears"]',
  'personal.city': '.city-select input, [class*="expectCity"] input, input[placeholder*="城市"]',
  'personal.targetPosition': 'input[name="position"], input[placeholder*="期望职位"], input[placeholder*="求职意向"]',
  'summary': 'textarea[name="advantage"], textarea[placeholder*="优势"], textarea[placeholder*="自我评价"]',
}

export const bossAdapter: PlatformAdapter = {
  isApplyPage() {
    return /boss\.zhipin\.com/.test(location.hostname)
      && /\/geek\/interaction\/delivery|\/chat/.test(location.pathname)
  },

  getFieldSelectors() {
    return BOSS_SELECTORS
  },

  getFormContainer() {
    return document.querySelector('.delivery-form, .chat-container, .job-detail-wrapper')
      ?? document.body
  },
}
