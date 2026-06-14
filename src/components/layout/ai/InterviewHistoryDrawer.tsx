import { useEffect, useState } from 'react'
import { X, Clock, Trash2, FileText, Mic, Loader2, AlertTriangle, AlertCircle, ChevronRight, Building2 } from 'lucide-react'
import { aiApi, type InterviewSessionListItem, type InterviewSessionDetail } from '@/api/ai'

interface InterviewHistoryDrawerProps {
    open: boolean
    onClose: () => void
    onLoadSession?: (session: InterviewSessionDetail) => void
}

const ROUND_LABEL: Record<string, string> = {
    technical_1: '技术一面',
    technical_2: '技术二面',
    hr: 'HR 面',
}

const STATUS_LABEL: Record<string, { text: string; class: string }> = {
    generating: { text: '生成中', class: 'bg-amber-50 text-amber-700' },
    answering: { text: '答题中', class: 'bg-blue-50 text-blue-700' },
    evaluated: { text: '已评估', class: 'bg-green-50 text-green-700' },
}

function formatTime(ts: number): string {
    if (!ts) return '-'
    const d = new Date(ts)
    const now = Date.now()
    const diff = now - ts
    if (diff < 60_000) return '刚刚'
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
    if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)} 小时前`
    if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function InterviewHistoryDrawer({ open, onClose, onLoadSession }: InterviewHistoryDrawerProps) {
    const [items, setItems] = useState<InterviewSessionListItem[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [total, setTotal] = useState(0)
    const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [confirmId, setConfirmId] = useState<string | null>(null)

    // 暂不展示 total，但仍保留接收逻辑兼容后端字段
    void total

    const PAGE_SIZE = 10

    const fetchPage = async () => {
        setLoading(true)
        setError(null)
        try {
            const resp = await aiApi.interviewListSessions(PAGE_SIZE, 0)
            setItems(resp.items)
            setTotal(resp.total)
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载历史失败')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (open) {
            fetchPage()
        }
    }, [open])

    const handleLoad = async (sessionId: string) => {
        setLoadingDetailId(sessionId)
        try {
            const detail = await aiApi.interviewGetSession(sessionId)
            onLoadSession?.(detail)
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载详情失败')
        } finally {
            setLoadingDetailId(null)
        }
    }

    const requestDelete = (sessionId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setConfirmId(sessionId)
    }

    const cancelDelete = (e: React.MouseEvent) => {
        e.stopPropagation()
        setConfirmId(null)
    }

    const confirmDelete = async (sessionId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setDeletingId(sessionId)
        setConfirmId(null)
        try {
            await aiApi.interviewDeleteSession(sessionId)
            setItems(prev => prev.filter(it => it.id !== sessionId))
            setTotal(prev => Math.max(0, prev - 1))
        } catch (err) {
            setError(err instanceof Error ? err.message : '删除失败')
        } finally {
            setDeletingId(null)
        }
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex">
            <div
                className="absolute inset-0 bg-black/30 backdrop-blur-sm"
                onClick={onClose}
            />
            <div className="relative ml-auto flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                    <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold text-gray-900">面试历史</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="thin-scrollbar flex-1 overflow-y-auto">
                    {error && (
                        <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {loading && items.length === 0 ? (
                        <div className="flex h-32 items-center justify-center text-sm text-gray-400">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            加载中…
                        </div>
                    ) : items.length === 0 ? (
                        <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-gray-400">
                            <Clock className="h-6 w-6 opacity-50" />
                            <span>暂无面试记录</span>
                            <span className="text-xs">生成面试题或上传录音后会显示在这里</span>
                        </div>
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {items.map(item => {
                                const status = STATUS_LABEL[item.status] || { text: item.status, class: 'bg-gray-50 text-gray-600' }
                                const isLoadingThis = loadingDetailId === item.id
                                const isDeletingThis = deletingId === item.id
                                return (
                                    <li
                                        key={item.id}
                                        className="group cursor-pointer px-4 py-3 transition-colors hover:bg-gray-50"
                                        onClick={() => handleLoad(item.id)}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    {item.mode === 'transcript' ? (
                                                        <Mic className="h-3.5 w-3.5 shrink-0 text-purple-500" />
                                                    ) : (
                                                        <FileText className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                                                    )}
                                                    <h4 className="truncate text-sm font-medium text-gray-900">
                                                        {item.targetTitle || '未命名岗位'}
                                                    </h4>
                                                </div>
                                                {item.companyName && (
                                                    <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                                                        <Building2 className="h-3 w-3" />
                                                        <span className="truncate">{item.companyName}</span>
                                                    </p>
                                                )}
                                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${status.class}`}>
                                                        {status.text}
                                                    </span>
                                                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                                                        {ROUND_LABEL[item.interviewRound] || item.interviewRound}
                                                    </span>
                                                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                                                        {item.questionCount} 题
                                                    </span>
                                                    {typeof item.overallScore === 'number' && (
                                                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                                            {item.overallScore}{item.passLevel ? ` · ${item.passLevel}` : ''}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="mt-1 text-[10px] text-gray-400">
                                                    {formatTime(item.createdAt)}
                                                </p>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1">
                                                <div className="relative">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => requestDelete(item.id, e)}
                                                        disabled={isDeletingThis}
                                                        className={`rounded-md p-1.5 text-gray-400 transition-opacity hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30 ${
                                                            confirmId === item.id ? 'opacity-100 bg-red-50 text-red-500' : 'opacity-0 group-hover:opacity-100'
                                                        }`}
                                                        title="删除"
                                                    >
                                                        {isDeletingThis ? (
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        )}
                                                    </button>

                                                    {/* 气泡确认 */}
                                                    {confirmId === item.id && (
                                                        <>
                                                            {/* 透明遮罩用于点击外部关闭 */}
                                                            <div
                                                                className="fixed inset-0 z-10"
                                                                onClick={cancelDelete}
                                                            />
                                                            <div
                                                                className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <div className="flex items-start gap-2">
                                                                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                                                                    <p className="text-xs leading-relaxed text-gray-700">
                                                                        确定删除这条面试记录？该操作不可撤销。
                                                                    </p>
                                                                </div>
                                                                <div className="mt-2.5 flex justify-end gap-1.5">
                                                                    <button
                                                                        type="button"
                                                                        onClick={cancelDelete}
                                                                        className="rounded-md px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100"
                                                                    >
                                                                        取消
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => confirmDelete(item.id, e)}
                                                                        className="rounded-md bg-red-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-600"
                                                                    >
                                                                        删除
                                                                    </button>
                                                                </div>
                                                                {/* 三角箭头 */}
                                                                <div className="absolute -top-1 right-3 h-2 w-2 rotate-45 border-l border-t border-gray-200 bg-white" />
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                                {isLoadingThis ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                                                ) : (
                                                    <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
                                                )}
                                            </div>
                                        </div>
                                    </li>
                                )
                            })}

                            {items.length >= 10 && (
                                <li className="px-4 py-3 text-center text-[11px] text-gray-400">
                                    历史最多保留 10 条记录
                                </li>
                            )}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    )
}
