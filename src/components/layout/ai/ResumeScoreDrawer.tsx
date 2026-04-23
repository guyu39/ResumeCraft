import React, { useEffect, useMemo, useState } from 'react'
import type { ModuleType } from '@/types/resume'
import type { ResumeEvaluateOutput } from '@/ai'
import { aiApi, type ConversationItem } from '@/api/ai'

interface ResumeScoreDrawerProps {
    open: boolean
    embedded?: boolean
    result: ResumeEvaluateOutput | null
    restoredResult?: ResumeEvaluateOutput | null
    loading: boolean
    streamDone: boolean
    error: string | null
    streamText: string
    modelName: string | null
    currentResumeUpdatedAt: number
    evaluatedResumeUpdatedAt: number | null
    lastEvaluatedAt: number | null
    modeLabel?: string
    isAuthenticated?: boolean
    resumeId?: string
    // onClose: () => void
    onNewEvaluation?: (conversationId: string) => void
    onReevaluate: () => void
    onRetry: () => void
    onJumpToModule: (moduleType: ModuleType) => void
    onConversationSelect?: (conversationId: string) => void
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
    const lines = text.split('\n').filter(l => l.trim())

    let overallScore: number | null = null
    let level: string | null = null
    let summary: string | null = null
    const dimensions: StreamDimensionPreview[] = []
    const issues: StreamIssuePreview[] = []
    const actionItems: string[] = []

    for (const line of lines) {
        let obj: Record<string, unknown>
        try {
            obj = JSON.parse(line)
        } catch {
            continue
        }

        switch (obj.type) {
            case 'overall_score':
                if (typeof obj.score === 'number') overallScore = obj.score
                if (typeof obj.level === 'string') level = obj.level
                break
            case 'summary':
                if (typeof obj.content === 'string') summary = obj.content
                break
            case 'dimension_score':
                if (obj.key && obj.label) {
                    dimensions.push({
                        key: String(obj.key),
                        label: String(obj.label),
                        score: typeof obj.score === 'number' ? Math.round(obj.score) : undefined,
                        comment: typeof obj.comment === 'string' ? obj.comment : undefined,
                    })
                }
                break
            case 'issue_item':
                issues.push({
                    id: typeof obj.id === 'string' ? obj.id : '',
                    severity: (['high', 'medium', 'low'].includes(obj.severity as string) ? obj.severity : undefined) as 'high' | 'medium' | 'low' | undefined,
                    title: typeof obj.title === 'string' ? obj.title : undefined,
                    description: typeof obj.description === 'string' ? obj.description : undefined,
                    suggestion: typeof obj.suggestion === 'string' ? obj.suggestion : undefined,
                })
                break
            case 'action_item':
                if (typeof obj.content === 'string') actionItems.push(obj.content)
                break
        }
    }

