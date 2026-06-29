import React, { useState } from 'react'
import { Wand2, Check, AlertCircle } from 'lucide-react'
import DOMPurify from 'dompurify'
import type { StarDimension } from '@/api/ai'

interface StarGuidePanelProps {
    open: boolean
    scenario: string
    analyzing: boolean
    generating: boolean
    error: string | null
    dimensions: StarDimension[] | null
    generatedHtml: string | null
    model: string | null
    isAuthenticated: boolean
    onClose: () => void
    onAnalyze: () => void
    onGenerate: (supplements: Record<string, string>) => void
    onApply: (html: string) => void
}

const dimensionDesc: Record<string, string> = {
    S: '背景与挑战',
    T: '任务目标',
    A: '具体行动',
    R: '结果（尽量量化）',
}

// StarGuidePanel — STAR 引导改写两阶段面板：先分析维度，引导补全缺失项，再生成
const StarGuidePanel: React.FC<StarGuidePanelProps> = ({
    open,
    scenario,
    analyzing,
    generating,
    error,
    dimensions,
    generatedHtml,
    model,
    isAuthenticated,
    onClose,
    onAnalyze,
    onGenerate,
    onApply,
}) => {
    const [supplements, setSupplements] = useState<Record<string, string>>({})

    if (!open) return null

    const setSupplement = (key: string, value: string) => {
        setSupplements((prev) => ({ ...prev, [key]: value }))
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4">
            <div className="max-h-[86vh] w-full max-w-2xl overflow-y-auto no-scrollbar rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                            <Wand2 className="h-4 w-4 text-primary" />
                            STAR 引导改写
                        </h4>
                        <p className="mt-1 text-xs text-gray-500">
                            适合写不出、想不全时用：先诊断缺哪些环节（背景/任务/行动/结果），引导你补全后再成稿
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50"
                    >
                        关闭
                    </button>
                </div>

                <div className="mt-3 rounded-lg bg-gray-50 p-3">
                    <p className="text-xs font-medium text-gray-500">原始描述</p>
                    <p className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-gray-700 no-scrollbar">
                        {scenario}
                    </p>
                </div>

                {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
                {!isAuthenticated && (
                    <p className="mt-2 text-xs text-amber-600">请先登录并配置 AI 服务后再使用 STAR 改写。</p>
                )}

                {!dimensions && (
                    <button
                        type="button"
                        disabled={!isAuthenticated || analyzing || !scenario.trim()}
                        onClick={onAnalyze}
                        className="mt-3 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {analyzing ? '分析中...' : '分析 STAR 维度'}
                    </button>
                )}

                {dimensions && (
                    <div className="mt-4 space-y-2.5">
                        {dimensions.map((dim) => (
                            <div
                                key={dim.key}
                                className={`rounded-xl border p-3 ${dim.present ? 'border-green-100 bg-green-50/40' : 'border-amber-100 bg-amber-50/40'}`}
                            >
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${dim.present ? 'bg-green-500 text-white' : 'bg-amber-400 text-white'}`}
                                    >
                                        {dim.key}
                                    </span>
                                    <span className="text-sm font-medium text-gray-800">{dim.label}</span>
                                    <span className="text-xs text-gray-400">{dimensionDesc[dim.key]}</span>
                                    {dim.present ? (
                                        <Check className="ml-auto h-4 w-4 text-green-500" />
                                    ) : (
                                        <AlertCircle className="ml-auto h-4 w-4 text-amber-500" />
                                    )}
                                </div>

                                {dim.present && dim.extracted && (
                                    <p className="mt-2 text-xs leading-relaxed text-gray-600">已识别：{dim.extracted}</p>
                                )}

                                {!dim.present && (
                                    <div className="mt-2">
                                        {dim.hint && <p className="text-xs text-amber-700">{dim.hint}</p>}
                                        <textarea
                                            value={supplements[dim.key] ?? ''}
                                            onChange={(e) => setSupplement(dim.key, e.target.value)}
                                            placeholder="补充该维度内容，可选"
                                            className="mt-1.5 min-h-16 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-xs leading-relaxed text-gray-800 outline-none focus:ring-2 focus:ring-primary/30 no-scrollbar"
                                        />
                                    </div>
                                )}
                            </div>
                        ))}

                        <button
                            type="button"
                            disabled={!isAuthenticated || generating}
                            onClick={() => onGenerate(supplements)}
                            className="mt-1 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {generating ? '生成中...' : '生成 STAR 版本'}
                        </button>
                        {model && <p className="text-right text-xs text-gray-400">模型：{model}</p>}
                    </div>
                )}

                {generatedHtml && (
                    <div className="mt-4 rounded-xl border border-gray-100 p-3">
                        <p className="text-sm font-semibold text-gray-800">生成结果</p>
                        <div
                            className="prose-sm mt-2 text-sm leading-relaxed text-gray-700"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(generatedHtml) }}
                        />
                        <button
                            type="button"
                            onClick={() => onApply(generatedHtml)}
                            className="mt-3 w-full rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90"
                        >
                            采用此版本
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

export default StarGuidePanel
