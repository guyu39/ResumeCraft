function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomDelay(): number {
  return 300 + Math.random() * 500
}

async function fillInput(el: HTMLInputElement, value: string): Promise<void> {
  el.focus()
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  nativeSetter.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  el.blur()
}

async function fillTextarea(el: HTMLTextAreaElement, value: string): Promise<void> {
  el.focus()
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  nativeSetter.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  el.blur()
}

async function fillSelect(el: HTMLSelectElement, value: string): Promise<void> {
  const option = [...el.options].find(
    (o) => o.value === value || o.text.includes(value),
  )
  if (option) {
    el.value = option.value
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }
}

async function fillCustomSelect(triggerEl: HTMLElement, value: string): Promise<void> {
  triggerEl.click()
  await sleep(300)
  const container = triggerEl.closest('[class*="select"]') ?? document
  const items = container.querySelectorAll(
    '.dropdown-item, [role="option"], li[class*="option"]',
  )
  const match = [...items].find((el) => el.textContent?.trim().includes(value))
  if (match && match instanceof HTMLElement) {
    match.click()
  }
}

async function fillDateField(el: HTMLElement, value: string): Promise<void> {
  if (el instanceof HTMLInputElement && el.type === 'date') {
    el.value = value.replace(/^\d{4}-\d{2}$/, '$&-01')
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return
  }

  const picker = el.closest('.ant-picker, .el-date-picker')
  if (picker) {
    const input = picker.querySelector('input') as HTMLInputElement | null
    if (input) {
      input.focus()
      document.execCommand('selectAll')
      document.execCommand('insertText', false, value)
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    }
    return
  }

  const container = el.closest('[class*="date"], [class*="picker"]') ?? el.parentElement
  if (container) {
    const yearEl = container.querySelector('select[class*="year"], input[placeholder*="年"]')
    const monthEl = container.querySelector('select[class*="month"], input[placeholder*="月"]')
    if (yearEl && monthEl) {
      const [year, month] = value.split('-')
      if (yearEl instanceof HTMLSelectElement) {
        await fillSelect(yearEl, year)
      } else if (yearEl instanceof HTMLInputElement) {
        await fillInput(yearEl, year)
      }
      await sleep(100)
      if (monthEl instanceof HTMLSelectElement) {
        await fillSelect(monthEl, month)
      } else if (monthEl instanceof HTMLInputElement) {
        await fillInput(monthEl, month)
      }
      return
    }
  }

  el.click()
  await sleep(300)
  const pickerInput = document.querySelector(
    '.picker-column input, [role="listbox"] input',
  ) as HTMLInputElement | null
  if (pickerInput) {
    await fillInput(pickerInput, value)
  }
}

export async function fillField(
  element: HTMLElement,
  value: string,
  resumeKey: string,
): Promise<boolean> {
  try {
    if (!value && value !== '0') return false

    if (element instanceof HTMLSelectElement) {
      await fillSelect(element, value)
    } else if (element instanceof HTMLTextAreaElement) {
      await fillTextarea(element, value)
    } else if (element instanceof HTMLInputElement) {
      if (element.type === 'date') {
        await fillDateField(element, value)
      } else {
        await fillInput(element, value)
      }
    } else if (element.isContentEditable) {
      element.focus()
      document.execCommand('selectAll')
      document.execCommand('insertText', false, value)
      element.blur()
    } else {
      return false
    }

    return true
  } catch {
    return false
  }
}

export async function fillFieldsSequentially(
  fields: Array<{ element: HTMLElement; value: string; resumeKey: string }>,
): Promise<number> {
  let successCount = 0

  for (const field of fields) {
    const ok = await fillField(field.element, field.value, field.resumeKey)
    if (ok) successCount++
    await sleep(randomDelay())
  }

  return successCount
}
