// ============================================================
// AccountDialog — 账户弹窗（AI 配置 + 简历解析配置）
// ============================================================

import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import StyledSelect from '@/components/common/StyledSelect'
import { useAuthStore } from '@/store/authStore'
import {
    AIProviderPreset,
    AI_PROVIDER_PRESETS,
    clearAIUserConfig,
    getProviderPresetById,
    readAIUserConfig,
    resolveAIConfig,
    saveAIUserConfig,
    toAIConfigOverride,
    validateAIConfig,
} from '@/ai'
import { aiApi } from '@/api'

interface AIConfigForm {
    providerPreset: AIProviderPreset
    baseUrl: string
    model: string
    apiKey: string
}

const createAIFormFromStorage = (): AIConfigForm => {
    const stored = readAIUserConfig()
    const providerPreset = stored?.providerPreset ?? 'doubao'
    const preset = getProviderPresetById(providerPreset)
    return {
        providerPreset,
        baseUrl: (stored?.baseUrl ?? preset.baseUrl) ?? '',
        model: stored?.model ?? '',
        apiKey: '', // apiKey 不再从 localStorage 读取，由后端管理
    }
}

interface AccountDialogProps {
    open: boolean
    onClose: () => void
    user: { displayName?: string; email?: string } | null
}

const AccountDialog: React.FC<AccountDialogProps> = ({ open, onClose, user }) => {
    const { isAuthenticated } = useAuthStore()

    // AI 评估配置
    const [aiForm, setAiForm] = useState<AIConfigForm>(createAIFormFromStorage)
    const [aiStatus, setAiStatus] = useState<string | null>(null)
    const [aiError, setAiError] = useState<string | null>(null)
    const [aiHasApiKey, setAiHasApiKey] = useState(false)

    // 弹窗打开时加载后端配置
    useEffect(() => {
        if (!open || !isAuthenticated) return

        aiApi.getConfig().then((config) => {
            setAiForm({
                providerPreset: config.provider as AIProviderPreset,
                baseUrl: config.baseUrl || '',
                model: config.defaultModel || '',
                apiKey: '',
            })
            setAiHasApiKey(config.hasApiKey ?? false)
        }).catch(() => { })
    }, [open, isAuthenticated])

    // 关闭弹窗时重置状态
    useEffect(() => {
        if (!open) {
            setAiStatus(null)
            setAiError(null)
        }
    }, [open])

    // 自动清除状态消息
    useEffect(() => {
        if (!aiStatus) return
        const t = window.setTimeout(() => setAiStatus(null), 2000)
        return () => window.clearTimeout(t)
    }, [aiStatus])

    const updateAIForm = useCallback(<K extends keyof AIConfigForm>(key: K, value: AIConfigForm[K]) => {
        setAiForm((prev) => ({ ...prev, [key]: value }))
    }, [])

    const applyProviderPreset = useCallback((providerPreset: AIProviderPreset) => {
        const preset = getProviderPresetById(providerPreset)
        setAiForm((prev) => ({
            ...prev,
            providerPreset,
            baseUrl: preset.baseUrl ?? prev.baseUrl ?? '',
            model: prev.model || preset.modelPlaceholder,
        }))
    }, [])

    const saveAIConfig = useCallback(async () => {
        const baseUrl = aiForm.baseUrl?.trim() || ''
        const model = aiForm.model?.trim() || ''
        const apiKey = aiForm.apiKey?.trim() || ''

        const testConfig = {
            providerPreset: aiForm.providerPreset,
            mode: 'openai-compatible' as const,
            baseUrl: baseUrl || undefined,
            model: model || undefined,
            apiKey: apiKey || undefined,
        }
        const errors = validateAIConfig(resolveAIConfig(toAIConfigOverride(testConfig)), aiForm.providerPreset, aiHasApiKey)
        if (errors.length > 0) {
            setAiError(errors.join('；'))
            setAiStatus(null)
            return
        }

        try {
            await aiApi.saveConfig({
                provider: aiForm.providerPreset,
                model,
                apiKey: apiKey || undefined,
                baseUrl: baseUrl || undefined,
            })
            saveAIUserConfig({
                providerPreset: aiForm.providerPreset,
                mode: 'openai-compatible',
                baseUrl: baseUrl || undefined,
                model: model || undefined,
            })
            setAiHasApiKey(true)
            setAiError(null)
            setAiStatus('AI 配置已保存')
        } catch (err) {
            console.error('保存AI配置失败:', err)
            setAiError('保存失败，请重试')
            setAiStatus(null)
        }
    }, [aiForm, aiHasApiKey])

    const clearAIConfig = useCallback(() => {
        clearAIUserConfig()
        setAiForm(createAIFormFromStorage())
        setAiError(null)
        setAiStatus('本地偏好已清空（服务端密钥不受影响）')
    }, [])

    if (!open) return null

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/35" onClick={onClose} />
            <div className="relative w-full max-w-xl rounded-2xl border border-gray-100 bg-white shadow-2xl flex flex-col max-h-[85vh]">
                {/* 头部 — 固定 */}
                <div className="flex-shrink-0 flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
                    <div>
                        <h3 className="text-base font-semibold text-gray-800">账户设置</h3>
                        {user && (
                            <p className="text-xs text-gray-500 mt-0.5">{user.displayName || user.email}</p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* 内容 — 可滚动 */}
                <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-4">
                <div className="space-y-5">
                    <h5 className="text-sm font-semibold text-gray-800">AI 配置</h5>
                    <p className="text-xs text-gray-400">用于「AI 评估润色、JD 匹配分析、求职信」功能</p>

                    {!isAuthenticated ? (
                        <p className="text-xs text-gray-500">请登录后配置</p>
                    ) : (
                        <>
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-gray-700">模型供应商</label>
                                <StyledSelect
                                    value={aiForm.providerPreset}
                                    onChange={(v) => applyProviderPreset(v as AIProviderPreset)}
                                    options={AI_PROVIDER_PRESETS.map((p) => ({ label: p.label, value: p.id }))}
                                    size="compact"
                                />
                            </div>

                            {aiForm.providerPreset === 'custom' && (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-gray-700">Base URL（自定义必填）</label>
                                    <input
                                        value={aiForm.baseUrl}
                                        onChange={(e) => updateAIForm('baseUrl', e.target.value)}
                                        className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                                        placeholder="https://api.example.com/v1"
                                    />
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-gray-700">模型</label>
                                <input
                                    value={aiForm.model}
                                    onChange={(e) => updateAIForm('model', e.target.value)}
                                    className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    placeholder={getProviderPresetById(aiForm.providerPreset).modelPlaceholder}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-gray-700">API Key</label>
                                <input
                                    type="password"
                                    value={aiForm.apiKey}
                                    onChange={(e) => updateAIForm('apiKey', e.target.value)}
                                    className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    placeholder={aiHasApiKey ? '已保存密钥，留空则继续使用' : '输入可用 API Key'}
                                />
                                {aiHasApiKey && !aiForm.apiKey && (
                                    <p className="text-[11px] text-green-600">✓ 已保存密钥</p>
                                )}
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={saveAIConfig}
                                    className="rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90"
                                >
                                    保存 AI 配置
                                </button>
                                <button
                                    type="button"
                                    onClick={clearAIConfig}
                                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                                >
                                    清空配置
                                </button>
                            </div>

                            {aiError && <p className="text-xs text-red-600">{aiError}</p>}
                            {aiStatus && <p className="text-xs text-green-600">{aiStatus}</p>}
                        </>
                    )}
                </div>
                </div>
            </div>
        </div>,
        document.body
    )
}

export default AccountDialog
