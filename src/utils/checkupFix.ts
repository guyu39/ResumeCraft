// ============================================================
// checkupFix — 体检 finding 一键修复工具
// 分档：auto（纯规则）/ rewrite（LLM 定向改写）/ guide（跳转引导）
// ============================================================

import type { CheckupFinding } from '@/api/ai'
import type { Resume, Module } from '@/types/resume'

export type FixTier = 'auto' | 'rewrite' | 'guide'

// finding code → 修复档位。未知 code 一律降级为 guide。
const TIER_MAP: Record<string, FixTier> = {
    date_format_inconsistent: 'auto',
    skill_evidence_missing: 'rewrite',
    experience_skill_missing: 'rewrite',
    metric_conflict: 'rewrite',
    title_mismatch: 'rewrite',
    placeholder_content: 'guide',   // 占位/乱填需用户补真实内容，不自动改
    content_authenticity: 'guide',  // 真实性存疑需用户核实，不自动改
    timeline_gap: 'guide',
    timeline_overlap: 'guide',
    i18n_mismatch: 'guide',
}

export const getFixTier = (code: string): FixTier => TIER_MAP[code] ?? 'guide'

// 含 description / content 正文的模块条目定位结果
export interface LocatedTarget {
    moduleId: string
    moduleType: string
    itemIndex: number // -1 表示单字段模块（skills/summary 的 content）
    fieldKey: string // 'description' | 'content'
    original: string
}

const ITEM_TYPES = ['work', 'project']
const SINGLE_TYPES = ['skills', 'summary']

// 用 anchorText 在目标模块的可改写正文里反查具体条目。匹配失败返回 null（降级 guide）。
export const locateItem = (resume: Resume, finding: CheckupFinding): LocatedTarget | null => {
    const anchor = (finding.anchorText ?? '').trim()
    if (!anchor) return null

    const targetType = finding.targetModule || finding.modules[0]
    if (!targetType) return null

    const candidates = resume.modules.filter((m) => m.type === targetType)
    if (candidates.length === 0) return null

    for (const mod of candidates) {
        if (ITEM_TYPES.includes(mod.type)) {
            const items = (mod.data as { items?: Array<Record<string, unknown>> }).items ?? []
            const idx = items.findIndex((it) => String(it.description ?? '').includes(anchor))
            if (idx !== -1) {
                return {
                    moduleId: mod.id,
                    moduleType: mod.type,
                    itemIndex: idx,
                    fieldKey: 'description',
                    original: String(items[idx].description ?? ''),
                }
            }
        } else if (SINGLE_TYPES.includes(mod.type)) {
            const content = String((mod.data as { content?: string }).content ?? '')
            if (content.includes(anchor)) {
                return {
                    moduleId: mod.id,
                    moduleType: mod.type,
                    itemIndex: -1,
                    fieldKey: 'content',
                    original: content,
                }
            }
        }
    }
    return null
}

// ---- A 档：日期格式统一（纯规则，不调 LLM） ----

// 识别并归一为 YYYY.MM。支持 2021/03、2021-03、2021年3月、2021.3 等常见写法。
// 无法解析的原样保留（如「至今」「present」）。
const normalizeDate = (raw: string): string => {
    const s = raw.trim()
    if (!s) return s
    // 保留非日期占位词
    if (/^(至今|present|now|current|今|在职)$/i.test(s)) return s

    const m = s.match(/(\d{4})\s*[年./\-]\s*(\d{1,2})?/)
    if (!m) return s
    const year = m[1]
    const month = m[2] ? String(Number(m[2])).padStart(2, '0') : ''
    return month ? `${year}.${month}` : year
}

// 生成日期统一的逐模块更新计划：moduleId → 新 items 数组
export interface DateFixPlan {
    moduleId: string
    items: Array<Record<string, unknown>>
}

export const buildDateFixPlan = (resume: Resume): DateFixPlan[] => {
    const plans: DateFixPlan[] = []
    for (const mod of resume.modules) {
        const items = (mod.data as { items?: Array<Record<string, unknown>> }).items
        if (!Array.isArray(items)) continue
        let changed = false
        const nextItems = items.map((it) => {
            const next = { ...it }
            if (typeof it.startDate === 'string') {
                const n = normalizeDate(it.startDate)
                if (n !== it.startDate) { next.startDate = n; changed = true }
            }
            if (typeof it.endDate === 'string') {
                const n = normalizeDate(it.endDate)
                if (n !== it.endDate) { next.endDate = n; changed = true }
            }
            return next
        })
        if (changed) plans.push({ moduleId: mod.id, items: nextItems })
    }
    return plans
}

// 取 finding 的修复指令文本（优先 fixHint，回退 suggestion+detail）
export const buildFixInstruction = (finding: CheckupFinding): string => {
    const hint = (finding.fixHint ?? '').trim()
    if (hint) return hint
    return [finding.detail, finding.suggestion].filter(Boolean).join(' ').trim()
}

// finding 在列表中的唯一 key（code 可能重复，附加 index）
export const findingKey = (finding: CheckupFinding, index: number): string =>
    `${finding.code}-${index}`

// 供面板判断模块是否存在
export const moduleExists = (modules: Module[], type: string): boolean =>
    modules.some((m) => m.type === type)
