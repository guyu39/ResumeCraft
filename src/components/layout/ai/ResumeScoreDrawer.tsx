import React, { useEffect, useMemo, useState } from 'react'
import type { ModuleType } from '@/types/resume'
import type { ResumeEvaluateOutput } from '@/ai'

interface ResumeScoreDrawerProps {
    open: boolean
    embedded?: boolean
    result: ResumeEvaluateOutput | null
    loading: boolean
    error: string | null
    streamText: string
    currentResumeUpdatedAt: number
    evaluatedResumeUpdatedAt: number | null
    lastEvaluatedAt: number | null
    modeLabel?: string
    onClose: () => void
    onReevaluate: () => void
    onRetry: () => void
    onJumpToModule: (moduleType: ModuleType) => void
}

interface StreamDimensionPreview {
    key: string
    label: string
    score?: number
    comment?: string
}

interface StreamIssuePreview {
    id: string
    severity?: 'high' | 'medium' | 'low'
    title?: string
    description?: string
    suggestion?: string
}

interface StreamPreview {
    overallScore: number | null
    level: string | null
    summary: string | null
    dimensions: StreamDimensionPreview[]
    issues: StreamIssuePreview[]
    actionItems: string[]
    hasStructuredContent: boolean
}

interface DimensionChartItem {
    key: string
    label: string
    score: number | null
    comment?: string
}

const REQUIRED_DIMENSIONS: Array<{ key: string; label: string; defaultComment: string }> = [
    { key: 'structure', label: '结构完整性', defaultComment: '评估简历结构与模块完整程度。' },
    { key: 'content_relevance', label: '内容相关性', defaultComment: '评估经历与目标岗位的相关程度。' },
    { key: 'skill_experience', label: '技能与经验展示', defaultComment: '评估技能证据与实践经验展示质量。' },
    { key: 'language_format', label: '语言表达与格式', defaultComment: '评估语言表达清晰度与格式规范性。' },
    { key: 'overall_impression', label: '整体印象', defaultComment: '评估整体专业感与可读性。' },
    { key: 'quantified_impact', label: '量化成果与影响力', defaultComment: '评估成果量化与业务影响力表达。' },
]

const normalizeStreamText = (streamText: string): string => {
    return streamText
        .replace(/\r/g, '')
        .replace(/：/g, ':')
}

const extractQuotedField = (text: string, fieldName: string): string | null => {
    const keyPattern = new RegExp(`["“”]${fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["“”]\\s*:`)
    const keyMatch = keyPattern.exec(text)
    if (!keyMatch) return null

    let index = (keyMatch.index ?? 0) + keyMatch[0].length
    while (index < text.length && /\s/.test(text[index])) index += 1

    const startQuote = text[index]
    const quotePairs: Record<string, string> = {
        '"': '"',
        "'": "'",
        '“': '”',
        '‘': '’',
    }
    const endQuote = quotePairs[startQuote]
    if (!endQuote) return null

    index += 1
    let escaped = false
    let result = ''

    while (index < text.length) {
        const char = text[index]
        if (startQuote === '"' && !escaped && char === '\\') {
            escaped = true
            result += char
            index += 1
            continue
        }

        if (char === endQuote && !escaped) {
            return result.replace(/\\n/g, '\n').trim()
        }

        escaped = false
        result += char
        index += 1
    }

    // 流式未闭合时返回当前已到达片段
    return result.replace(/\\n/g, '\n').trim() || null
}

const extractArraySection = (source: string, fieldName: string): string | null => {
    const keyRegex = new RegExp(`["“”]${fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["“”]\\s*:`)
    const keyMatch = keyRegex.exec(source)
    if (!keyMatch) return null

    const start = source.indexOf('[', (keyMatch.index ?? 0) + keyMatch[0].length)
    if (start === -1) return null

    let inString = false
    let escaped = false
    let depth = 0

    for (let i = start; i < source.length; i += 1) {
        const char = source[i]
        if (inString) {
            if (escaped) {
                escaped = false
            } else if (char === '\\') {
                escaped = true
            } else if (char === '"') {
                inString = false
            }
            continue
        }

        if (char === '"') {
            inString = true
            continue
        }

        if (char === '[') {
            depth += 1
            continue
        }

        if (char === ']') {
            depth -= 1
            if (depth === 0) {
                return source.slice(start + 1, i)
            }
        }
    }

    // 流式阶段可能尚未闭合
    return source.slice(start + 1)
}

