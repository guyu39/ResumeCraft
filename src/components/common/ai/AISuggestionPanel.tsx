import React from 'react'
import type { RichTextSuggestionItem } from '@/ai'

interface AISuggestionPanelProps {
    open: boolean
    suggestions: RichTextSuggestionItem[]
    loading: boolean
    error: string | null
    modeLabel?: string
    onApplySuggestion: (rewrite: string) => void
    onRetry: () => void
    onRefresh: () => void
    onClose: () => void
}

const AISuggestionPanel: React.FC<AISuggestionPanelProps> = ({
    open,
    suggestions,
    loading,
    error,
    modeLabel,
    onApplySuggestion,
    onRetry,
    onRefresh,
    onClose,
}) => {
    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4">
            <div className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                    <div>
                        <h4 className="text-sm font-semibold text-gray-800">AI 优化建议</h4>
                        <p className="mt-0.5 text-xs text-gray-500">{modeLabel ?? '已连接 AI 模型'}，可选择一条建议应用到编辑器</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onRefresh}
                            disabled={loading}
                            className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs text-primary hover:bg-primary/10 disabled:opacity-60 disabled:cursor-wait"
                        >
                            {loading ? '优化中...' : '重新优化'}
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

                <div className="max-h-[70vh] overflow-y-auto no-scrollbar p-4">
                    {loading && (
                        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                            AI 正在生成建议...
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

                    {!loading && !error && suggestions.length === 0 && (
                        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                            暂无建议，请稍后重试。
                        </div>
                    )}

                    {!loading && !error && suggestions.length > 0 && (
                        <div className="space-y-3">
                            {suggestions.map((item) => (
                                <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h5 className="text-sm font-semibold text-gray-800">{item.title}</h5>
                                            <p className="mt-1 text-xs text-gray-500">{item.reason}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => onApplySuggestion(item.rewrite)}
                                            className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90"
                                        >
                                            应用此建议
                                        </button>
                                    </div>
                                    <div className="mt-2 rounded-md bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-700 whitespace-pre-wrap">
                                        {item.rewrite}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default AISuggestionPanel
