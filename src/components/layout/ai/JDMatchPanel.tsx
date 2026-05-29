import React, { useState } from 'react'
import { aiApi } from '@/api'
import type { ConversationItem, JDMatchResponse, JDScoreResponse } from '@/api/ai'
import type { Resume } from '@/types/resume'

interface JDMatchPanelProps {
    resume: Resume
    loading: boolean
    scoreLoading: boolean
    error: string | null
    scoreError: string | null
    result: JDMatchResponse | null
    scoreResult: JDScoreResponse | null
    restoredResult: JDMatchResponse | null
    restoredScoreResult: JDScoreResponse | null
    modelName: string | null
    lastMatchedAt: number | null
    lastScoredAt: number | null
    onRunMatch: (form: { jdText: string; targetTitle?: string; companyName?: string }) => void
    onRunScore: (form: { jdText: string; targetTitle?: string; companyName?: string }) => void
    onReset: () => void
    onResetScore: () => void
    onRestoreHistory: (result: JDMatchResponse) => void
    onRestoreScoreHistory: (result: JDScoreResponse) => void
}

const severityTextMap: Record<string, string> = {
    high: '高',
    medium: '中',
    low: '低',
}

const severityClassMap: Record<string, string> = {
    high: 'border-red-100 bg-red-50 text-red-700',
    medium: 'border-amber-100 bg-amber-50 text-amber-700',
    low: 'border-blue-100 bg-blue-50 text-blue-700',
}

const scoreClass = (score: number) => {
    if (score >= 85) return 'text-green-600'
    if (score >= 70) return 'text-amber-600'
    return 'text-red-600'
}

