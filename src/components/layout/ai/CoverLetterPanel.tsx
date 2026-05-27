import React, { useState } from 'react'
import type { CoverLetterResponse } from '@/api/ai'

interface CoverLetterPanelProps {
    loading: boolean
    error: string | null
    result: CoverLetterResponse | null
    restoredResult: CoverLetterResponse | null
    lastGeneratedAt: number | null
    onGenerate: (form: { jdText?: string; jobTitle: string; companyName?: string; tone?: string; language?: string }) => void
    onReset: () => void
}

const CoverLetterPanel: React.FC<CoverLetterPanelProps> = ({
    loading,
    error,
    result,
    restoredResult,
    lastGeneratedAt,
    onGenerate,
    onReset,
}) => {
    const displayResult = restoredResult ?? result
    const [jobTitle, setJobTitle] = useState('')
    const [companyName, setCompanyName] = useState('')
    const [jdText, setJdText] = useState('')
    const [tone, setTone] = useState('professional')
    const [language, setLanguage] = useState('zh-CN')
    const [copied, setCopied] = useState(false)

    const canSubmit = jobTitle.trim().length > 0 && jdText.length <= 20000 && !loading

    const copyCoverLetter = async () => {
        if (!displayResult?.coverLetter) return
        await navigator.clipboard.writeText(displayResult.coverLetter)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
    }

    return (
        <div className="h-full overflow-y-auto bg-gray-50/80 px-4 py-4 no-scrollbar">
            <div className="space-y-4">
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900">求职信生成</h3>
                            <p className="mt-1 text-xs leading-relaxed text-gray-500">
                                输入岗位和公司信息，AI 会结合当前简历生成可复制的求职信或投递邮件正文。
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
                            value={jobTitle}
                            onChange={(event) => setJobTitle(event.target.value)}
                            placeholder="目标岗位，例如：前端工程师"
                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                        <input
                            value={companyName}
                            onChange={(event) => setCompanyName(event.target.value)}
                            placeholder="公司名称，可选"
                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <select
                                value={tone}
                                onChange={(event) => setTone(event.target.value)}
                                className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
                            >
                                <option value="professional">专业正式</option>
                                <option value="concise">简洁直接</option>
                                <option value="positive">积极热情</option>
                            </select>
                            <select
                                value={language}
                                onChange={(event) => setLanguage(event.target.value)}
                                className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
                            >
                                <option value="zh-CN">中文</option>
                                <option value="en-US">英文</option>
                            </select>
                        </div>
                        <textarea
                            value={jdText}
                            onChange={(event) => setJdText(event.target.value)}
                            placeholder="粘贴岗位 JD，可选但推荐"
                            className="min-h-32 w-full resize-none no-scrollbar rounded-xl border border-gray-200 px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary"
                        />
                        <div className="text-xs text-gray-400">{jdText.length}/20000</div>
                        {error && <p className="text-xs text-red-600">{error}</p>}
                        <button
                            type="button"
                            disabled={!canSubmit}
                            onClick={() => onGenerate({ jdText, jobTitle, companyName, tone, language })}
                            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {loading ? '生成中...' : displayResult ? '重新生成' : '生成求职信'}
                        </button>
                    </div>
                </div>

                {displayResult && (
                    <div className="space-y-4">
                        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-900">{displayResult.title || '求职信'}</h4>
                                    {lastGeneratedAt && (
                                        <p className="mt-1 text-xs text-gray-400">{new Date(lastGeneratedAt).toLocaleString()}</p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={copyCoverLetter}
                                    className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
                                >
                                    {copied ? '已复制' : '复制'}
                                </button>
                            </div>
                            <div className="mt-3 whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm leading-7 text-gray-700">
                                {displayResult.coverLetter}
                            </div>
                        </section>

                        {displayResult.highlightsUsed.length > 0 && (
                            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                                <h4 className="text-sm font-semibold text-gray-900">使用到的简历亮点</h4>
                                <ul className="mt-3 space-y-2 text-sm text-gray-700">
                                    {displayResult.highlightsUsed.map((item, index) => <li key={index}>• {item}</li>)}
                                </ul>
                            </section>
                        )}

                        {displayResult.tips.length > 0 && (
                            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                                <h4 className="text-sm font-semibold text-gray-900">投递前建议</h4>
                                <ul className="mt-3 space-y-2 text-sm text-gray-700">
                                    {displayResult.tips.map((item, index) => <li key={index}>• {item}</li>)}
                                </ul>
                            </section>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

export default CoverLetterPanel
