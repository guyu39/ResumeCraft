// ============================================================
// TranslateDialog — 简历翻译确认弹窗
// ============================================================

import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Globe, AlertTriangle, Check, Loader2 } from 'lucide-react'
import { useTranslate } from '@/hooks/useTranslate'
import type { TranslateResponse } from '@/api/ai'
import { useI18n } from '@/hooks/useI18n'

interface TranslateDialogProps {
    open: boolean
    onClose: () => void
    sourceLocale: string // 当前简历语言
    resumeId: string
    onCreated: (result: TranslateResponse) => void // 翻译完成确认创建
}

const TranslateDialog: React.FC<TranslateDialogProps> = ({
    open,
    onClose,
    sourceLocale,
    resumeId,
    onCreated,
}) => {
    // 推断目标语言
    const defaultTargetLocale = sourceLocale === 'en-US' ? 'zh-CN' : 'en-US'
    const [targetLocale, setTargetLocale] = useState<'zh-CN' | 'en-US'>(defaultTargetLocale)
    const [keepChineseFields, setKeepChineseFields] = useState(false)
    const [fontFallback, setFontFallback] = useState(true)

    const { translate, reset, loading, error, result } = useTranslate()
    const { t } = useI18n()

    // 每次打开重置状态
    useEffect(() => {
        if (open) {
            reset()
            setTargetLocale(sourceLocale === 'en-US' ? 'zh-CN' : 'en-US')
            setKeepChineseFields(false)
            setFontFallback(true)
        }
    }, [open, sourceLocale, reset])

    if (!open) return null

    const handleTranslate = () => {
        translate({
            resumeId,
            targetLocale,
            options: { keepChineseFields, fontFallback },
        })
    }

    const handleCreate = () => {
        if (result) {
            onCreated(result)
        }
    }

    const localeLabel: Record<string, string> = {
        'zh-CN': t('translate.chinese'),
        'en-US': t('translate.english'),
    }

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* 遮罩 */}
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />

            {/* 弹窗主体 */}
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                {/* 标题栏 */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <Globe className="w-5 h-5 text-primary" />
                        <h3 className="text-base font-semibold text-gray-900">{t('translate.title')}</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* 内容区 */}
                <div className="px-5 py-4 space-y-4">
                    {!result ? (
                        <>
                            {/* 翻译方向 */}
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-700">{t('translate.direction')}</label>
                                <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-lg">
                                    <span className="text-sm text-gray-600">{localeLabel[sourceLocale] || sourceLocale}</span>
                                    <span className="text-gray-400">→</span>
                                    <span className="text-sm font-medium text-gray-900">{localeLabel[targetLocale] || targetLocale}</span>
                                </div>
                            </div>

                            {/* 目标语言选择 */}
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-700">{t('translate.targetLang')}</label>
                                <div className="flex gap-2">
                                    {(['en-US', 'zh-CN'] as const).map((loc) => (
                                        <button
                                            key={loc}
                                            onClick={() => setTargetLocale(loc)}
                                            className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                                                targetLocale === loc
                                                    ? 'border-primary bg-primary/5 text-primary font-medium'
                                                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                            }`}
                                        >
                                            {localeLabel[loc]}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 选项 */}
                            <div className="space-y-2.5">
                                <label className="text-xs font-medium text-gray-700">{t('translate.options')}</label>
                                {targetLocale === 'en-US' && (
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={keepChineseFields}
                                            onChange={(e) => setKeepChineseFields(e.target.checked)}
                                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                                        />
                                        <span className="text-sm text-gray-700">{t('translate.keepChineseFields')}</span>
                                    </label>
                                )}
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={fontFallback}
                                        onChange={(e) => setFontFallback(e.target.checked)}
                                        className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                                    />
                                    <span className="text-sm text-gray-700">{t('translate.autoFont')}</span>
                                </label>
                            </div>

                            {/* 说明 */}
                            <div className="px-3 py-2.5 bg-amber-50 rounded-lg space-y-1">
                                <div className="flex items-center gap-1.5 text-amber-700">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    <span className="text-xs font-medium">{t('translate.notes')}</span>
                                </div>
                                <ul className="text-xs text-amber-600 space-y-0.5 ml-5 list-disc">
                                    <li>{t('translate.copyNote')}</li>
                                    <li>{t('translate.layoutNote')}</li>
                                    <li>{t('translate.techNote')}</li>
                                    <li>{t('translate.editNote')}</li>
                                </ul>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* 翻译结果 */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-green-700">
                                    <Check className="w-5 h-5" />
                                    <span className="text-sm font-medium">{t('translate.complete')}</span>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-500">{t('translate.translatedTitle')}</span>
                                        <span className="text-sm font-medium text-gray-900">{result.translatedTitle}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-500">{t('translate.usedModel')}</span>
                                        <span className="text-sm text-gray-700">{result.model}</span>
                                    </div>
                                </div>

                                {/* 警告 */}
                                {result.warnings && result.warnings.length > 0 && (
                                    <div className="px-3 py-2.5 bg-amber-50 rounded-lg space-y-1">
                                        <div className="flex items-center gap-1.5 text-amber-700">
                                            <AlertTriangle className="w-3.5 h-3.5" />
                                            <span className="text-xs font-medium">{t('translate.attention')}</span>
                                        </div>
                                        <ul className="text-xs text-amber-600 space-y-0.5 ml-5 list-disc">
                                            {result.warnings.map((w, i) => (
                                                <li key={i}>{w}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {result.suggestedStyleSettings && (
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <span>{t('translate.fontHint')} {result.suggestedStyleSettings.fontFamily}</span>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* 错误提示 */}
                    {error && (
                        <div className="px-3 py-2 bg-red-50 text-red-700 text-sm rounded-lg">
                            {error}
                        </div>
                    )}
                </div>

                {/* 底部按钮 */}
                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
                    {!result ? (
                        <>
                            <button
                                onClick={onClose}
                                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                {t('translate.cancel')}
                            </button>
                            <button
                                onClick={handleTranslate}
                                disabled={loading}
                                className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        {t('translate.translating')}
                                    </>
                                ) : (
                                    <>
                                        <Globe className="w-4 h-4" />
                                        {t('translate.start')}
                                    </>
                                )}
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={onClose}
                                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                {t('translate.cancel')}
                            </button>
                            <button
                                onClick={handleCreate}
                                className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                            >
                                <Check className="w-4 h-4" />
                                {t('translate.createCopy')}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    )
}

export default TranslateDialog