const parseObjectBlocksFromArray = (source: string): string[] => {
    const blocks: string[] = []
    let start = -1
    let depth = 0
    let inString = false
    let escaped = false

    for (let i = 0; i < source.length; i += 1) {
        const char = source[i]

        if (inString) {
            if (escaped) {
                escaped = false
            } else if (char === '\\') {
                escaped = true
            } else if (char === '"') {
                inString = false
            }
            continue
        }

        if (char === '"') {
            inString = true
            continue
        }

        if (char === '{') {
            if (depth === 0) start = i
            depth += 1
            continue
        }

        if (char === '}') {
            depth -= 1
            if (depth === 0 && start !== -1) {
                blocks.push(source.slice(start, i + 1))
                start = -1
            }
        }
    }

    return blocks
}

const extractNumberField = (text: string, fieldName: string): number | null => {
    const escapedField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const numberMatch = text.match(new RegExp(`["“”]${escapedField}["“”]\\s*:\\s*(-?\\d{1,3}(?:\\.\\d+)?)`))
    if (!numberMatch) {
        return null
    }
    const value = Number(numberMatch[1])
    return Number.isFinite(value) ? value : null
}

const parseQuotedItemsFromArray = (sectionText: string): string[] => {
    const result: string[] = []
    let index = 0

    while (index < sectionText.length) {
        const start = sectionText.indexOf('"', index)
        if (start === -1) break
        index = start + 1

        let value = ''
        let escaped = false
        while (index < sectionText.length) {
            const char = sectionText[index]
            if (!escaped && char === '\\') {
                escaped = true
                value += char
                index += 1
                continue
            }
            if (!escaped && char === '"') {
                index += 1
                break
            }
            escaped = false
            value += char
            index += 1
        }

        const normalized = value.replace(/\\n/g, '\n').trim()
        if (normalized && normalized.length >= 6) {
            result.push(normalized)
        }
    }

    return result.slice(0, 3)
}

const levelColorClass = (score: number): string => {
    if (score >= 85) return 'text-green-600'
    if (score >= 70) return 'text-amber-600'
    return 'text-red-600'
}

const severityClassMap: Record<'high' | 'medium' | 'low', string> = {
    high: 'bg-red-50 text-red-700 border-red-100',
    medium: 'bg-amber-50 text-amber-700 border-amber-100',
    low: 'bg-blue-50 text-blue-700 border-blue-100',
}

const severityTextMap: Record<'high' | 'medium' | 'low', string> = {
    high: '高',
    medium: '中',
    low: '低',
}

const parseStreamPreview = (streamText: string): StreamPreview => {
    const text = normalizeStreamText(streamText)

    const overallScoreMatch = text.match(/"overallScore"\s*:\s*(\d{1,3})/)
    const levelMatch = text.match(/"level"\s*:\s*"([^"]*)"/)
    const summaryValue = extractQuotedField(text, 'summary')

    const dimensions: StreamDimensionPreview[] = []
    const dimensionSection = extractArraySection(text, 'dimensions') ?? ''
    const dimensionBlocks = parseObjectBlocksFromArray(dimensionSection)
    dimensionBlocks.forEach((block) => {
        const key = extractQuotedField(block, 'key')
        const label = extractQuotedField(block, 'label')
        if (!key || !label) return

        const score = extractNumberField(block, 'score')
        const comment = extractQuotedField(block, 'comment') ?? undefined
        dimensions.push({
            key,
            label,
            score: score === null ? undefined : Math.max(0, Math.min(100, Math.round(score))),
            comment,
        })
    })

    const issues: StreamIssuePreview[] = []
    const issueSection = extractArraySection(text, 'issues') ?? ''
    const issueBlocks = parseObjectBlocksFromArray(issueSection)
    issueBlocks.forEach((block, index) => {
        const id = extractQuotedField(block, 'id') ?? `issue-${index + 1}`
        const severityValue = extractQuotedField(block, 'severity')
        const title = extractQuotedField(block, 'title') ?? undefined
        const description = extractQuotedField(block, 'description') ?? undefined
        const suggestion = extractQuotedField(block, 'suggestion') ?? undefined

        issues.push({
            id,
            severity: severityValue === 'high' || severityValue === 'medium' || severityValue === 'low'
                ? severityValue
                : undefined,
            title,
            description,
            suggestion,
        })
    })

    const actionItems = parseQuotedItemsFromArray(extractArraySection(text, 'actionItems') ?? '')

    const summary = summaryValue ?? null
    const overallScore = overallScoreMatch ? Number(overallScoreMatch[1]) : null
    const level = levelMatch?.[1] ?? null

    const hasStructuredContent = overallScore !== null
        || level !== null
        || Boolean(summary)
        || dimensions.length > 0
        || issues.length > 0
        || actionItems.length > 0

    return {
        overallScore,
        level,
        summary,
        dimensions,
        issues,
        actionItems,
        hasStructuredContent,
    }
}

