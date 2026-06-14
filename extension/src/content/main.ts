import './content.css'
import { detectPlatform } from './detector'
import { bossAdapter } from '../adapters/boss'
import type { PlatformAdapter, FieldSelectorMap } from '../adapters/types'
import { matchByKeywords, FIELD_RULES, type FieldRule } from './field-mapper'
import { fillField } from './simulator'
import { highlightSuccess, highlightUnmatched, showSummary } from './highlight'
import type { ResolvedResumeData } from '../core/resolver'
import { resolveModules } from '../core/resolver'

const ADAPTERS: Record<string, PlatformAdapter> = {
  boss: bossAdapter,
}

interface FillResult {
  filled: number
  unmatched: number
  details: Array<{ resumeKey: string; selector: string; success: boolean }>
}

function getAdapter(key: string): PlatformAdapter | null {
  return ADAPTERS[key] ?? null
}

function getResumeValue(data: ResolvedResumeData, key: string): string | undefined {
  const parts = key.split('.')
  if (parts.length === 1) {
    const val = (data as unknown as Record<string, unknown>)[key]
    return typeof val === 'string' ? val : undefined
  }
  if (parts.length === 2) {
    const [section, field] = parts
    const sectionData = (data as unknown as Record<string, unknown>)[section]
    if (sectionData && typeof sectionData === 'object') {
      const val = (sectionData as Record<string, unknown>)[field]
      if (typeof val === 'string') return val
      if (typeof val === 'object' && val !== null) {
        if (field === 'personalAccount') {
          const acct = val as { platform?: string; url?: string }
          return acct.url || undefined
        }
        return JSON.stringify(val)
      }
    }
  }
  return undefined
}

async function executeFill(data: ResolvedResumeData): Promise<FillResult> {
  const info = detectPlatform()
  if (!info.detected || !info.platform) {
    return { filled: 0, unmatched: 0, details: [] }
  }

  const adapter = getAdapter(info.platform.adapterKey)
  const container = adapter?.getFormContainer() ?? document.body

  const result: FillResult = { filled: 0, unmatched: 0, details: [] }

  const adapterSelectors: FieldSelectorMap = adapter?.getFieldSelectors() ?? {}
  const allKeys = new Set<string>([
    ...Object.keys(adapterSelectors),
    ...FIELD_RULES.map((r: FieldRule) => r.resumeKey),
  ])

  for (const resumeKey of allKeys) {
    const value = getResumeValue(data, resumeKey)
    if (!value) continue

    let el: HTMLElement | null = null

    if (adapterSelectors[resumeKey]) {
      el = container.querySelector<HTMLElement>(adapterSelectors[resumeKey])
    }

    if (!el) {
      const rule = FIELD_RULES.find((r: FieldRule) => r.resumeKey === resumeKey)
      if (rule) {
        el = matchByKeywords(container, rule)
      }
    }

    if (el) {
      const success = await fillField(el, value, resumeKey)
      if (success) {
        highlightSuccess(el)
        result.filled++
        result.details.push({ resumeKey, selector: adapterSelectors[resumeKey] || 'keyword', success: true })
      } else {
        highlightUnmatched(el)
        result.unmatched++
        result.details.push({ resumeKey, selector: adapterSelectors[resumeKey] || 'keyword', success: false })
      }
    }
  }

  showSummary(result.filled, result.unmatched)
  return result
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'FILL_FORM') {
    const modules = (msg.modules ?? []) as Array<{ type: string; data: Record<string, unknown>; title?: string; id?: string }>
    const data = resolveModules(modules)
    executeFill(data)
      .then(sendResponse)
      .catch((err: Error) => sendResponse({ error: err.message }))
    return true
  }

  if (msg.type === 'PING') {
    const info = detectPlatform()
    sendResponse({
      detected: info.detected,
      isApplyPage: info.isApplyPage,
      platform: info.platform?.name ?? null,
    })
    return false
  }

  return false
})

const info = detectPlatform()
if (info.detected && info.isApplyPage) {
  chrome.runtime.sendMessage({ type: 'PAGE_DETECTED', platform: info.platform?.name })
}
