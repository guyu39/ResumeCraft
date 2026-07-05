import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Building2, Loader2, Search } from 'lucide-react'
import { aiApi, applicationsApi } from '@/api'
import type { ConversationItem, JDMatchResponse, JDScoreResponse } from '@/api/ai'
import type { Resume } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import { toast } from '@/components/common/Toast'
import { scoreClass, severityTextMap, severityClassMap } from './shared'
import InlineError from '@/components/common/InlineError'

interface JDMatchPanelProps {
    resume: Resume    /** 父组件已预取的对话历史列表（消除"查看历史"网络延迟） */
    preloadedHistory?: ConversationItem[]
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

const JDMatchPanel: React.FC<JDMatchPanelProps> = ({
    resume,
    preloadedHistory,
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

    // 投递查询回显
    const [appSearchOpen, setAppSearchOpen] = useState(false)
    const [appSearchKeyword, setAppSearchKeyword] = useState('')
    const [appSearchResults, setAppSearchResults] = useState<Array<{ id: string; companyName: string; targetTitle: string }>>([])
    const [appSearchLoading, setAppSearchLoading] = useState(false)
    const appSearchRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!appSearchOpen) return
        const handler = (e: MouseEvent) => {
            if (appSearchRef.current && !appSearchRef.current.contains(e.target as Node)) setAppSearchOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [appSearchOpen])

    const handleSearchApps = useCallback(async (keyword?: string) => {
        setAppSearchLoading(true)
        try {
            const res = await applicationsApi.list({ keyword, pageSize: 20 })
            setAppSearchResults(res.items.filter((i) => i.companyName || i.targetTitle).map((i) => ({
                id: i.id, companyName: i.companyName, targetTitle: i.targetTitle,
            })))
        } catch { setAppSearchResults([]) } finally { setAppSearchLoading(false) }
    }, [])

    const handleSelectApp = useCallback(async (appId: string) => {
        setAppSearchOpen(false)
        try {
            const app = await applicationsApi.get(appId)
            if (app.companyName) setCompanyName(app.companyName)
            if (app.targetTitle) setTargetTitle(app.targetTitle)
            if (app.jdText) setJdText(app.jdText)
        } catch { /* ignore */ }
    }, [])

    // 从 store 获取快照列表，用于在对话历史中显示快照标签
    const snapshots = useResumeStore((s) => s.snapshots)
    const triggerSnapshotRefresh = useResumeStore((s) => s.triggerSnapshotRefresh)
    const getSnapshotLabel = (snapshotVersionId?: string | null): string | null => {
        if (!snapshotVersionId) return null
        const snap = snapshots.find((s) => s.id === snapshotVersionId)
        if (!snap || snap.snapshotType !== 'manual') return null
        return snap.label || `v${snap.id.slice(0, 4)}`
    }

    // JD 定向优化：生成优化快照
    const [optimizing, setOptimizing] = useState(false)
    const [optimizeResult, setOptimizeResult] = useState<{ label: string; changedCount: number; notes: string[] } | null>(null)

    const handleOptimize = async () => {
        if (!jdText.trim() || optimizing) return
        setOptimizing(true)
        setOptimizeResult(null)
        try {
            const res = await aiApi.optimizeForJD({
                resumeId: resume.id,
                content: resume as unknown as Record<string, unknown>,
                jdText: jdText.trim(),
                targetTitle: targetTitle.trim() || undefined,
                companyName: companyName.trim() || undefined,
            })
            setOptimizeResult({ label: res.label, changedCount: res.changedCount, notes: res.notes })
            // 新快照已落库，刷新时间轴让用户能在「版本」里看到并切换/对比
            triggerSnapshotRefresh()
            toast(`已生成优化版「${res.label}」`, 'success')
        } catch (err) {
            toast(err instanceof Error ? err.message : 'JD 优化失败')
        } finally {
            setOptimizing(false)
        }
    }

    const canSubmit = jdText.trim().length > 0 && jdText.length <= 20000 && !loading && !scoreLoading
    const loadHistory = async () => {
        // 优先使用父组件预取的数据
        if (preloadedHistory && preloadedHistory.length > 0) {
            setHistoryItems(preloadedHistory)
            setHistoryLoading(false)
            return
        }
        setHistoryLoading(true)
        try {
            const res = await aiApi.getConversations({ type: 'jd_match', resumeId: resume.id, pageSize: 20 })
            const items = res.items || []
            setHistoryItems(items.slice(0, 5))
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
                        {/* 查询投递一键回显 */}
                        <div ref={appSearchRef} className="relative">
                            <button
                                type="button"
                                onClick={() => { setAppSearchOpen(!appSearchOpen); if (!appSearchOpen) handleSearchApps() }}
                                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-3 py-2 text-xs font-medium text-slate-500 transition hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-600"
                            >
                                <Search className="h-3.5 w-3.5" />
                                查询投递
                            </button>
                            {appSearchOpen && (
                                <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-slate-200 bg-white shadow-xl">
                                    <div className="p-2">
                                        <input
                                            value={appSearchKeyword}
                                            onChange={(e) => { setAppSearchKeyword(e.target.value); handleSearchApps(e.target.value) }}
                                            placeholder="搜索公司或岗位..."
                                            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-blue-400"
                                            autoFocus
                                        />
                                    </div>
                                    <div className="max-h-48 overflow-y-auto no-scrollbar border-t border-slate-100">
                                        {appSearchLoading ? (
                                            <div className="flex items-center justify-center py-6">
                                                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                                            </div>
                                        ) : appSearchResults.length === 0 ? (
                                            <p className="px-3 py-4 text-center text-xs text-slate-400">暂无投递记录</p>
                                        ) : (
                                            appSearchResults.map((item) => (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    onClick={() => handleSelectApp(item.id)}
                                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-blue-50"
                                                >
                                                    <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate font-medium text-slate-700">{item.companyName || '未填公司'}</p>
                                                        <p className="truncate text-slate-400">{item.targetTitle || '未填岗位'}</p>
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
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
                        {error && <InlineError message={error} className="mt-1" />}
                        {scoreError && <InlineError message={scoreError} className="mt-1" />}
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
                        {/* JD 定向优化：基于 JD 生成优化版简历快照 */}
                        <button
                            type="button"
                            disabled={!jdText.trim() || jdText.length > 20000 || optimizing}
                            onClick={handleOptimize}
                            className="w-full rounded-xl bg-gradient-to-r from-primary to-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {optimizing ? '生成优化版中...' : '✨ 生成优化版简历'}
                        </button>
                        {optimizeResult && (
                            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                                <p className="text-xs font-medium text-gray-800">
                                    已生成「{optimizeResult.label}」，优化 {optimizeResult.changedCount} 处
                                </p>
                                <p className="mt-0.5 text-[11px] text-gray-500">在左侧「版本」时间轴可切换查看 / 对比 / 采纳</p>
                                {optimizeResult.notes?.length > 0 && (
                                    <ul className="mt-1.5 space-y-1">
                                        {optimizeResult.notes.map((n, i) => (
                                            <li key={i} className="text-[11px] leading-relaxed text-gray-600">· {n}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
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
                                            <div className="flex items-center gap-2 mt-1">
                                                <p className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleString()}</p>
                                                {getSnapshotLabel(item.snapshotVersionId) && (
                                                    <span className="text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
                                                        {getSnapshotLabel(item.snapshotVersionId)}
                                                    </span>
                                                )}
                                            </div>
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