const HEX_AXIS_COUNT = 6

const normalizeDimensionScore = (score: number | null): number | null => {
    if (score === null || !Number.isFinite(score)) return null
    return Math.min(100, Math.max(0, score))
}

const normalizeDimensionItems = (items: Array<{ key?: string; label: string; score?: number; comment?: string }>): DimensionChartItem[] => {
    const byKey = new Map<string, DimensionChartItem>()

    items.forEach((item) => {
        const normalizedKey = (item.key ?? '').trim().toLowerCase()
        const match = REQUIRED_DIMENSIONS.find((required) => {
            if (normalizedKey && required.key === normalizedKey) return true
            return required.label === item.label
        })

        if (!match) return

        byKey.set(match.key, {
            key: match.key,
            label: match.label,
            score: typeof item.score === 'number' ? item.score : null,
            comment: item.comment?.trim() || match.defaultComment,
        })
    })

    return REQUIRED_DIMENSIONS.map((required) => {
        const existing = byKey.get(required.key)
        if (existing) return existing
        return {
            key: required.key,
            label: required.label,
            score: null,
            comment: required.defaultComment,
        }
    })
}

const toHexSeries = (items: DimensionChartItem[]): DimensionChartItem[] => {
    const trimmed = items.slice(0, HEX_AXIS_COUNT)
    if (trimmed.length >= HEX_AXIS_COUNT) {
        return trimmed
    }

    const placeholders = Array.from({ length: HEX_AXIS_COUNT - trimmed.length }, (_, index) => ({
        key: `placeholder-${trimmed.length + index + 1}`,
        label: `维度${trimmed.length + index + 1}`,
        score: null,
        comment: '暂无该维度评论。',
    }))

    return [...trimmed, ...placeholders]
}

const HexDimensionChart: React.FC<{ items: DimensionChartItem[] }> = ({ items }) => {
    const series = toHexSeries(items)
    const [hoverIndex, setHoverIndex] = useState<number | null>(null)
    const center = 120
    const radius = 74
    const levels = [20, 40, 60, 80, 100]

    const getPoint = (index: number, percent: number) => {
        const angle = -Math.PI / 2 + (Math.PI * 2 * index) / HEX_AXIS_COUNT
        const scale = Math.max(0, Math.min(100, percent)) / 100
        return {
            x: center + radius * scale * Math.cos(angle),
            y: center + radius * scale * Math.sin(angle),
        }
    }

    const toPath = (percentList: number[]) => {
        const points = percentList.map((percent, index) => getPoint(index, percent))
        return points.map((point) => `${point.x},${point.y}`).join(' ')
    }

    const radarPath = toPath(series.map((item) => normalizeDimensionScore(item.score) ?? 0))
    const hoverItem = hoverIndex === null ? null : series[hoverIndex]

    return (
        <div>
            <svg viewBox="0 0 240 240" className="mx-auto h-60 w-full max-w-[260px]">
                {levels.map((level) => (
                    <polygon
                        key={`grid-${level}`}
                        points={toPath(Array.from({ length: HEX_AXIS_COUNT }, () => level))}
                        fill="none"
                        stroke="#e5e7eb"
                        strokeWidth="1"
                    />
                ))}

                {series.map((item, index) => {
                    const point = getPoint(index, 100)
                    const labelPoint = getPoint(index, 115)
                    return (
                        <g key={`axis-${item.key}-${index}`}>
                            <line
                                x1={center}
                                y1={center}
                                x2={point.x}
                                y2={point.y}
                                stroke="#e5e7eb"
                                strokeWidth="1"
                            />
                            <text
                                x={labelPoint.x}
                                y={labelPoint.y}
                                fill="#6b7280"
                                fontSize="11"
                                textAnchor={labelPoint.x < center - 8 ? 'end' : labelPoint.x > center + 8 ? 'start' : 'middle'}
                                dominantBaseline="middle"
                                className="cursor-default"
                                onMouseEnter={() => setHoverIndex(index)}
                                onMouseLeave={() => setHoverIndex((current) => (current === index ? null : current))}
                            >
                                {item.label}
                            </text>
                        </g>
                    )
                })}

                <polygon points={radarPath} fill="rgba(37, 99, 235, 0.16)" stroke="#2563eb" strokeWidth="2" />
                {series.map((item, index) => {
                    const point = getPoint(index, normalizeDimensionScore(item.score) ?? 0)
                    return (
                        <circle
                            key={`dot-${item.key}-${index}`}
                            cx={point.x}
                            cy={point.y}
                            r="4"
                            fill="#2563eb"
                            className="cursor-pointer"
                            onMouseEnter={() => setHoverIndex(index)}
                            onMouseLeave={() => setHoverIndex((current) => (current === index ? null : current))}
                        />
                    )
                })}
            </svg>

            {hoverItem && (
                <div className="mt-1 rounded-md border border-blue-100 bg-blue-50 px-2 py-1.5 text-[11px] leading-5 text-blue-800">
                    {`${hoverItem.label}：${hoverItem.comment ?? '暂无评论'}${hoverItem.score === null ? '' : `（${hoverItem.score}分）`}`}
                </div>
            )}
        </div>
    )
}

