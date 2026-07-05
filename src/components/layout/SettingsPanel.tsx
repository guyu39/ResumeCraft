// ============================================================
// SettingsPanel — 设置面板（模板/字体/颜色/AI 配置/解析配置/翻译）
// 从 RightPanel 拆出，减小主文件体积。
// ============================================================

import React, { useEffect, useState } from 'react'
import { Globe, X, ChevronDown } from 'lucide-react'
import StyledSelect from '@/components/common/StyledSelect'
import { useResumeStore } from '@/store/resumeStore'
import { useAuthStore } from '@/store/authStore'
import { getAutoFixEnabled, setAutoFixEnabled } from '@/utils/textGuard'
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
import { aiApi, resumeApi } from '@/api'
import ThemeColorPicker from '@/components/common/ThemeColorPicker'
import TemplateSwitcher from '@/components/common/TemplateSwitcher'
import ModuleTitleStylePicker from '@/components/common/ModuleTitleStylePicker'
import TranslateDialog from '@/components/resume/TranslateDialog'

const FONT_OPTIONS = [
    { label: '思源黑体', value: 'Source Han Sans' },
    { label: '微软雅黑', value: 'Microsoft YaHei' },
    { label: '宋体', value: 'SimSun' },
    { label: '楷体', value: 'KaiTi' },
    // { label: 'Arial', value: 'Arial' },
    // { label: 'Times New Roman', value: 'Times New Roman' },
    // { label: '苹方', value: 'PingFang SC' },
    { label: '黑体', value: 'SimHei' },
]

interface RangeFieldProps {
    label: string
    value: number
    min: number
    max: number
    step?: number
    unit?: string
    onChange: (value: number) => void
}

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

const RangeField: React.FC<RangeFieldProps> = ({
    label,
    value,
    min,
    max,
    step = 1,
    unit = '',
    onChange,
}) => (
    <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-700">
            {label}（{value}{unit}）
        </label>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-primary"
        />
    </div>
)

// 可折叠分组
const CollapsibleSection: React.FC<{
    title: string
    defaultOpen?: boolean
    children: React.ReactNode
}> = ({ title, defaultOpen = false, children }) => {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <section className="border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center justify-between py-1 text-left"
            >
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{title}</span>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && <div className="mt-3 space-y-4">{children}</div>}
        </section>
    )
}

