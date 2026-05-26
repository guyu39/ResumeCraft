type SuspiciousChar = {
    char: string
    codePoint: string
    block: string
}

type CodePointRange = {
    start: number
    end: number
    block: string
}

export type ClipboardInspection = {
    nextText: string
    message: string | null
    fixed: boolean
    remaining: SuspiciousChar[]
}

const SUSPICIOUS_RANGES: CodePointRange[] = [
    { start: 0x2e80, end: 0x2eff, block: 'CJK 部首补充' },
    { start: 0x2f00, end: 0x2fdf, block: '康熙部首' },
    { start: 0x31c0, end: 0x31ef, block: 'CJK 笔画' },
    { start: 0xf900, end: 0xfaff, block: 'CJK 兼容表意文字' },
    { start: 0x2f800, end: 0x2fa1f, block: 'CJK 兼容表意文字补充' },
]

const MAX_REPORT_COUNT = 8
const AUTO_FIX_KEY = 'resumecraft_clipboard_autofix_v1'

const formatCodePoint = (value: number): string => {
    return `U+${value.toString(16).toUpperCase().padStart(4, '0')}`
}

const matchSuspiciousRange = (codePoint: number): CodePointRange | null => {
    return SUSPICIOUS_RANGES.find((range) => codePoint >= range.start && codePoint <= range.end) ?? null
}

const buildPreview = (items: SuspiciousChar[]): string => {
    return items
        .map((item) => `${item.char} (${item.codePoint},)`)
        .join('、')
}

export const findSuspiciousChars = (text: string): SuspiciousChar[] => {
    const result: SuspiciousChar[] = []
    const seen = new Set<number>()

    for (const char of text) {
        const codePoint = char.codePointAt(0)
        if (!codePoint || seen.has(codePoint)) continue

        const range = matchSuspiciousRange(codePoint)
        if (!range) continue

        seen.add(codePoint)
        result.push({
            char,
            codePoint: formatCodePoint(codePoint),
            block: range.block,
        })

        if (result.length >= MAX_REPORT_COUNT) break
    }

    return result
}

export const getAutoFixEnabled = (): boolean => {
    try {
        return localStorage.getItem(AUTO_FIX_KEY) === '1'
    } catch {
        return false
    }
}

export const setAutoFixEnabled = (enabled: boolean): void => {
    try {
        localStorage.setItem(AUTO_FIX_KEY, enabled ? '1' : '0')
    } catch {
        // noop
    }
}

export const inspectClipboardText = (text: string, autoFix: boolean): ClipboardInspection => {
    if (!text) {
        return { nextText: text, message: null, fixed: false, remaining: [] }
    }

    const originalSuspicious = findSuspiciousChars(text)
    if (originalSuspicious.length === 0) {
        return { nextText: text, message: null, fixed: false, remaining: [] }
    }

    let nextText = text
    let fixed = false

    if (autoFix) {
        const normalized = text.normalize('NFKC')
        if (normalized !== text) {
            nextText = normalized
            fixed = true
        }
    }

    const remaining = findSuspiciousChars(nextText)
    const previewSource = remaining.length > 0 ? remaining : originalSuspicious
    const preview = buildPreview(previewSource)

    const message = autoFix
        ? (remaining.length === 0
            ? `检测到疑似异常字符：${preview}，已修复`
            : `检测到疑似异常字符：${preview}，未修复`)
        : `检测到疑似异常字符：${preview}`

    return { nextText, message, fixed, remaining }
}
