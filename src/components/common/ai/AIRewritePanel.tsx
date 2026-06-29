import React, { useState } from 'react'
import type { RichTextSuggestionItem } from '@/ai'
import type { BulletRewriteResponse } from '@/api/ai'
import AISuggestionPanel from '@/components/common/ai/AISuggestionPanel'

interface AIRewritePanelProps {
    open: boolean
    isAuthenticated?: boolean
    onClose: () => void

    // 点评建议（suggest）模式 —— 透传给内嵌的 AISuggestionPanel
    suggestions: RichTextSuggestionItem[]
    suggestLoading: boolean
    suggestError: string | null
    modeLabel?: string
    fromCache?: boolean
    originalContent?: string
    resumeId?: string
    moduleType?: string
    fieldKey?: string
    moduleInstanceId?: string
    conversationId?: string
    onApplySuggestion: (rewrite: string) => void
    onRetrySuggest: () => void
    onRefreshSuggest: () => void

    // 多版本重写（rewrite）模式
    bulletData: BulletRewriteResponse | null
    bulletLoading: boolean
    bulletError: string | null
    rewriteContentPreview: string
    rewriteHasSelection: boolean
    jdText: string
    targetTitle: string
    companyName: string
    onJdTextChange: (v: string) => void
    onTargetTitleChange: (v: string) => void
    onCompanyNameChange: (v: string) => void
    onGenerateBullet: () => void
    onApplyBullet: (text: string) => void
}

const versionLabel = (type: string): string => {
    switch (type) {
        case 'impact': return '成果导向'
        case 'technical': return '技术深度'
        case 'business': return '业务价值'
        default: return type
    }
}

// AIRewritePanel — 统一的「AI 改写」入口，内含「点评建议 / 多版本重写」两种模式
const AIRewritePanel: React.FC<AIRewritePanelProps> = ({
    open,
    isAuthenticated,
    onClose,
    suggestions,
    suggestLoading,
    suggestError,
    modeLabel,
    fromCache,
    originalContent,
    resumeId,
    moduleType,
    fieldKey,
    moduleInstanceId,
    conversationId,
    onApplySuggestion,
    onRetrySuggest,
    onRefreshSuggest,
    bulletData,
    bulletLoading,
    bulletError,
    rewriteContentPreview,
    rewriteHasSelection,
    jdText,
    targetTitle,
    companyName,
    onJdTextChange,
    onTargetTitleChange,
    onCompanyNameChange,
    onGenerateBullet,
    onApplyBullet,
}) => {
    const [mode, setMode] = useState<'suggest' | 'rewrite'>('suggest')

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4">
            <div className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                    <div>
                        <h4 className="text-sm font-semibold text-gray-800">AI 改写</h4>
                        <p className="mt-0.5 text-xs text-gray-500">
                            {isAuthenticated ? (modeLabel ?? '已连接 AI 模型') : '请先登录'}
                            {isAuthenticated && mode === 'suggest' && fromCache && (
                                <span className="ml-1 text-green-600">· 来自缓存</span>
                            )}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                    >
                        关闭
                    </button>
                </div>

                {/* 模式切换 */}
                <div className="flex border-b border-gray-100">
                    <button
                        type="button"
                        onClick={() => setMode('suggest')}
                        className={`px-4 py-2 text-xs font-medium transition-colors ${mode === 'suggest'
                            ? 'border-b-2 border-primary text-primary'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        点评建议
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('rewrite')}
                        className={`px-4 py-2 text-xs font-medium transition-colors ${mode === 'rewrite'
                            ? 'border-b-2 border-primary text-primary'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        改写本段（多风格）
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
                    {mode === 'suggest' && (
                        <AISuggestionPanel
                            inline
                            open={open}
                            suggestions={suggestions}
                            loading={suggestLoading}
                            error={suggestError}
                            modeLabel={modeLabel}
                            fromCache={fromCache}
                            originalContent={originalContent}
                            resumeId={resumeId}
                            moduleType={moduleType}
                            fieldKey={fieldKey}
                            moduleInstanceId={moduleInstanceId}
                            conversationId={conversationId}
                            isAuthenticated={isAuthenticated}
                            onApplySuggestion={onApplySuggestion}
                            onRetry={onRetrySuggest}
                            onRefresh={onRefreshSuggest}
                            onClose={onClose}
                        />
                    )}

                    {mode === 'rewrite' && (
                        <div className="p-4">
                            <p className="mb-3 rounded-lg bg-blue-50/60 px-3 py-2 text-[11px] leading-relaxed text-blue-600/90">
                                已写好这一段、想换种写法时用：给出成果 / 技术 / 业务 3 种风格供挑选。若还没想清楚怎么写、缺哪些环节，改用工具栏的「STAR」引导。
                            </p>
                            <div className="rounded-lg bg-gray-50 p-3">
                                <p className="text-xs font-medium text-gray-500">待重写内容</p>
                                <p className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-gray-700 no-scrollbar">
                                    {rewriteContentPreview || '(空)'}
                                </p>
                                <p className="mt-1 text-[11px] text-gray-400">
                                    {rewriteHasSelection ? '将重写当前选中文本' : '未选择文本，将重写整个字段'}
                                </p>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <input
                                    value={targetTitle}
                                    onChange={(e) => onTargetTitleChange(e.target.value)}
                                    placeholder="目标岗位，可选"
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-800 outline-none focus:ring-2 focus:ring-primary/30"
                                />
                                <input
                                    value={companyName}
                                    onChange={(e) => onCompanyNameChange(e.target.value)}
                                    placeholder="公司名称，可选"
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-800 outline-none focus:ring-2 focus:ring-primary/30"
                                />
                            </div>
                            <textarea
                                value={jdText}
                                onChange={(e) => onJdTextChange(e.target.value)}
                                placeholder="粘贴岗位 JD，可选；填写后会优先贴合岗位关键词"
                                className="mt-2 min-h-24 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-xs leading-relaxed text-gray-800 outline-none focus:ring-2 focus:ring-primary/30 no-scrollbar"
                            />
                            <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                                <span>{jdText.length}/30000</span>
                                {bulletData?.model && <span>模型：{bulletData.model}</span>}
                            </div>

                            {bulletError && <p className="mt-2 text-xs text-red-600">{bulletError}</p>}
                            {!isAuthenticated && (
                                <p className="mt-2 text-xs text-amber-600">请先登录并配置 AI 服务后再使用多版本重写。</p>
                            )}

                            <button
                                type="button"
                                disabled={!isAuthenticated || bulletLoading || jdText.length > 30000}
                                onClick={onGenerateBullet}
                                className="mt-3 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {bulletLoading ? '生成中...' : '生成 3 个版本'}
                            </button>

                            {bulletData && (
                                <div className="mt-4 space-y-3">
                                    {bulletData.versions.map((version, index) => (
                                        <div key={`${version.type}-${index}`} className="rounded-xl border border-gray-100 p-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-800">{versionLabel(version.type)}</p>
                                                    <p className="mt-1 text-sm leading-relaxed text-gray-700">{version.text}</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => onApplyBullet(version.text)}
                                                    className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90"
                                                >
                                                    采用
                                                </button>
                                            </div>
                                            {version.highlights.length > 0 && (
                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                    {version.highlights.map((highlight) => (
                                                        <span key={highlight} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                                                            {highlight}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {bulletData.missingData.length > 0 && (
                                        <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
                                            建议补充：{bulletData.missingData.join('、')}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default AIRewritePanel
