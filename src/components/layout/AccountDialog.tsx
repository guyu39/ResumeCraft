// ============================================================
// AccountDialog — 账户弹窗（AI 配置 + 简历解析配置）
// ============================================================

import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
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

    // 简历解析配置
    const [parserForm, setParserForm] = useState({ provider: 'openai', model: '', apiKey: '', baseUrl: '' })
    const [parserStatus, setParserStatus] = useState<string | null>(null)
    const [parserError, setParserError] = useState<string | null>(null)
    const [parserHasApiKey, setParserHasApiKey] = useState(false)

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

        aiApi.getParserConfig().then((cfg) => {
            setParserForm({
                provider: cfg.provider || 'openai',
                model: cfg.model || '',
                apiKey: '',
                baseUrl: cfg.baseUrl || '',
            })
            setParserHasApiKey(cfg.hasApiKey ?? false)
        }).catch(() => { })
    }, [open, isAuthenticated])

    // 关闭弹窗时重置状态
    useEffect(() => {
        if (!open) {
            setAiStatus(null)
            setAiError(null)
            setParserStatus(null)
            setParserError(null)
        }
    }, [open])

    // 自动清除状态消息
    useEffect(() => {
        if (!aiStatus) return
        const t = window.setTimeout(() => setAiStatus(null), 2000)
        return () => window.clearTimeout(t)
    }, [aiStatus])
    useEffect(() => {
        if (!parserStatus) return
        const t = window.setTimeout(() => setParserStatus(null), 2000)
        return () => window.clearTimeout(t)
    }, [parserStatus])

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

    const saveParserConfig = useCallback(async () => {
        const { provider, model, apiKey } = parserForm
        if (!provider.trim() || !model.trim()) {
            setParserError('请填写模型供应商和模型名称')
            setParserStatus(null)
            return
        }
        if (!apiKey.trim() && !parserHasApiKey) {
            setParserError('请填写 API Key')
            setParserStatus(null)
            return
        }
        try {
            await aiApi.saveParserConfig({
                provider: provider.trim(),
                model: model.trim(),
                apiKey: apiKey.trim() || undefined,
                baseUrl: parserForm.baseUrl.trim() || undefined,
            })
            setParserHasApiKey(true)
            setParserError(null)
            setParserStatus('解析配置已保存')
        } catch (err) {
            console.error('保存解析配置失败:', err)
            setParserError('保存失败，请重试')
            setParserStatus(null)
        }
    }, [parserForm, parserHasApiKey])

    if (!open) return null

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/35" onClick={onClose} />
            <div className="relative w-full max-w-xl max-h-[85vh] overflow-y-auto no-scrollbar rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl">
                {/* 头部 */}
                <div className="flex items-center justify-between mb-5">
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

                {/* AI 评估配置 */}
                <div className="space-y-3">
                    <h5 className="text-sm font-semibold text-gray-800">AI 配置</h5>
                    <p className="text-xs text-gray-400">用于「AI 评估润色、JD 匹配分析、求职信」功能</p>

                    {!isAuthenticated ? (
                        <p className="text-xs text-gray-500">请登录后配置</p>
                    ) : (
                        <>
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-gray-700">模型供应商</label>
                                <select
                                    value={aiForm.providerPreset}
                                    onChange={(e) => applyProviderPreset(e.target.value as AIProviderPreset)}
                                    className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                                >
                                    {AI_PROVIDER_PRESETS.map((p) => (
                                        <option key={p.id} value={p.id}>{p.label}</option>
                                    ))}
                                </select>
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

                {/* 简历解析配置 */}
                <div className="border-t border-gray-100 pt-4 mt-4 space-y-3">
                    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-3 space-y-3">
                        <div>
                            <h6 className="text-xs font-semibold text-gray-600">简历解析专用</h6>
                            <p className="text-[11px] text-gray-400 mt-0.5">仅用于「新建简历 → 解析简历导入」的文件识别，与上方 AI 评估独立配置</p>
                        </div>

                        {!isAuthenticated ? (
                            <p className="text-xs text-gray-500">请登录后配置</p>
                        ) : (
                            <>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-gray-700">模型供应商</label>
                                    <select
                                        value={parserForm.provider}
                                        onChange={(e) => setParserForm((prev) => ({ ...prev, provider: e.target.value }))}
                                        className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    >
                                        <option value="openai">OpenAI</option>
                                        <option value="doubao">豆包 (Doubao)</option>
                                        <option value="deepseek">DeepSeek</option>
                                        <option value="zhipu">智谱 (GLM)</option>
                                        <option value="qwen">通义千问</option>
                                        <option value="moonshot">Moonshot</option>
                                        <option value="custom">自定义</option>
                                    </select>
                                </div>

                                {parserForm.provider === 'custom' && (
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-gray-700">Base URL（自定义必填）</label>
                                        <input
                                            value={parserForm.baseUrl}
                                            onChange={(e) => setParserForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
                                            className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                                            placeholder="https://api.example.com/v1"
                                        />
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-gray-700">模型</label>
                                    <input
                                        value={parserForm.model}
                                        onChange={(e) => setParserForm((prev) => ({ ...prev, model: e.target.value }))}
                                        className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                                        placeholder="例如 gpt-4o-mini"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-gray-700">API Key</label>
                                    <input
                                        type="password"
                                        value={parserForm.apiKey}
                                        onChange={(e) => setParserForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                                        className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                                        placeholder={parserHasApiKey ? '已保存密钥，留空则继续使用' : '输入 API Key'}
                                    />
                                    {parserHasApiKey && !parserForm.apiKey && (
                                        <p className="text-[11px] text-green-600">✓ 已保存密钥</p>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={saveParserConfig}
                                        className="rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90"
                                    >
                                        保存解析配置
                                    </button>
                                </div>

                                {parserError && <p className="text-xs text-red-600">{parserError}</p>}
                                {parserStatus && <p className="text-xs text-green-600">{parserStatus}</p>}
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