interface SettingsPanelProps {
    onClose: () => void
    initialAIConfig?: {
        provider: string
        baseUrl: string
        defaultModel: string
        hasApiKey?: boolean
    } | null
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose, initialAIConfig }) => {
    const { resume, setThemeColor, setTemplate, setStyleSettings, setLocale } = useResumeStore()
    const { styleSettings } = resume
    const { isAuthenticated } = useAuthStore()
    const [autoFixEnabled, setAutoFixEnabledState] = useState(getAutoFixEnabled())

    // 优先使用后端配置，否则使用本地配置
    const getInitialAIForm = (): AIConfigForm => {
        if (initialAIConfig) {
            return {
                providerPreset: initialAIConfig.provider as AIProviderPreset,
                baseUrl: initialAIConfig.baseUrl,
                model: initialAIConfig.defaultModel,
                apiKey: '', // API Key 不返回前端
            }
        }
        return createAIFormFromStorage()
    }

    const [aiForm, setAiForm] = useState<AIConfigForm>(getInitialAIForm)
    const [aiStatus, setAiStatus] = useState<string | null>(null)
    const [aiError, setAiError] = useState<string | null>(null)
    const [aiHasApiKey, setAiHasApiKey] = useState(() => initialAIConfig?.hasApiKey ?? false)

    // 简历解析配置
    const [parserForm, setParserForm] = useState({ provider: 'openai', model: '', apiKey: '', baseUrl: '' })
    const [parserStatus, setParserStatus] = useState<string | null>(null)
    const [parserError, setParserError] = useState<string | null>(null)
    const [parserHasApiKey, setParserHasApiKey] = useState(false)

    // 翻译弹窗
    const [showTranslateDialog, setShowTranslateDialog] = useState(false)

    // 加载简历解析配置
    useEffect(() => {
        if (!isAuthenticated) return
        aiApi.getParserConfig().then((cfg) => {
            setParserForm({
                provider: cfg.provider || 'openai',
                model: cfg.model || '',
                apiKey: '',
                baseUrl: cfg.baseUrl || '',
            })
            setParserHasApiKey(cfg.hasApiKey ?? false)
        }).catch(() => { })
    }, [isAuthenticated])

    const saveParserConfig = async () => {
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
    }

    useEffect(() => {
        if (!parserStatus) return
        const timer = window.setTimeout(() => setParserStatus(null), 2000)
        return () => window.clearTimeout(timer)
    }, [parserStatus])

    // initialAIConfig 变化时更新表单
    useEffect(() => {
        setAiForm(getInitialAIForm())
    }, [initialAIConfig])

    const updateAIForm = <K extends keyof AIConfigForm>(key: K, value: AIConfigForm[K]) => {
        setAiForm((prev) => ({ ...prev, [key]: value }))
    }

    const applyProviderPreset = (providerPreset: AIProviderPreset) => {
        const preset = getProviderPresetById(providerPreset)
        setAiForm((prev) => ({
            ...prev,
            providerPreset,
            baseUrl: preset.baseUrl ?? prev.baseUrl ?? '',
            model: prev.model || preset.modelPlaceholder,
        }))
    }

    const saveAIConfig = async () => {
        const baseUrl = aiForm.baseUrl?.trim() || ''
        const model = aiForm.model?.trim() || ''
        const apiKey = aiForm.apiKey?.trim() || ''

        // 验证
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

        // 保存到后端和本地偏好
        try {
            await aiApi.saveConfig({
                provider: aiForm.providerPreset,
                model: model,
                apiKey: apiKey || undefined, // 仅在用户输入新 key 时提交
                baseUrl: baseUrl || undefined,
            })
            // 本地偏好不再包含 apiKey，仅保存 provider/model/baseUrl
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
    }

    const clearAIConfig = () => {
        clearAIUserConfig()
        setAiForm(createAIFormFromStorage())
        setAiError(null)
        setAiStatus('本地偏好已清空（服务端密钥不受影响）')
    }

    useEffect(() => {
        if (!aiStatus) return
        const timer = window.setTimeout(() => setAiStatus(null), 2000)
        return () => window.clearTimeout(timer)
    }, [aiStatus])

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-800">简历设置</h4>
                <button
                    onClick={onClose}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* ========== 主题设置 ========== */}
            <CollapsibleSection title="主题设置" defaultOpen>
                {/* 模板 */}
                <TemplateSwitcher
                    value={resume.template}
                    locale={resume.locale}
                    onChange={setTemplate}
                />

                {/* 主题色 */}
                <ThemeColorPicker
                    value={resume.themeColor}
                    onChange={setThemeColor}
                />

                {/* 模块标题分隔线 + 左侧标记（可视化分段按钮） */}
                <ModuleTitleStylePicker
                    linePosition={styleSettings.moduleTitleLinePosition ?? 'left'}
                    markerStyle={styleSettings.moduleTitleMarkerStyle ?? 'bar'}
                    markerVisible={styleSettings.moduleTitleMarkerVisible !== false}
                    themeColor={resume.themeColor}
                    onChange={(next) => setStyleSettings(next)}
                />
            </CollapsibleSection>

            {/* ========== 排版设置 ========== */}
            <CollapsibleSection title="排版设置">

                {resume.template !== 'modern' && (
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-700">头像位置</label>
                        <StyledSelect
                            value={styleSettings.avatarPosition ?? 'right'}
                            onChange={(v) => setStyleSettings({ avatarPosition: v as 'center' | 'right' | 'left' })}
                            options={[
                                { label: '居右显示', value: 'right' },
                                { label: '居中显示', value: 'center' },
                                { label: '居左显示', value: 'left' },
                            ]}
                            size="compact"
                            className="mt-1"
                        />
                    </div>
                )}

                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">
                        内容字体（{FONT_OPTIONS.find((item) => item.value === styleSettings.fontFamily)?.label ?? styleSettings.fontFamily}）
                    </label>
                    <StyledSelect
                        value={styleSettings.fontFamily}
                        onChange={(v) => setStyleSettings({ fontFamily: v })}
                        options={FONT_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
                        size="compact"
                        className="mt-1"
                    />
                </div>

                <RangeField
                    label="内容字号"
                    value={styleSettings.fontSize}
                    min={8}
                    max={18}
                    unit="pt"
                    onChange={(value) => setStyleSettings({ fontSize: value })}
                />

                <div className="border-t border-gray-100 pt-3 space-y-3">
                    <p className="text-xs text-gray-400">模块标题字体设置</p>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-700">
                            标题字体（{FONT_OPTIONS.find((item) => item.value === (styleSettings.moduleTitleFontFamily ?? styleSettings.fontFamily))?.label ?? (styleSettings.moduleTitleFontFamily ?? styleSettings.fontFamily)}）
                        </label>
                        <StyledSelect
                            value={styleSettings.moduleTitleFontFamily ?? styleSettings.fontFamily}
                            onChange={(v) => setStyleSettings({ moduleTitleFontFamily: v })}
                            options={FONT_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
                            size="compact"
                            className="mt-1"
                        />
                    </div>

                    <RangeField
                        label="标题字号"
                        value={styleSettings.moduleTitleFontSize ?? styleSettings.fontSize + 2}
                        min={styleSettings.fontSize + 1}
                        max={22}
                        unit="pt"
                        onChange={(value) => setStyleSettings({ moduleTitleFontSize: value })}
                    />
                    <p className="text-[11px] text-gray-400">标题字号需比内容字号至少大 1pt</p>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">
                        正文颜色（{styleSettings.textColor}）
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            type="color"
                            value={styleSettings.textColor}
                            onChange={(e) => setStyleSettings({ textColor: e.target.value })}
                            className="w-10 h-9 p-1 border border-gray-200 rounded-md bg-white"
                        />
                        <input
                            type="text"
                            value={styleSettings.textColor}
                            onChange={(e) => setStyleSettings({ textColor: e.target.value })}
                            className="flex-1 px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                            placeholder="#363636"
                        />
                    </div>
                </div>

                <RangeField
                    label="行距"
                    value={styleSettings.lineHeight}
                    min={1}
                    max={2}
                    step={0.05}
                    onChange={(value) => setStyleSettings({ lineHeight: value })}
                />

                <RangeField
                    label="页面左右边距"
                    value={styleSettings.pagePaddingHorizontal}
                    min={10}
                    max={60}
                    unit="px"
                    onChange={(value) => setStyleSettings({ pagePaddingHorizontal: value })}
                />

                <RangeField
                    label="页面上下边距"
                    value={styleSettings.pagePaddingVertical}
                    min={10}
                    max={80}
                    unit="px"
                    onChange={(value) => setStyleSettings({ pagePaddingVertical: value })}
                />

                <RangeField
                    label="模块间距"
                    value={styleSettings.moduleSpacing}
                    min={0}
                    max={24}
                    unit="px"
                    onChange={(value) => setStyleSettings({ moduleSpacing: value })}
                />

                <RangeField
                    label="段落间距"
                    value={styleSettings.paragraphSpacing}
                    min={0}
                    max={12}
                    unit="px"
                    onChange={(value) => setStyleSettings({ paragraphSpacing: value })}
                />
            </CollapsibleSection>

            {/* ========== 语言与翻译 ========== */}
            <CollapsibleSection title="语言与翻译">

                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">模块标题语言</label>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setLocale('zh-CN')}
                            className={`flex-1 px-3 py-2 text-xs border rounded-lg transition-colors ${resume.locale === 'zh-CN'
                                ? 'border-primary bg-primary/5 text-primary font-medium'
                                : 'border-gray-200 text-gray-500 hover:border-gray-300'
                                }`}
                        >
                            中文
                        </button>
                        <button
                            type="button"
                            onClick={() => setLocale('en-US')}
                            className={`flex-1 px-3 py-2 text-xs border rounded-lg transition-colors ${resume.locale === 'en-US'
                                ? 'border-primary bg-primary/5 text-primary font-medium'
                                : 'border-gray-200 text-gray-500 hover:border-gray-300'
                                }`}
                        >
                            English
                        </button>
                    </div>
                    <p className="text-[12px] text-gray-400">
                        切换模块标题的语言显示，如「教育经历」↔「Education」
                    </p>
                </div>

                {isAuthenticated && (
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-700">多语言翻译</label>
                        <button
                            type="button"
                            onClick={() => setShowTranslateDialog(true)}
                            className="flex items-center gap-2 w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-colors"
                        >
                            <Globe className="w-4 h-4" />
                            <span>{resume.locale === 'en-US' ? '翻译为中文' : '翻译为英文'}</span>
                        </button>
                        <p className="text-[12px] text-gray-400">
                            AI 驱动翻译，生成一份新的简历副本，保留原排版。
                        </p>
                    </div>
                )}
            </CollapsibleSection>

            {/* ========== 输入辅助 ========== */}
            <CollapsibleSection title="输入辅助">
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">剪贴板异常字符</label>
                    <button
                        type="button"
                        onClick={() => {
                            const next = !autoFixEnabled
                            setAutoFixEnabledState(next)
                            setAutoFixEnabled(next)
                        }}
                        className={`flex items-center justify-between w-full px-3 py-2 text-xs border rounded-lg transition ${autoFixEnabled
                            ? 'border-primary/40 bg-primary/5 text-primary'
                            : 'border-gray-200 bg-white text-gray-600'
                            }`}
                    >
                        <span>{autoFixEnabled ? '自动修复已开启' : '仅提示（不自动修复）'}</span>
                        <span className={`inline-flex h-4 w-8 items-center rounded-full p-0.5 ${autoFixEnabled ? 'bg-primary' : 'bg-gray-300'}`}>
                            <span className={`h-3 w-3 rounded-full bg-white transition ${autoFixEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                        </span>
                    </button>
                    <p className="text-[12px] text-gray-400">
                        粘贴时检测康熙部首等异常字符，开启后会尝试标准化替换。
                    </p>
                </div>
            </CollapsibleSection>

            <CollapsibleSection title="AI 配置">
                <p className="text-xs text-gray-400">用于「ai评估润色、JD 匹配分析、求职信」功能</p>

                {!isAuthenticated ? (
                    <div className="flex items-center gap-2">
                        <p className="text-xs text-gray-500">请登录后配置 AI 设置</p>
                        <button
                            onClick={() => {
                                const currentPath = window.location.pathname
                                window.history.pushState({}, '', `/?login=1&return=${encodeURIComponent(currentPath)}`)
                                window.location.reload()
                            }}
                            className="rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90"
                        >
                            登录
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-gray-700">模型供应商</label>
                            <StyledSelect
                                value={aiForm.providerPreset}
                                onChange={(v) => applyProviderPreset(v as AIProviderPreset)}
                                options={AI_PROVIDER_PRESETS.map((p) => ({ label: p.label, value: p.id }))}
                                size="compact"
                                className="mt-1"
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
                                清除本地偏好
                            </button>
                        </div>

                        {aiError && (
                            <p className="text-xs text-red-600">{aiError}</p>
                        )}
                        {aiStatus && (
                            <p className="text-xs text-green-600">{aiStatus}</p>
                        )}
                    </>
                )}
            </CollapsibleSection>

            <CollapsibleSection title="简历解析配置">
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
                                <StyledSelect
                                    value={parserForm.provider}
                                    onChange={(v) => setParserForm((prev) => ({ ...prev, provider: v }))}
                                    options={[
                                        { label: 'OpenAI', value: 'openai' },
                                        { label: '豆包 (Doubao)', value: 'doubao' },
                                        { label: 'DeepSeek', value: 'deepseek' },
                                        { label: '智谱 (GLM)', value: 'zhipu' },
                                        { label: '通义千问', value: 'qwen' },
                                        { label: 'Moonshot', value: 'moonshot' },
                                        { label: '自定义', value: 'custom' },
                                    ]}
                                    size="compact"
                                    className="mt-1"
                                />
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

                            {parserError && (
                                <p className="text-xs text-red-600">{parserError}</p>
                            )}
                            {parserStatus && (
                                <p className="text-xs text-green-600">{parserStatus}</p>
                            )}
                        </>
                    )}
                </div>
            </CollapsibleSection>

            {/* 翻译弹窗 */}
            <TranslateDialog
                open={showTranslateDialog}
                onClose={() => setShowTranslateDialog(false)}
                sourceLocale={resume.locale || 'zh-CN'}
                resumeId={resume.id || ''}
                onCreated={(translateResult) => {
                    setShowTranslateDialog(false)
                    // 创建翻译后的简历副本
                    // 合并样式：保留原设置，仅覆盖建议的字体
                    const newStyleSettings = { ...resume.styleSettings }
                    if (translateResult.suggestedStyleSettings?.fontFamily) {
                        newStyleSettings.fontFamily = translateResult.suggestedStyleSettings.fontFamily
                        newStyleSettings.moduleTitleFontFamily = translateResult.suggestedStyleSettings.fontFamily
                    }
                    resumeApi.create({
                        title: translateResult.translatedTitle,
                        locale: translateResult.targetLocale,
                        template: resume.template,
                        themeColor: resume.themeColor,
                        styleSettings: newStyleSettings,
                        modules: translateResult.translatedModules,
                    }).then((newResume) => {
                        window.location.hash = `#/resume/${newResume.id}`
                    }).catch((err: Error) => {
                        console.error('创建翻译副本失败:', err)
                    })
                }}
            />
        </div>
    )
}

export default SettingsPanel
