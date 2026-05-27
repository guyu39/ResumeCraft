import React, { useState } from 'react'
import type { JDMatchResponse } from '@/api/ai'
import type { Resume } from '@/types/resume'

interface JDMatchPanelProps {
    resume: Resume
    loading: boolean
    error: string | null
    result: JDMatchResponse | null
    restoredResult: JDMatchResponse | null
    modelName: string | null
    lastMatchedAt: number | null
    onRunMatch: (form: { jdText: string; targetTitle?: string; companyName?: string }) => void
    onReset: () => void
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
    loading,
    error,
    result,
    restoredResult,
    modelName,
    lastMatchedAt,
    onRunMatch,
    onReset,
}) => {
    const displayResult = restoredResult ?? result
    const [jdText, setJdText] = useState('')
    const [targetTitle, setTargetTitle] = useState('')
    const [companyName, setCompanyName] = useState('')

    const canSubmit = jdText.trim().length > 0 && jdText.length <= 20000 && !loading

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
                        {displayResult && (
                            <button
                                type="button"
                                onClick={onReset}
                                className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50"
                            >
                                清空
                            </button>
                        )}
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
                        <button
                            type="button"
                            disabled={!canSubmit}
                            onClick={() => onRunMatch({ jdText, targetTitle, companyName })}
                            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {loading ? '分析中...' : '开始匹配分析'}
                        </button>
                    </div>
                </div>

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
