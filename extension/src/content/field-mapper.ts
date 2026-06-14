export interface FieldRule {
  resumeKey: string
  keywords: string[]
  type: 'text' | 'select' | 'date' | 'multi-select' | 'number-range'
  transform?: (value: unknown) => string
}

export const FIELD_RULES: FieldRule[] = [
  { resumeKey: 'personal.name', keywords: ['姓名', '名字', 'name', '真实姓名'], type: 'text' },
  { resumeKey: 'personal.phone', keywords: ['手机', '电话', 'phone', 'mobile', '联系电话'], type: 'text' },
  { resumeKey: 'personal.email', keywords: ['邮箱', 'email', 'e-mail', '电子邮件'], type: 'text' },
  { resumeKey: 'personal.gender', keywords: ['性别', 'gender', 'sex'], type: 'select' },
  { resumeKey: 'personal.education', keywords: ['学历', '最高学历', 'education', '文化程度'], type: 'select' },
  { resumeKey: 'personal.workYears', keywords: ['工作年限', '工作经验', 'workYears', '工作年份'], type: 'select' },
  { resumeKey: 'personal.age', keywords: ['出生日期', '生日', 'birthday', '出生年月', '出生年份'], type: 'date',
    transform: (v: unknown) => String(v) },
  { resumeKey: 'personal.hometown', keywords: ['籍贯', '户口', 'hometown', '户籍'], type: 'text' },
  { resumeKey: 'personal.city', keywords: ['期望城市', '工作城市', 'city', '现居城市', '所在城市'], type: 'text' },
  { resumeKey: 'personal.targetPosition', keywords: ['期望职位', '求职意向', 'targetPosition', '意向岗位'], type: 'text' },
  { resumeKey: 'personal.politics', keywords: ['政治面貌', 'politics', '党派'], type: 'select' },
  { resumeKey: 'summary', keywords: ['自我评价', '个人简介', 'summary', '优势', '个人优势'], type: 'text' },
]

export function matchByKeywords(container: HTMLElement, rule: FieldRule): HTMLElement | null {
  const inputs = container.querySelectorAll('input, select, textarea')
  for (const el of inputs) {
    const label = findAssociatedLabel(el)
    const placeholder = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      ? el.placeholder : ''
    const nameAttr = el.getAttribute('name') ?? ''

    const texts = [label, placeholder, nameAttr].filter(Boolean).map(s => s!.toLowerCase())

    for (const kw of rule.keywords) {
      for (const text of texts) {
        if (text.includes(kw.toLowerCase())) {
          return el as HTMLElement
        }
      }
    }
  }
  return null
}

function findAssociatedLabel(el: Element): string | null {
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`)
    if (label) return label.textContent?.trim() ?? null
  }

  const ariaLabel = el.getAttribute('aria-label')
  if (ariaLabel) return ariaLabel

  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy)
    if (labelEl) return labelEl.textContent?.trim() ?? null
  }

  const parent = el.closest('label, .form-item, .form-group, [class*="field"], [class*="form-row"]')
  if (parent && parent !== el) {
    const labelEl = parent.querySelector('label, .label, [class*="label"], [class*="title"]')
    if (labelEl && !labelEl.contains(el)) {
      return labelEl.textContent?.trim() ?? null
    }
  }

  const prevSibling = el.previousElementSibling
  if (prevSibling && (prevSibling.tagName === 'LABEL' || prevSibling.classList.contains('label'))) {
    return prevSibling.textContent?.trim() ?? null
  }

  return null
}