    const hasStructuredContent = overallScore !== null
        || level !== null
        || Boolean(summary)
        || dimensions.length > 0
        || issues.length > 0
        || actionItems.length > 0
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
    streamDone,
    error,
    streamText,
    modelName,
    currentResumeUpdatedAt,
    evaluatedResumeUpdatedAt,
    lastEvaluatedAt,
    modeLabel,
    isAuthenticated,
    resumeId,
    // onClose,
    onReevaluate,
    onRetry,
    onJumpToModule,
    onConversationSelect,
    restoredResult,
    onNewEvaluation,
}) => {
    if (!open) return null

    // Use restored result for display when available
    const displayResult = restoredResult ?? result

    // Reset history state when drawer closes
    useEffect(() => {
        if (!open) {
            setShowHistory(false)
            setSelectedHistoryId(null)
            return
        }
        // 打开时：自动加载评估历史
        setHistoryLoading(true)
        // 用 authAtOpen 捕获此刻的登录状态，避免 Promise 异步回调中 state 已变化
        const authAtOpen = isAuthenticated
        aiApi.getConversations({ type: 'evaluate', resumeId, pageSize: 5 }).then((res) => {
            const items = res.items || []
            setConversationHistory(items)
            // 有历史记录：自动选中最新一条并渲染
            if (items.length > 0) {
                const latestId = items[0].id
                setSelectedHistoryId(latestId)
                setShowHistory(false)
                onConversationSelect?.(latestId)
            } else if (authAtOpen) {
                // 打开时无历史记录且已登录：自动触发评估
                onReevaluate()
            }
        }).catch(() => {
            setConversationHistory([])
        }).finally(() => {
            setHistoryLoading(false)
        })
    }, [open])

    // 新评估完成时：将新会话 ID 通知父组件（用于云端同步），并拼接到本地历史列表
    useEffect(() => {
        if (!result?.conversationId || !resumeId) return
        const newConv: ConversationItem = {
            id: result.conversationId,
            resumeId,
            type: 'evaluate',
            title: '简历评估',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            context: {
                overallScore: result.overallScore,
                level: result.level,
            },
        }
        setConversationHistory((prev) => [newConv, ...prev.filter((c) => c.id !== newConv.id)])
        onNewEvaluation?.(result.conversationId)
    }, [result?.conversationId])

    const [elapsedSeconds, setElapsedSeconds] = useState(0)
    const [conversationHistory, setConversationHistory] = useState<ConversationItem[]>([])
    const [historyLoading, setHistoryLoading] = useState(false)
    const [showHistory, setShowHistory] = useState(false)
    const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)

    const isLatest = evaluatedResumeUpdatedAt !== null && evaluatedResumeUpdatedAt === currentResumeUpdatedAt
    const hasVersionInfo = evaluatedResumeUpdatedAt !== null
    const evaluatedAtText = lastEvaluatedAt ? new Date(lastEvaluatedAt).toLocaleString() : '未知'

    const streamPreview = useMemo(() => parseStreamPreview(streamText), [streamText])
    const streamDimensionItems = useMemo(
        () => normalizeDimensionItems(streamPreview.dimensions),
        [streamPreview.dimensions],
    )
    const resultDimensionItems = useMemo(
        () => normalizeDimensionItems(displayResult?.dimensions ?? []),
        [displayResult?.dimensions],
    )
    const resultActionItems = useMemo(
        () => (displayResult?.actionItems ?? [])
            .map((item) => item.trim())
            .filter((item) => item.length >= 6)
            .slice(0, 3),
        [displayResult?.actionItems],
    )

    useEffect(() => {
        if (!loading) {
            setElapsedSeconds(0)
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

    return (
        <div className={embedded ? 'h-full' : 'fixed inset-0 z-50 bg-black/25'}>
            <div className={embedded ? 'h-full bg-white' : 'absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl'}>
                <div className="flex h-full flex-col">
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                        <div>
                            <h4 className="text-sm font-semibold text-gray-800">AI 简历评估</h4>
                            <p className="mt-0.5 text-xs text-gray-500">
                                {isAuthenticated ? ((displayResult?.model ?? modelName) ?? modeLabel ?? '已连接 AI 模型') : '请先登录'}
                            </p>
                            {hasVersionInfo && (
                                <p className={`mt-1 text-xs ${isLatest ? 'text-green-600' : 'text-amber-600'}`}>
                                    {isLatest ? '版本：最新（与当前简历一致）' : '版本：已过期（简历已更新，建议重新评估）'}
                                    <span className="ml-1 text-gray-500">评估时间：{evaluatedAtText}</span>
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {!isAuthenticated ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const currentPath = window.location.pathname
                                        window.history.pushState({}, '', `/?login=1&return=${encodeURIComponent(currentPath)}`)
                                        window.location.reload()
                                    }}
                                    className="rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90"
                                >
                                    登录
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={onReevaluate}
                                    disabled={loading}
                                    className="rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90 disabled:opacity-60 disabled:cursor-wait"
                                >
                                    {loading ? '评估中...' : '评估'}
                                </button>
                            )}
                            {isAuthenticated && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowHistory((prev) => !prev)
                                        if (!showHistory && conversationHistory.length === 0) {
                                            setHistoryLoading(true)
                                            aiApi.getConversations({ type: 'evaluate', resumeId }).then((res) => {
                                                setConversationHistory(res.items)
                                                // Auto-select first (latest) item and load its detail
                                                if (res.items.length > 0) {
                                                    const latestId = res.items[0].id
                                                    setSelectedHistoryId(latestId)
                                                    onConversationSelect?.(latestId)
                                                }
                                            }).catch(() => {
                                                setConversationHistory([])
                                            }).finally(() => {
                                                setHistoryLoading(false)
                                            })
                                        }
                                    }}
                                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                                >
                                    {showHistory ? '收起历史' : '查看历史'}
                                </button>
                            )}
                            {/* <button
                                type="button"
                                onClick={onClose}
                                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                            >
                                关闭
                            </button> */}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto no-scrollbar p-4">
                        {showHistory && (
                            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                                <h5 className="mb-2 text-sm font-semibold text-gray-700">评估历史<span className="text-xs text-gray-500">（仅显示5条评估记录）</span></h5>

                                {historyLoading ? (
                                    <p className="text-xs text-gray-500">加载中...</p>
                                ) : conversationHistory.length === 0 ? (
                                    <p className="text-xs text-gray-500">暂无评估记录</p>
                                ) : (
                                    <ul className="space-y-2">
                                        {conversationHistory.map((item) => (
                                            <li key={item.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedHistoryId(item.id)
                                                        setShowHistory(false)
                                                        onConversationSelect?.(item.id)
                                                    }}
                                                    className={`w-full text-left rounded-md border px-3 py-2 ${selectedHistoryId === item.id
                                                        ? 'border-blue-400 bg-blue-50'
                                                        : 'border-gray-100 bg-white hover:bg-gray-100'
                                                        }`}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-medium text-gray-700">{item.title}</span>
                                                        <span className="text-xs text-gray-400">
                                                            {item.context && typeof item.context === 'object' && 'overallScore' in item.context
                                                                ? `${(item.context as { overallScore: number }).overallScore}分`
                                                                : ''}
                                                        </span>
                                                    </div>
                                                    <p className="mt-0.5 text-xs text-gray-400">
                                                        {new Date(item.createdAt).toLocaleString()}
                                                    </p>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                        {loading && !displayResult && (
                            <div className="space-y-3">
                                <div className={`rounded-lg border px-3 py-2 text-sm ${streamDone ? 'border-green-100 bg-green-50 text-green-700' : 'border-blue-100 bg-blue-50 text-blue-700'}`}>
                                    {streamDone ? '评估完成，正在生成最终报告...' : `AI 正在分析整份简历，请稍候...（已耗时 ${elapsedSeconds}s）`}
                                </div>

                                {streamPreview.hasStructuredContent && (
                                    <div className="rounded-xl border border-blue-100 bg-white p-4 space-y-4">
                                        {streamPreview.overallScore !== null && (
                                            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                                <p className="text-xs text-gray-500">综合评分</p>
                                                <div className="mt-1 flex items-end gap-2">
                                                    <span className={`text-2xl font-bold ${levelColorClass(streamPreview.overallScore)}`}>
                                                        {streamPreview.overallScore}
                                                    </span>
                                                    <span className="pb-0.5 text-xs text-gray-600">/ 100</span>
                                                    <span className="rounded bg-white px-2 py-0.5 text-xs text-gray-700 border border-gray-200">
                                                        {streamPreview.level ?? '--'}
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        {streamPreview.summary && (
                                            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                                <p className="text-xs text-gray-500">摘要</p>
                                                <p className="mt-1 break-words text-xs leading-5 text-gray-600">{streamPreview.summary}</p>
                                            </div>
                                        )}

                                        {streamPreview.dimensions.length > 0 && (
                                            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                                <p className="text-xs font-medium text-gray-700">维度评分</p>
                                                <div className="mt-2">
                                                    <HexDimensionChart items={streamDimensionItems} />
                                                </div>
                                            </div>
                                        )}

                                        {streamPreview.issues.length > 0 && (
                                            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                                <p className="text-xs font-medium text-gray-700">重点问题</p>
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
                                            </div>
                                        )}

                                        {streamPreview.actionItems.length > 0 && (
                                            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                                <p className="text-xs font-medium text-gray-700">下一步优化动作</p>
                                                <div className="mt-2 space-y-2">
                                                    {streamPreview.actionItems.map((item, index) => (
                                                        <div key={`${index}-${item}`} className="rounded border border-gray-200 bg-white p-2">
                                                            <p className="text-xs font-medium text-gray-700">优化动作 {index + 1}</p>
                                                            <p className="mt-1 break-words text-[11px] text-gray-600">{item}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {!loading && error && error !== '请登录使用' && (
                            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-3">
                                <p className="text-sm text-red-700">{error}</p>
                                {!isAuthenticated ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const currentPath = window.location.pathname
                                            window.history.pushState({}, '', `/?login=1&return=${encodeURIComponent(currentPath)}`)
                                            window.location.reload()
                                        }}
                                        className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90"
                                    >
                                        登录
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={onRetry}
                                        className="mt-2 rounded-md bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-500"
                                    >
                                        重试
                                    </button>
                                )}
                            </div>
                        )}

                        {!loading && !displayResult && !streamPreview.hasStructuredContent && (
                            <div />
                        )}

                        {!loading && displayResult && (
                            <div className="space-y-4">
                                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                    <p className="text-xs text-gray-500">综合评分</p>
                                    <div className="mt-1 flex items-end gap-2">
                                        <span className={`text-3xl font-bold ${levelColorClass(displayResult.overallScore)}`}>
                                            {displayResult.overallScore}
                                        </span>
                                        <span className="pb-1 text-sm text-gray-600">/ 100</span>
                                        <span className="rounded bg-white px-2 py-0.5 text-xs text-gray-700 border border-gray-200">
                                            {displayResult.level}
                                        </span>
                                    </div>
                                    <p className="mt-2 break-words text-sm leading-6 text-gray-700">{displayResult.summary}</p>
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
                                        {displayResult.issues.length === 0 && (
                                            <p className="text-xs text-gray-500">未发现明显问题。</p>
                                        )}
                                        {displayResult.issues.map((issue, index) => (
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