const ResumeScoreDrawer: React.FC<ResumeScoreDrawerProps> = ({
    open,
    embedded = false,
    result,
    loading,
    error,
    streamText,
    currentResumeUpdatedAt,
    evaluatedResumeUpdatedAt,
    lastEvaluatedAt,
    modeLabel,
    onClose,
    onReevaluate,
    onRetry,
    onJumpToModule,
}) => {
    if (!open) return null

    const [elapsedSeconds, setElapsedSeconds] = useState(0)
    const [thinkingCollapsed, setThinkingCollapsed] = useState(false)

    const isLatest = evaluatedResumeUpdatedAt !== null && evaluatedResumeUpdatedAt === currentResumeUpdatedAt
    const hasVersionInfo = evaluatedResumeUpdatedAt !== null
    const evaluatedAtText = lastEvaluatedAt ? new Date(lastEvaluatedAt).toLocaleString() : '未知'

    const streamPreview = useMemo(() => parseStreamPreview(streamText), [streamText])
    const streamDimensionItems = useMemo(
        () => normalizeDimensionItems(streamPreview.dimensions),
        [streamPreview.dimensions],
    )
    const resultDimensionItems = useMemo(
        () => normalizeDimensionItems(result?.dimensions ?? []),
        [result?.dimensions],
    )
    const resultActionItems = useMemo(
        () => (result?.actionItems ?? [])
            .map((item) => item.trim())
            .filter((item) => item.length >= 6)
            .slice(0, 3),
        [result?.actionItems],
    )

    const thinkingNotes = useMemo(() => {
        const notes: string[] = []
        if (streamPreview.overallScore !== null || streamPreview.level) {
            notes.push('正在生成综合评分结果...')
        }
        if (streamPreview.summary) {
            notes.push('正在生成评估摘要...')
        }
        if (streamPreview.dimensions.length > 0) {
            notes.push(`正在补全维度评分（已识别 ${streamPreview.dimensions.length} 项）...`)
        }
        if (streamPreview.issues.length > 0) {
            notes.push(`正在整理重点问题（已识别 ${streamPreview.issues.length} 条）...`)
        }
        if (streamPreview.actionItems.length > 0) {
            notes.push('正在生成优化动作建议...')
        }
        if (notes.length === 0) {
            notes.push('正在分析简历内容并提取结构化结果...')
        }
        return notes
    }, [streamPreview])

    useEffect(() => {
        if (!loading) {
            setElapsedSeconds(0)
            setThinkingCollapsed(false)
            return
        }

        setElapsedSeconds(0)

        const timer = window.setInterval(() => {
            setElapsedSeconds((prev) => prev + 1)
        }, 1000)

        return () => {
            window.clearInterval(timer)
        }
    }, [loading])

    useEffect(() => {
        if (!loading) return
        if (streamPreview.hasStructuredContent) {
            setThinkingCollapsed(true)
        }
    }, [loading, streamPreview.hasStructuredContent])

    return (
        <div className={embedded ? 'h-full' : 'fixed inset-0 z-50 bg-black/25'}>
            <div className={embedded ? 'h-full bg-white' : 'absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl'}>
                <div className="flex h-full flex-col">
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                        <div>
                            <h4 className="text-sm font-semibold text-gray-800">AI 简历评估</h4>
                            <p className="mt-0.5 text-xs text-gray-500">{modeLabel ?? '已连接 AI 模型'}</p>
                            {hasVersionInfo && (
                                <p className={`mt-1 text-xs ${isLatest ? 'text-green-600' : 'text-amber-600'}`}>
                                    {isLatest ? '版本：最新（与当前简历一致）' : '版本：已过期（简历已更新，建议重新评估）'}
                                    <span className="ml-1 text-gray-500">评估时间：{evaluatedAtText}</span>
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={onReevaluate}
                                disabled={loading}
                                className="rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90 disabled:opacity-60 disabled:cursor-wait"
                            >
                                {loading ? '评估中...' : '评估'}
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                            >
                                关闭
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto no-scrollbar p-4">
                        {loading && (
                            <div className="space-y-3">
                                <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                                    AI 正在分析整份简历，请稍候...（已耗时 {elapsedSeconds}s）
                                </div>

                                <div className="rounded-xl border border-blue-100 bg-white p-4">
                                    <div className="flex items-center justify-between">
                                        <h5 className="text-sm font-semibold text-gray-800">思考过程</h5>
                                        <button
                                            type="button"
                                            onClick={() => setThinkingCollapsed((prev) => !prev)}
                                            className="text-xs text-gray-500 hover:text-gray-700"
                                        >
                                            {thinkingCollapsed ? '展开' : '折叠'}
                                        </button>
                                    </div>
                                    {!thinkingCollapsed && (
                                        <ul className="mt-2 space-y-1 text-xs leading-5 text-gray-500">
                                            {thinkingNotes.map((note, index) => (
                                                <li key={`${index}-${note}`} className="break-words">{note}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                <div className="rounded-xl border border-blue-100 bg-white p-4">
                                    <h5 className="text-sm font-semibold text-gray-800">评估内容</h5>

                                    <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                                        <p className="text-xs text-gray-500">综合评分</p>
                                        <div className="mt-1 flex items-end gap-2">
                                            <span className={`text-2xl font-bold ${levelColorClass(streamPreview.overallScore ?? 0)}`}>
                                                {streamPreview.overallScore ?? '--'}
                                            </span>
                                            <span className="pb-0.5 text-xs text-gray-600">/ 100</span>
                                            <span className="rounded bg-white px-2 py-0.5 text-xs text-gray-700 border border-gray-200">
                                                {streamPreview.level ?? '--'}
                                            </span>
                                        </div>
                                        {streamPreview.summary && (
                                            <p className="mt-2 break-words text-xs leading-5 text-gray-600">{streamPreview.summary}</p>
                                        )}
                                    </div>

                                    <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                                        <p className="text-xs font-medium text-gray-700">维度评分</p>
                                        {streamPreview.dimensions.length === 0 ? (
                                            <p className="mt-2 text-xs text-gray-500">正在提取维度评分...</p>
                                        ) : (
                                            <div className="mt-2">
                                                <HexDimensionChart items={streamDimensionItems} />
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                                        <p className="text-xs font-medium text-gray-700">重点问题</p>
                                        {streamPreview.issues.length === 0 ? (
                                            <p className="mt-2 text-xs text-gray-500">正在提取问题列表...</p>
                                        ) : (
                                            <div className="mt-2 space-y-2">
                                                {streamPreview.issues.map((issue, index) => (
                                                    <div key={`${issue.id}-${index}`} className="rounded border border-gray-200 bg-white p-2">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <p className="text-xs font-medium text-gray-700 break-words">{issue.title ?? '问题识别中...'}</p>
                                                            {issue.severity && (
                                                                <span className={`rounded border px-1.5 py-0.5 text-[10px] ${severityClassMap[issue.severity]}`}>
                                                                    {severityTextMap[issue.severity]}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {issue.description && (
                                                            <p className="mt-1 break-words text-[11px] text-gray-500">{issue.description}</p>
                                                        )}
                                                        {issue.suggestion && (
                                                            <p className="mt-1 break-words text-[11px] text-gray-600">建议：{issue.suggestion}</p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                                        <p className="text-xs font-medium text-gray-700">下一步优化动作</p>
                                        {streamPreview.actionItems.length === 0 ? (
                                            <p className="mt-2 text-xs text-gray-500">正在提取优化动作...</p>
                                        ) : (
                                            <div className="mt-2 space-y-2">
                                                {streamPreview.actionItems.map((item, index) => (
                                                    <div key={`${index}-${item}`} className="rounded border border-gray-200 bg-white p-2">
                                                        <p className="text-xs font-medium text-gray-700">优化动作 {index + 1}</p>
                                                        <p className="mt-1 break-words text-[11px] text-gray-600">{item}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {!loading && error && (
                            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-3">
                                <p className="text-sm text-red-700">{error}</p>
                                <button
                                    type="button"
                                    onClick={onRetry}
                                    className="mt-2 rounded-md bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-500"
                                >
                                    重试
                                </button>
                            </div>
                        )}

                        {!loading && !result && (
                            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                                暂无评估结果，请点击“开始评估”。
                            </div>
                        )}

                        {!loading && result && (
                            <div className="space-y-4">
                                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                    <p className="text-xs text-gray-500">综合评分</p>
                                    <div className="mt-1 flex items-end gap-2">
                                        <span className={`text-3xl font-bold ${levelColorClass(result.overallScore)}`}>
                                            {result.overallScore}
                                        </span>
                                        <span className="pb-1 text-sm text-gray-600">/ 100</span>
                                        <span className="rounded bg-white px-2 py-0.5 text-xs text-gray-700 border border-gray-200">
                                            {result.level}
                                        </span>
                                    </div>
                                    <p className="mt-2 break-words text-sm leading-6 text-gray-700">{result.summary}</p>
                                </div>

                                <div className="rounded-xl border border-gray-200 bg-white p-4">
                                    <h5 className="text-sm font-semibold text-gray-800">维度评分</h5>
                                    <div className="mt-3">
                                        <HexDimensionChart items={resultDimensionItems} />
                                    </div>
                                </div>

                                <div className="rounded-xl border border-gray-200 bg-white p-4">
                                    <h5 className="text-sm font-semibold text-gray-800">重点问题</h5>
                                    <div className="mt-3 space-y-2">
                                        {result.issues.length === 0 && (
                                            <p className="text-xs text-gray-500">未发现明显问题。</p>
                                        )}
                                        {result.issues.map((issue, index) => (
                                            <div key={`${issue.id}-${index}`} className="rounded-lg border border-gray-200 p-3">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-800">{issue.title}</p>
                                                        <p className="mt-1 break-words text-xs text-gray-500">{issue.description}</p>
                                                    </div>
                                                    <span className={`rounded border px-2 py-0.5 text-[11px] ${severityClassMap[issue.severity]}`}>
                                                        {severityTextMap[issue.severity]}
                                                    </span>
                                                </div>
                                                <p className="mt-2 rounded bg-gray-50 px-2 py-1 text-xs text-gray-700 break-words">建议：{issue.suggestion}</p>
                                                {issue.moduleType && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onJumpToModule(issue.moduleType as ModuleType)}
                                                        className="mt-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-primary hover:bg-primary/10"
                                                    >
                                                        跳转到对应模块
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-gray-200 bg-white p-4">
                                    <h5 className="text-sm font-semibold text-gray-800">下一步优化动作</h5>
                                    {resultActionItems.length === 0 ? (
                                        <p className="mt-2 text-sm text-gray-500">暂无优化动作建议。</p>
                                    ) : (
                                        <div className="mt-3 space-y-2">
                                            {resultActionItems.map((item, index) => (
                                                <div key={`${index}-${item}`} className="rounded-lg border border-gray-200 p-3">
                                                    <p className="text-sm font-medium text-gray-800">优化动作 {index + 1}</p>
                                                    <p className="mt-1 break-words text-xs text-gray-500">{item}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ResumeScoreDrawer