const JDMatchPanel: React.FC<JDMatchPanelProps> = ({
    resume,
    loading,
    scoreLoading,
    error,
    scoreError,
    result,
    scoreResult,
    restoredResult,
    restoredScoreResult,
    modelName,
    lastMatchedAt,
    lastScoredAt,
    onRunMatch,
    onRunScore,
    onReset,
    onResetScore,
    onRestoreHistory,
    onRestoreScoreHistory,
}) => {
    const displayResult = restoredResult ?? result
    const displayScoreResult = restoredScoreResult ?? scoreResult
    const [jdText, setJdText] = useState('')
    const [targetTitle, setTargetTitle] = useState('')
    const [companyName, setCompanyName] = useState('')
    const [showHistory, setShowHistory] = useState(false)
    const [historyLoading, setHistoryLoading] = useState(false)
    const [historyItems, setHistoryItems] = useState<ConversationItem[]>([])
    const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)

    const canSubmit = jdText.trim().length > 0 && jdText.length <= 20000 && !loading && !scoreLoading

    const loadHistory = async () => {
        setHistoryLoading(true)
        try {
            const res = await aiApi.getConversations({ type: 'jd_match', resumeId: resume.id, pageSize: 5 })
            setHistoryItems(res.items || [])
        } catch {
            setHistoryItems([])
        } finally {
            setHistoryLoading(false)
        }
    }

    const toggleHistory = async () => {
        const next = !showHistory
        setShowHistory(next)
        if (next && historyItems.length === 0) {
            await loadHistory()
        }
    }

    const restoreHistory = async (conversationId: string) => {
        setSelectedHistoryId(conversationId)
        const detail = await aiApi.getConversation(conversationId)
        const ctx = detail.context as Record<string, unknown> | undefined
        if (ctx?.matchScore !== undefined) {
            onRestoreHistory(ctx as unknown as JDMatchResponse)
            setShowHistory(false)
            return
        }
        if (ctx?.overallScore !== undefined && ctx?.breakdown !== undefined) {
            onRestoreScoreHistory(ctx as unknown as JDScoreResponse)
            setShowHistory(false)
        }
    }

    return (
        <div className="h-full overflow-y-auto bg-gray-50/80 px-4 py-4 no-scrollbar">
            <div className="space-y-4">
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900">JD 匹配度分析</h3>
                            <p className="mt-1 text-xs leading-relaxed text-gray-500">
                                粘贴目标岗位 JD，AI 会对比当前简历并输出匹配分、关键词、缺口和修改建议。
                            </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <button
                                type="button"
                                onClick={toggleHistory}
                                className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50"
                            >
                                {showHistory ? '收起历史' : '查看历史'}
                            </button>
                            {displayResult && (
                                <button
                                    type="button"
                                    onClick={onReset}
                                    className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50"
                                >
                                    清空
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="mt-4 space-y-3">
                        <input
                            value={targetTitle}
                            onChange={(event) => setTargetTitle(event.target.value)}
                            placeholder="目标岗位，例如：前端工程师"
                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                        <input
                            value={companyName}
                            onChange={(event) => setCompanyName(event.target.value)}
                            placeholder="公司名称，可选"
                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                        <textarea
                            value={jdText}
                            onChange={(event) => setJdText(event.target.value)}
                            placeholder="粘贴岗位 JD，建议包含岗位职责、任职要求、技术栈和加分项"
                            className="min-h-40 w-full resize-none no-scrollbar rounded-xl border border-gray-200 px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary"
                        />
                        <div className="flex items-center justify-between text-xs text-gray-400">
                            <span>{jdText.length}/20000</span>
                            {modelName && <span>模型：{modelName}</span>}
                        </div>
                        {error && <p className="text-xs text-red-600">{error}</p>}
                        {scoreError && <p className="text-xs text-red-600">{scoreError}</p>}
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                disabled={!canSubmit}
                                onClick={() => onRunMatch({ jdText, targetTitle, companyName })}
                                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {loading ? '匹配中...' : '快速匹配'}
                            </button>
                            <button
                                type="button"
                                disabled={!canSubmit}
                                onClick={() => onRunScore({ jdText, targetTitle, companyName })}
                                className="rounded-xl border border-primary px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {scoreLoading ? '评分中...' : '深度评分'}
                            </button>
                        </div>
                    </div>
                </div>

                {showHistory && (
                    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                        <h4 className="text-sm font-semibold text-gray-900">匹配历史<span className="text-xs font-normal text-gray-500">（仅显示5条匹配记录）</span></h4>
                        {historyLoading ? (
                            <p className="mt-3 text-xs text-gray-500">加载中...</p>
                        ) : historyItems.length === 0 ? (
                            <p className="mt-3 text-xs text-gray-500">暂无匹配记录</p>
                        ) : (
                            <div className="mt-3 space-y-2">
                                {historyItems.map((item) => {
                                    const ctx = (item.context ?? {}) as Record<string, unknown>
                                    const matchScore = typeof ctx.matchScore === 'number' ? ctx.matchScore : undefined
                                    const overallScore = typeof ctx.overallScore === 'number' ? ctx.overallScore : undefined
                                    const score = matchScore ?? overallScore
                                    const recordType = matchScore !== undefined ? '快速匹配' : overallScore !== undefined ? '深度评分' : 'JD 记录'
                                    const target = typeof ctx.targetTitle === 'string' && ctx.targetTitle ? ctx.targetTitle : '未填写岗位'
                                    const company = typeof ctx.companyName === 'string' && ctx.companyName ? ` · ${ctx.companyName}` : ''
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => restoreHistory(item.id)}
                                            className={`w-full rounded-xl border px-3 py-2 text-left ${selectedHistoryId === item.id
                                                ? 'border-primary bg-primary/5'
                                                : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="truncate text-sm font-medium text-gray-800">{recordType} · {target}{company}</span>
                                                {score !== undefined && <span className={`text-sm font-semibold ${scoreClass(score)}`}>{score}</span>}
                                            </div>
                                            <p className="mt-1 text-xs text-gray-400">{new Date(item.createdAt).toLocaleString()}</p>
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}

                {displayScoreResult && (
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-xs text-gray-500">深度评分</p>
                                    <div className="mt-1 flex items-end gap-2">
                                        <span className={`text-4xl font-bold ${scoreClass(displayScoreResult.overallScore)}`}>
                                            {displayScoreResult.overallScore}
                                        </span>
                                        <span className="pb-1 text-sm font-medium text-gray-500">{displayScoreResult.level}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {lastScoredAt && <span className="text-xs text-gray-400">{new Date(lastScoredAt).toLocaleString()}</span>}
                                    <button
                                        type="button"
                                        onClick={onResetScore}
                                        className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50"
                                    >
                                        清空评分
                                    </button>
                                </div>
                            </div>
                            {(displayScoreResult.targetTitle || displayScoreResult.companyName) && (
                                <div className="group relative mt-2 inline-block">
                                    <p className="cursor-default text-xs text-gray-500">
                                        目标岗位：{displayScoreResult.targetTitle || '未填写'}{displayScoreResult.companyName ? ` · ${displayScoreResult.companyName}` : ''}
                                    </p>
                                    {displayScoreResult.jdText && (
                                        <div className="absolute bottom-full left-0 z-50 hidden pb-2 group-hover:block">
                                            <div className="w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
                                                <p className="text-xs font-medium text-gray-500">岗位 JD</p>
                                                <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-gray-600 no-scrollbar">
                                                    {displayScoreResult.jdText}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            {displayScoreResult.summary && <p className="mt-3 text-sm leading-relaxed text-gray-700">{displayScoreResult.summary}</p>}
                            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                                <div className="rounded-xl bg-gray-50 p-3">
                                    <p className="text-xs text-gray-500">ATS</p>
                                    <p className={`mt-1 text-lg font-semibold ${scoreClass(displayScoreResult.breakdown.ats.score)}`}>{displayScoreResult.breakdown.ats.score}</p>
                                </div>
                                <div className="rounded-xl bg-gray-50 p-3">
                                    <p className="text-xs text-gray-500">关键词</p>
                                    <p className={`mt-1 text-lg font-semibold ${scoreClass(displayScoreResult.breakdown.keywordMatch.score)}`}>{displayScoreResult.breakdown.keywordMatch.score}</p>
                                </div>
                                <div className="rounded-xl bg-gray-50 p-3">
                                    <p className="text-xs text-gray-500">资历</p>
                                    <p className={`mt-1 text-lg font-semibold ${scoreClass(displayScoreResult.breakdown.seniorityFit.score)}`}>{displayScoreResult.breakdown.seniorityFit.score}</p>
                                </div>
                            </div>
                            {displayScoreResult.breakdown.keywordMatch.missing.length > 0 && (
                                <div className="mt-4">
                                    <h4 className="text-sm font-semibold text-gray-900">缺失关键词</h4>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {displayScoreResult.breakdown.keywordMatch.missing.slice(0, 12).map((keyword) => (
                                            <span key={keyword} className="rounded-full bg-red-50 px-2 py-1 text-xs text-red-700">{keyword}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {displayScoreResult.improvements.length > 0 && (
                                <div className="mt-4">
                                    <h4 className="text-sm font-semibold text-gray-900">提分建议</h4>
                                    <div className="mt-2 space-y-2">
                                        {displayScoreResult.improvements.map((item, index) => (
                                            <div key={`${item.category}-${index}`} className="rounded-xl bg-gray-50 p-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-sm font-medium text-gray-800">{item.action}</p>
                                                    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">+{item.potentialGain}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {displayResult && (
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-xs text-gray-500">匹配度</p>
                                    <div className="mt-1 flex items-end gap-2">
                                        <span className={`text-4xl font-bold ${scoreClass(displayResult.matchScore)}`}>
                                            {displayResult.matchScore || '--'}
                                        </span>
                                        <span className="pb-1 text-sm font-medium text-gray-500">{displayResult.level}</span>
                                    </div>
                                </div>
                                {lastMatchedAt && (
                                    <span className="text-xs text-gray-400">
                                        {new Date(lastMatchedAt).toLocaleString()}
                                    </span>
                                )}
                            </div>
                            {(displayResult.targetTitle || displayResult.companyName) && (
                                <div className="group relative mt-2 inline-block">
                                    <p className="cursor-default text-xs text-gray-500">
                                        目标岗位：{displayResult.targetTitle || '未填写'}{displayResult.companyName ? ` · ${displayResult.companyName}` : ''}
                                    </p>
                                    {displayResult.jdText && (
                                        <div className="absolute bottom-full left-0 z-50 hidden pb-2 group-hover:block">
                                            <div className="w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
                                                <p className="text-xs font-medium text-gray-500">岗位 JD</p>
                                                <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-gray-600 no-scrollbar">
                                                    {displayResult.jdText}
                                            </p>
                                        </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            {displayResult.summary && <p className="mt-3 text-sm leading-relaxed text-gray-700">{displayResult.summary}</p>}
                        </div>

                        {displayResult.keywordMatches.length > 0 && (
                            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                                <h4 className="text-sm font-semibold text-gray-900">关键词匹配</h4>
                                <div className="mt-3 space-y-2">
                                    {displayResult.keywordMatches.map((item, index) => (
                                        <div key={`${item.keyword}-${index}`} className="rounded-xl border border-gray-100 p-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-medium text-gray-800">{item.keyword}</span>
                                                <span className={`rounded-full px-2 py-0.5 text-xs ${item.matched ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                                    {item.matched ? '已匹配' : '未体现'}
                                                </span>
                                            </div>
                                            {item.evidence && <p className="mt-1 text-xs leading-relaxed text-gray-500">{item.evidence}</p>}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {displayResult.strengths.length > 0 && (
                            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                                <h4 className="text-sm font-semibold text-gray-900">匹配优势</h4>
                                <ul className="mt-3 space-y-2 text-sm text-gray-700">
                                    {displayResult.strengths.map((item, index) => <li key={index}>• {item}</li>)}
                                </ul>
                            </section>
                        )}

                        {displayResult.gaps.length > 0 && (
                            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                                <h4 className="text-sm font-semibold text-gray-900">能力缺口</h4>
                                <div className="mt-3 space-y-3">
                                    {displayResult.gaps.map((gap, index) => (
                                        <div key={`${gap.requirement}-${index}`} className="rounded-xl border border-gray-100 p-3">
                                            <div className="flex items-center gap-2">
                                                <span className={`rounded-full border px-2 py-0.5 text-xs ${severityClassMap[gap.severity] ?? severityClassMap.medium}`}>
                                                    {severityTextMap[gap.severity] ?? '中'}优先级
                                                </span>
                                                <span className="text-sm font-medium text-gray-800">{gap.requirement}</span>
                                            </div>
                                            <p className="mt-2 text-xs leading-relaxed text-gray-500">当前：{gap.currentEvidence}</p>
                                            <p className="mt-1 text-xs leading-relaxed text-gray-700">建议：{gap.suggestion}</p>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {displayResult.resumeSuggestions.length > 0 && (
                            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                                <h4 className="text-sm font-semibold text-gray-900">简历修改建议</h4>
                                <div className="mt-3 space-y-3">
                                    {displayResult.resumeSuggestions.map((item, index) => (
                                        <div key={`${item.title}-${index}`} className="rounded-xl bg-gray-50 p-3">
                                            <p className="text-sm font-medium text-gray-800">{item.title}</p>
                                            <p className="mt-1 text-xs leading-relaxed text-gray-600">{item.suggestion}</p>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {displayResult.actionItems.length > 0 && (
                            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                                <h4 className="text-sm font-semibold text-gray-900">下一步行动</h4>
                                <ul className="mt-3 space-y-2 text-sm text-gray-700">
                                    {displayResult.actionItems.map((item, index) => <li key={index}>• {item}</li>)}
                                </ul>
                            </section>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

export default JDMatchPanel
