import React, { useEffect, useState } from 'react'
import type { RichTextSuggestionItem } from '@/ai'
import type { SuggestRecord, ConversationDetail } from '@/api/ai'
import { aiApi } from '@/api'

interface AISuggestionPanelProps {
    open: boolean
    suggestions: RichTextSuggestionItem[]
    loading: boolean
    error: string | null
    modeLabel?: string
    fromCache?: boolean
    originalContent?: string
    resumeId?: string
    moduleType?: string
    fieldKey?: string
    moduleInstanceId?: string
    conversationId?: string
    isAuthenticated?: boolean
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
    fromCache,
    originalContent,
    resumeId,
    moduleType,
    fieldKey,
    moduleInstanceId,
    conversationId,
    isAuthenticated,
    onApplySuggestion,
    onRetry,
    onRefresh,
    onClose,
}) => {
    const [activeTab, setActiveTab] = useState<'original' | 'suggest'>(
        suggestions.length === 0 && originalContent ? 'original' : 'suggest'
    )
    const [historyRecords, setHistoryRecords] = useState<SuggestRecord[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    // 当前轮的"原文"：采纳后变为上次优化内容，下次打开时从历史记录加载
    const [currentOriginal, setCurrentOriginal] = useState<string>(originalContent || '')
    // 采纳后从历史记录中加载的上一轮建议（用于回显）
    const [prevRoundSuggestions, setPrevRoundSuggestions] = useState<RichTextSuggestionItem[]>([])

    // 打开时：从历史记录加载最新一条的 optimizedContent 作为当前原文，
    // 并用其 conversationId 取出上一轮的 AI 建议用于回显
    useEffect(() => {
        if (!open || !resumeId || resumeId === 'local' || !isAuthenticated) return

        setLoadingHistory(true)
        aiApi.getSuggestRecords({
            resumeId,
            moduleType,
            moduleInstanceId,
            fieldKey,
            limit: 5,
        }).then(async (res) => {
            const records = res.items || []
            setHistoryRecords(records)

            // 有历史记录：用最新一条的 optimizedContent 作为原文，
            // 并通过 conversation_id 加载上一轮的 AI 建议
            if (records.length > 0) {
                const latest = records[0]
                if (latest.optimizedContent) {
                    setCurrentOriginal(latest.optimizedContent)
                }
                if (latest.conversationId) {
                    try {
                        const conv: ConversationDetail = await aiApi.getConversation(latest.conversationId)
                        // 从对话消息中解析出 AI 回复的 suggestions
                        const aiMsg = conv.messages.find(m => m.role === 'assistant')
                        if (aiMsg) {
                            try {
                                const parsed = JSON.parse(aiMsg.content)
                                const sugs: RichTextSuggestionItem[] = (Array.isArray(parsed) ? parsed : parsed.suggestions || []).map(
                                    (s: { content?: string; reason?: string; rewrite?: string }, i: number) => ({
                                        id: `prev-${i}`,
                                        title: `建议 ${i + 1}`,
                                        reason: s.reason || '',
                                        rewrite: s.content || s.rewrite || '',
                                    })
                                )
                                setPrevRoundSuggestions(sugs)
                            } catch {
                                // JSON 解析失败，忽略
                            }
                        }
                    } catch {
                        // 加载历史对话失败，忽略
                    }
                }
            } else {
                // 无历史记录：原文为 prop 传入值
                setCurrentOriginal(originalContent || '')
            }
        }).catch(() => {
            setHistoryRecords([])
            setCurrentOriginal(originalContent || '')
        }).finally(() => {
            setLoadingHistory(false)
        })
    }, [open, resumeId, moduleType, fieldKey, isAuthenticated])

    // 切换到原文 tab 时重置展开状态
    useEffect(() => {
        if (activeTab === 'original') {
            setExpandedId(null)
        }
    }, [activeTab])

    if (!open) return null

    const showTabs = !loading && (suggestions.length > 0 || prevRoundSuggestions.length > 0 || historyRecords.length > 0)

    // 合并当前轮建议和历史原文记录，当前轮排在最前面
    const allRecords = [
        { id: '__current__', originalContent: currentOriginal, createdAt: Date.now(), isCurrent: true },
        ...historyRecords.filter(r => r.originalContent !== currentOriginal),
    ]

    const formatTime = (timestamp: number) => {
        const d = new Date(timestamp)
        const now = new Date()
        const isToday = d.toDateString() === now.toDateString()
        if (isToday) {
            return `今天 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
        }
        return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4">
            <div className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                    <div>
                        <h4 className="text-sm font-semibold text-gray-800">AI 润色建议</h4>
                        <p className="mt-0.5 text-xs text-gray-500">
                            {isAuthenticated ? (modeLabel ?? '已连接 AI 模型') : '请先登录'}
                            {isAuthenticated && fromCache && <span className="ml-1 text-green-600">· 来自缓存</span>}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {!isAuthenticated && (
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
                        )}
                        {suggestions.length > 0 && (
                            <button
                                type="button"
                                onClick={onRefresh}
                                disabled={loading}
                                className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs text-primary hover:bg-primary/10 disabled:opacity-60 disabled:cursor-wait"
                            >
                                {loading ? '优化中...' : '重新生成'}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                        >
                            关闭
                        </button>
                    </div>
                </div>

                {/* 标签页 */}
                {showTabs && (
                    <div className="flex border-b border-gray-100">
                        <button
                            type="button"
                            onClick={() => setActiveTab('suggest')}
                            className={`px-4 py-2 text-xs font-medium transition-colors ${activeTab === 'suggest'
                                ? 'border-b-2 border-primary text-primary'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            润色 ({suggestions.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('original')}
                            className={`px-4 py-2 text-xs font-medium transition-colors ${activeTab === 'original'
                                ? 'border-b-2 border-primary text-primary'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            原文内容 ({allRecords.length})
                        </button>
                    </div>
                )}

                <div className="max-h-[70vh] overflow-y-auto no-scrollbar p-4">
                    {loading && (
                        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                            AI 正在润色...
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

                    {!loading && !error && activeTab === 'suggest' && suggestions.length === 0 && prevRoundSuggestions.length === 0 && (
                        <div className="text-sm text-gray-500">
                            暂无润色建议，请先登录。
                        </div>
                    )}

                    {/* 展示上一轮历史建议（用户重新打开时回显） */}
                    {!loading && !error && activeTab === 'suggest' && suggestions.length === 0 && prevRoundSuggestions.length > 0 && (
                        <div className="space-y-3">
                            <div className="mb-2 text-xs text-gray-400">上一轮建议</div>
                            {prevRoundSuggestions.map((item) => (
                                <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h5 className="text-sm font-semibold text-gray-800">{item.title}</h5>
                                            {item.reason && (
                                                <p className="mt-1 text-xs text-gray-500">{item.reason}</p>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (resumeId && resumeId !== 'local' && currentOriginal && conversationId) {
                                                    await aiApi.saveSuggestRecord({
                                                        resumeId,
                                                        conversationId,
                                                        moduleType: moduleType || '',
                                                        moduleInstanceId: moduleInstanceId || '',
                                                        fieldKey: fieldKey || '',
                                                        originalContent: currentOriginal,
                                                        optimizedContent: item.rewrite,
                                                        suggestions: prevRoundSuggestions.map(s => ({
                                                            content: s.rewrite,
                                                            reason: s.reason || '',
                                                        })),
                                                    }).catch(() => { /* ignore save error */ })
                                                }
                                                setCurrentOriginal(item.rewrite)
                                                setPrevRoundSuggestions([])
                                                onApplySuggestion(item.rewrite)
                                            }}
                                            className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90"
                                        >
                                            一键插入
                                        </button>
                                    </div>
                                    <div className="mt-2 rounded-md bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-700 whitespace-pre-wrap">
                                        {item.rewrite}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {!loading && !error && activeTab === 'original' && (
                        <div>
                            {loadingHistory ? (
                                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                                    加载历史记录...
                                </div>
                            ) : allRecords.length === 0 ? (
                                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                                    暂无历史记录。
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="mb-3 text-xs text-gray-400">
                                        点击可展开/收起完整内容
                                    </div>
                                    {allRecords.map((record) => {
                                        const isExpanded = expandedId === record.id
                                        const isCurrent = 'isCurrent' in record && record.isCurrent
                                        return (
                                            <div
                                                key={record.id}
                                                className={`rounded-lg border p-3 cursor-pointer transition-colors ${isCurrent
                                                    ? 'border-primary/30 bg-primary/5'
                                                    : 'border-gray-200 bg-white hover:border-gray-300'
                                                    }`}
                                                onClick={() => setExpandedId(isExpanded ? null : record.id)}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-xs px-1.5 py-0.5 rounded ${isCurrent
                                                            ? 'bg-primary/10 text-primary'
                                                            : 'bg-gray-100 text-gray-500'
                                                            }`}>
                                                            {isCurrent ? '当前' : formatTime(record.createdAt)}
                                                        </span>
                                                    </div>
                                                    <span className="text-xs text-gray-400">
                                                        {isExpanded ? '收起' : '展开'}
                                                    </span>
                                                </div>
                                                <div className={`mt-2 text-sm leading-5 text-gray-700 whitespace-pre-wrap ${!isExpanded ? 'max-h-16 overflow-hidden' : ''
                                                    }`}>
                                                    {record.originalContent || '(空)'}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {!loading && !error && activeTab === 'suggest' && suggestions.length > 0 && (
                        <div className="space-y-3">
                            {suggestions.map((item) => (
                                <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h5 className="text-sm font-semibold text-gray-800">{item.title}</h5>
                                            {item.reason && (
                                                <p className="mt-1 text-xs text-gray-500">{item.reason}</p>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                // 保存润色记录后再插入
                                                if (resumeId && resumeId !== 'local' && currentOriginal && conversationId) {
                                                    await aiApi.saveSuggestRecord({
                                                        resumeId,
                                                        conversationId,
                                                        moduleType: moduleType || '',
                                                        moduleInstanceId: moduleInstanceId || '',
                                                        fieldKey: fieldKey || '',
                                                        originalContent: currentOriginal,
                                                        optimizedContent: item.rewrite,
                                                        suggestions: suggestions.map(s => ({
                                                            content: s.rewrite,
                                                            reason: s.reason || '',
                                                        })),
                                                    }).catch(() => { /* ignore save error */ })
                                                }
                                                // 采纳后：更新当前原文为本次优化内容，下次打开时展示
                                                setCurrentOriginal(item.rewrite)
                                                // 将当前轮建议追加到历史（下次可从历史翻阅）
                                                setPrevRoundSuggestions([])
                                                onApplySuggestion(item.rewrite)
                                            }}
                                            className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90"
                                        >
                                            一键插入
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