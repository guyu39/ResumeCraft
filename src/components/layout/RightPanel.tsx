// ============================================================
// RightPanel — 右栏（步骤五/六/七：设置面板 + PDF 导出）
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Globe, Settings, Sparkles, X } from 'lucide-react'
import { useResumeStore, flushToCloud } from '@/store/resumeStore'
import { useAuthStore } from '@/store/authStore'
import { MODULE_META_LIST, ModuleType, type ModuleTitleMarkerStyle } from '@/types/resume'
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
    type ResumeEvaluateOutput,
} from '@/ai'
import { useSyncExport } from '@/hooks/useExportPDF'
import { useResumeEvaluation } from '@/hooks/useResumeEvaluation'
import { useJDMatch } from '@/hooks/useJDMatch'
import { useJDScore } from '@/hooks/useJDScore'
import { useCoverLetter } from '@/hooks/useCoverLetter'
import ResumeScoreDrawer from '@/components/layout/ai/ResumeScoreDrawer'
import JDMatchPanel from '@/components/layout/ai/JDMatchPanel'
import CoverLetterPanel from '@/components/layout/ai/CoverLetterPanel'
import { aiApi, resumeApi, ApiError, type JDMatchResponse, type JDScoreResponse, type CoverLetterResponse, type ConversationItem } from '@/api'

// 各模块表单
import PersonalForm from '@/components/resume/blocks/PersonalForm'
import EducationForm from '@/components/resume/blocks/EducationForm'
import WorkForm from '@/components/resume/blocks/WorkForm'
import ProjectForm from '@/components/resume/blocks/ProjectForm'
import SkillsForm from '@/components/resume/blocks/SkillsForm'
import AwardsForm from '@/components/resume/blocks/AwardsForm'
import SummaryForm from '@/components/resume/blocks/SummaryForm'
import CertificatesForm from '@/components/resume/blocks/CertificatesForm'
import PortfolioForm from '@/components/resume/blocks/PortfolioForm'
import LanguagesForm from '@/components/resume/blocks/LanguagesForm'
import CustomForm from '@/components/resume/blocks/CustomForm'
import AIEngineeringForm from '@/components/resume/blocks/AIEngineeringForm'
import NoticeCenter, { type NoticeItem } from '@/components/common/NoticeCenter'

// 设置面板组件
import ThemeColorPicker from '@/components/common/ThemeColorPicker'
import TemplateSwitcher from '@/components/common/TemplateSwitcher'
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

const MODULE_TITLE_MARKER_STYLE_OPTIONS: Array<{ label: string; value: ModuleTitleMarkerStyle }> = [
    { label: '竖线', value: 'bar' },
    { label: '圆角块', value: 'pill' },
    { label: '圆点', value: 'dot' },
    { label: '方块', value: 'square' },
    { label: '不显示', value: 'none' },
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

// ---------- 动态模块表单渲染 ----------
const renderModuleForm = (
    type: ModuleType,
    moduleId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any
): React.ReactNode => {
    switch (type) {
        case 'personal':
            return <PersonalForm moduleId={moduleId} data={data} />
        case 'education':
            return <EducationForm moduleId={moduleId} items={data.items} />
        case 'work':
            return <WorkForm moduleId={moduleId} items={data.items} />
        case 'project':
            return <ProjectForm moduleId={moduleId} items={data.items} />
        case 'skills':
            return <SkillsForm moduleId={moduleId} data={data} />
        case 'awards':
            return <AwardsForm moduleId={moduleId} items={data.items} />
        case 'summary':
            return <SummaryForm moduleId={moduleId} data={data} />
        case 'certificates':
            return <CertificatesForm moduleId={moduleId} items={data.items} />
        case 'portfolio':
            return <PortfolioForm moduleId={moduleId} items={data.items} />
        case 'languages':
            return <LanguagesForm moduleId={moduleId} items={data.items} />
        case 'ai-engineering':
            return <AIEngineeringForm moduleId={moduleId} data={data} />
        case 'custom':
            return <CustomForm moduleId={moduleId} data={data} />
        default:
            return (
                <div className="text-center py-8 text-gray-400 text-sm">
                    暂不支持此模块类型
                </div>
            )
    }
}

// ---------- 设置面板 ----------
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

            <TemplateSwitcher
                value={resume.template}
                locale={resume.locale}
                onChange={setTemplate}
            />

            {/* 模块标题语言 */}
            <div className="border-t border-gray-100 pt-4">
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
            </div>

            <div className="border-t border-gray-100 pt-4">
                <ThemeColorPicker
                    value={resume.themeColor}
                    onChange={setThemeColor}
                />
            </div>

            {/* 翻译简历 */}
            {isAuthenticated && (
                <div className="border-t border-gray-100 pt-4">
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
                </div>
            )}

            <div className="border-t border-gray-100 pt-4 space-y-4">
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

                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">
                        内容字体（{FONT_OPTIONS.find((item) => item.value === styleSettings.fontFamily)?.label ?? styleSettings.fontFamily}）
                    </label>
                    <select
                        value={styleSettings.fontFamily}
                        onChange={(e) => setStyleSettings({ fontFamily: e.target.value })}
                        className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                        {FONT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
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
                        <select
                            value={styleSettings.moduleTitleFontFamily ?? styleSettings.fontFamily}
                            onChange={(e) => setStyleSettings({ moduleTitleFontFamily: e.target.value })}
                            className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                            {FONT_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
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

                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">模块标题下划线</label>
                    <select
                        value={styleSettings.moduleTitleLinePosition ?? 'left'}
                        onChange={(e) => setStyleSettings({ moduleTitleLinePosition: e.target.value as 'left' | 'bottom' | 'none' })}
                        className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                        <option value="left">标题右侧</option>
                        <option value="bottom">标题下方</option>
                        <option value="none">不显示</option>
                    </select>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">标题左侧样式</label>
                    <select
                        value={styleSettings.moduleTitleMarkerVisible === false ? 'none' : (styleSettings.moduleTitleMarkerStyle ?? 'bar')}
                        onChange={(e) => {
                            const value = e.target.value as ModuleTitleMarkerStyle
                            setStyleSettings({
                                moduleTitleMarkerStyle: value,
                                moduleTitleMarkerVisible: value !== 'none',
                            })
                        }}
                        className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                        {MODULE_TITLE_MARKER_STYLE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-3">
                <h5 className="text-sm font-semibold text-gray-800">AI 配置</h5>
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
                            <select
                                value={aiForm.providerPreset}
                                onChange={(e) => applyProviderPreset(e.target.value as AIProviderPreset)}
                                className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                            >
                                {AI_PROVIDER_PRESETS.map((preset) => (
                                    <option key={preset.id} value={preset.id}>{preset.label}</option>
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
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-3">
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

                            {parserError && (
                                <p className="text-xs text-red-600">{parserError}</p>
                            )}
                            {parserStatus && (
                                <p className="text-xs text-green-600">{parserStatus}</p>
                            )}
                        </>
                    )}
                </div>
            </div>

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

// ---------- 右栏主组件 ----------
const RightPanel: React.FC = () => {
    const { resume, activeModuleId, setActiveModule, activeSnapshotId, triggerSnapshotRefresh, setBasedOnSnapshotId } = useResumeStore()
    const { isAuthenticated } = useAuthStore()
    const formRef = useRef<HTMLDivElement>(null)
    const [showSettings, setShowSettings] = useState(false)
    const [showSnapshotDialog, setShowSnapshotDialog] = useState(false)
    const [snapshotLabel, setSnapshotLabel] = useState('')
    const [snapshotSaving, setSnapshotSaving] = useState(false)
    const [snapshotError, setSnapshotError] = useState('')
    const [showAIEvaluation, setShowAIEvaluation] = useState(false)

    const handleCreateSnapshot = async () => {
        if (!snapshotLabel.trim() || snapshotSaving) return
        setSnapshotSaving(true)
        setSnapshotError('')
        try {
            const resp = await resumeApi.createSnapshot(resume.id, snapshotLabel.trim())
            setShowSnapshotDialog(false)
            setSnapshotLabel('')
            // 清除当前快照的本地草稿（编辑已固化为新快照，草稿不再需要）
            if (activeSnapshotId) {
                try { localStorage.removeItem(`resumecraft_snapshot_draft_${activeSnapshotId}`) } catch { /* ignore */ }
            }
            // 创建快照成功后，设置 basedOnSnapshotId 指向新快照
            if (resp?.id) {
                setBasedOnSnapshotId(resp.id)
            }
            triggerSnapshotRefresh()
        } catch (error) {
            const message = error instanceof ApiError ? error.message : '保存失败'
            const normalized = message.toLowerCase()
            if (normalized.includes('label already exists')) {
                setSnapshotError('标签已存在，请换一个')
            } else {
                setSnapshotError(message)
            }
        } finally {
            setSnapshotSaving(false)
        }
    }

    // 收集所有模块的日期范围校验错误
    const dateErrors = useMemo(() => {
        const result: { moduleId: string; moduleTitle: string; itemIndexes: number[] }[] = []
        for (const mod of resume.modules) {
            if (mod.type !== 'education' && mod.type !== 'work' && mod.type !== 'project') continue
            const items = (mod.data as { items?: Array<{ startDate?: string; endDate?: string }> }).items
            if (!items) continue
            const badIndexes: number[] = []
            items.forEach((item, i) => {
                if (item.startDate && item.endDate && item.endDate !== '至今' && item.startDate > item.endDate) {
                    badIndexes.push(i)
                }
            })
            if (badIndexes.length > 0) {
                result.push({ moduleId: mod.id, moduleTitle: mod.title, itemIndexes: badIndexes })
            }
        }
        return result
    }, [resume.modules])

    const hasDateErrors = dateErrors.length > 0
    const [activeAITool, setActiveAITool] = useState<'evaluate' | 'jd_match' | 'cover_letter'>('evaluate')
    const [aiConfigFromServer, setAiConfigFromServer] = useState<{
        provider: string
        baseUrl: string
        defaultModel: string
        hasApiKey?: boolean
    } | null>(null)
    const [restoredEvaluation, setRestoredEvaluation] = useState<ResumeEvaluateOutput | null>(null)
    const [initialEvaluation, setInitialEvaluation] = useState<ResumeEvaluateOutput | null>(null)
    const [restoredJDMatch, setRestoredJDMatch] = useState<JDMatchResponse | null>(null)
    const [restoredJDScore, setRestoredJDScore] = useState<JDScoreResponse | null>(null)
    // 预取的对话历史列表（消除"查看历史"延迟）
    const [preloadedEvalHistory, setPreloadedEvalHistory] = useState<ConversationItem[]>([])
    const [preloadedJDHistory, setPreloadedJDHistory] = useState<ConversationItem[]>([])
    const [restoredCoverLetter, setRestoredCoverLetter] = useState<CoverLetterResponse | null>(null)
    const { exportPDF, exporting, error: exportError } = useSyncExport()
    const {
        loading: evaluating,
        streamDone: evaluateStreamDone,
        error: evaluateError,
        result: evaluateResult,
        streamText: evaluateStreamText,
        modelName: evaluateModelName,
        lastEvaluatedAt,
        evaluatedResumeUpdatedAt,
        runEvaluate,
        mode: evaluateMode,
    } = useResumeEvaluation()
    const {
        loading: jdMatching,
        error: jdMatchError,
        result: jdMatchResult,
        modelName: jdMatchModelName,
        lastMatchedAt,
        runMatch,
        resetMatch,
    } = useJDMatch()
    const {
        loading: jdScoring,
        error: jdScoreError,
        result: jdScoreResult,
        lastScoredAt,
        runScore,
        resetScore,
    } = useJDScore()
    const {
        loading: generatingCoverLetter,
        error: coverLetterError,
        result: coverLetterResult,
        lastGeneratedAt,
        generateCoverLetter,
        resetCoverLetter,
    } = useCoverLetter()

    // 组件挂载时从后端加载 AI 配置（按用户 ID，不依赖是否打开设置）
    useEffect(() => {
        if (!isAuthenticated) {
            setAiConfigFromServer(null)
            return
        }
        aiApi.getConfig().then((config) => {
            setAiConfigFromServer({
                provider: config.provider,
                baseUrl: config.baseUrl,
                defaultModel: config.defaultModel,
                hasApiKey: config.hasApiKey,
            })
        }).catch(() => {
            // 未配置时静默忽略
        })
    }, [isAuthenticated])

    // 进入评估面板时：加载当前快照对应的最新评估历史
    useEffect(() => {
        if (!showAIEvaluation) {
            setInitialEvaluation(null)
            return
        }
        if (!isAuthenticated) {
            return
        }
        const loadLatest = async () => {
            try {
                // 加载更多条，然后客户端按快照过滤
                const res = await aiApi.getConversations({ type: 'evaluate', resumeId: resume.id, pageSize: 10 })
                const items = res.items || []
                // 保存预取列表供 Drawer 使用（消除"查看历史"延迟）
                setPreloadedEvalHistory(items.slice(0, 5))
                if (items.length > 0) {
                    const detail = await aiApi.getConversation(items[0].id)
                    if (detail.context) {
                        const ctx = detail.context as {
                            overallScore?: number; level?: string; summary?: string
                            dimensions?: unknown[]; issues?: unknown[]; actionItems?: string[]; model?: string
                        }
                        if (ctx.overallScore !== undefined) {
                            setInitialEvaluation({
                                overallScore: ctx.overallScore,
                                level: ctx.level ?? 'C',
                                summary: ctx.summary ?? '',
                                dimensions: (ctx.dimensions ?? []) as ResumeEvaluateOutput['dimensions'],
                                issues: (ctx.issues ?? []) as ResumeEvaluateOutput['issues'],
                                actionItems: ctx.actionItems ?? [],
                                model: ctx.model,
                            })
                            return
                        }
                    }
                } else {
                    // 当前快照下无评估记录，清空显示
                    setInitialEvaluation(null)
                }
            } catch (err) {
                console.error('Failed to load initial evaluation:', err)
            }
        }
        loadLatest()
    }, [showAIEvaluation, isAuthenticated, resume.id])


    // initialEvaluation 就绪后同步到 restoredEvaluation 供 Drawer 显示
    useEffect(() => {
        if (initialEvaluation) {
            setRestoredEvaluation(initialEvaluation)
        }
    }, [initialEvaluation])

    // 切换 AI 工具标签时：加载当前快照对应的 JD 匹配 / 求职信历史
    useEffect(() => {
        if (!showAIEvaluation || !isAuthenticated) return
        if (activeAITool === 'jd_match') {
            setRestoredJDMatch(null)
            aiApi.getConversations({ type: 'jd_match', resumeId: resume.id, pageSize: 10 }).then((res) => {
                const items = res.items || []
                // 保存预取列表供面板使用
                setPreloadedJDHistory(items.slice(0, 5))
                if (items.length > 0) {
                    return aiApi.getConversation(items[0].id)
                }
                return null
            }).then((detail) => {
                if (detail?.context) {
                    const ctx = detail.context as Record<string, unknown>
                    if (ctx.matchScore !== undefined) {
                        setRestoredJDMatch(ctx as unknown as JDMatchResponse)
                    }
                } else {
                    setRestoredJDMatch(null)
                }
            }).catch(() => { })
        } else if (activeAITool === 'cover_letter') {
            setRestoredCoverLetter(null)
            aiApi.getConversations({ type: 'cover_letter', resumeId: resume.id, pageSize: 10 }).then((res) => {
                const items = res.items || []
                if (items.length > 0) {
                    return aiApi.getConversation(items[0].id)
                }
                return null
            }).then((detail) => {
                if (detail?.context) {
                    const ctx = detail.context as Record<string, unknown>
                    if (ctx.coverLetter !== undefined) {
                        setRestoredCoverLetter(ctx as unknown as CoverLetterResponse)
                    }
                }
            }).catch(() => { })
        }
    }, [showAIEvaluation, activeAITool, isAuthenticated, resume.id])

    // 打开 AI 评估时也从后端加载 AI 配置（用于模型名称显示）
    useEffect(() => {
        if (!showAIEvaluation || !isAuthenticated) {
            return
        }
        aiApi.getConfig().then((config) => {
            setAiConfigFromServer({
                provider: config.provider,
                baseUrl: config.baseUrl,
                defaultModel: config.defaultModel,
                hasApiKey: config.hasApiKey,
            })
        }).catch(() => {
            // ignore error
        })
    }, [showAIEvaluation, isAuthenticated])

    const activeModule = resume.modules.find((m) => m.id === activeModuleId) ?? null
    const aiModeLabel = (() => {
        if (!isAuthenticated) {
            return '未登录或登录已过期'
        }
        if (evaluateMode !== 'openai-compatible') {
            return '未接入AI'
        }
        // 优先从本地缓存读取模型名称
        const userConfig = readAIUserConfig()
        if (userConfig?.model) {
            return userConfig.model
        }
        // 本地缓存为空时，从服务器配置读取
        if (aiConfigFromServer?.defaultModel) {
            return aiConfigFromServer.defaultModel
        }
        return '未配置AI'
    })()

    const activeModuleTitle =
        activeModule?.type === 'custom' && activeModule.title.startsWith('自定义-')
            ? activeModule.title.replace(/^自定义-/, '') || '自定义模块'
            : activeModule?.title
    const moduleMeta = activeModule
        ? MODULE_META_LIST.find((m) => m.type === activeModule.type)
        : null

    // 切换模块时滚动到顶部
    useEffect(() => {
        formRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }, [activeModuleId])

    // ---------- PDF 导出 ----------
    const handleExport = async () => {
        // 导出前先落库
        await flushToCloud()
        try {
            await exportPDF('resume-paper-export', resume.title)
        } catch {
            // 错误已由 hook 内部处理
        }
    }

    // ---------- AI 综合评估 ----------
    const handleRetryEvaluate = async () => {
        await flushToCloud()
        await runEvaluate(resume, activeSnapshotId)
    }

    const handleReevaluate = async () => {
        // 清除历史选择，直接运行新的评估
        setRestoredEvaluation(null)
        await flushToCloud()
        await runEvaluate(resume, activeSnapshotId)
    }

    const handleJumpToIssueModule = (moduleType: ModuleType) => {
        const targetModule = resume.modules.find((module) => module.type === moduleType)
        if (!targetModule) return
        setActiveModule(targetModule.id)
        setShowSettings(false)
        setShowAIEvaluation(false)
    }

    const handleRunJDMatch = async (form: { jdText: string; targetTitle?: string; companyName?: string }) => {
        setRestoredJDMatch(null)
        setRestoredJDScore(null)
        await flushToCloud()
        await runMatch(resume, form, activeSnapshotId)
    }

    const handleRestoreJDMatch = (result: JDMatchResponse) => {
        setRestoredJDMatch(result)
        setRestoredJDScore(null)
    }

    const handleRunJDScore = async (form: { jdText: string; targetTitle?: string; companyName?: string }) => {
        setRestoredJDMatch(null)
        setRestoredJDScore(null)
        await flushToCloud()
        await runScore(resume, form, activeSnapshotId)
    }

    const handleRestoreJDScore = (result: JDScoreResponse) => {
        setRestoredJDScore(result)
        setRestoredJDMatch(null)
    }

    const handleGenerateCoverLetter = async (form: { jdText?: string; jobTitle: string; companyName?: string; tone?: string; language?: string }) => {
        setRestoredCoverLetter(null)
        await flushToCloud()
        await generateCoverLetter(resume, form, activeSnapshotId)
    }

    const handleConversationSelect = useCallback(async (conversationId: string) => {
        try {
            const detail = await aiApi.getConversation(conversationId)
            if (detail.context) {
                const ctx = detail.context as {
                    overallScore?: number
                    level?: string
                    summary?: string
                    dimensions?: unknown[]
                    issues?: unknown[]
                    actionItems?: string[]
                    model?: string
                }
                if (ctx.overallScore !== undefined) {
                    setRestoredEvaluation({
                        overallScore: ctx.overallScore,
                        level: ctx.level ?? 'C',
                        summary: ctx.summary ?? '',
                        dimensions: (ctx.dimensions ?? []) as ResumeEvaluateOutput['dimensions'],
                        issues: (ctx.issues ?? []) as ResumeEvaluateOutput['issues'],
                        actionItems: ctx.actionItems ?? [],
                        model: ctx.model,
                    })
                    setShowAIEvaluation(true)
                }
            }
        } catch (err) {
            console.error('Failed to load conversation:', err)
        }
    }, [])

    const 编辑提醒 = useMemo<NoticeItem[]>(() => {
        const notices: NoticeItem[] = []

        if (exportError) {
            notices.push({
                id: 'export-error',
                tone: 'error',
                title: 'PDF 导出失败',
                description: exportError,
            })
        }

        return notices
    }, [exportError])

    return (
        <div className="flex flex-col h-full">
            {/* 顶部操作栏 */}
            <div className="flex-shrink-0 border-b border-slate-200/70 bg-white/80 px-4 py-3 backdrop-blur">
                <div className="flex flex-wrap items-center justify-end gap-2">
                    {/* 保存按钮 */}
                {resume.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resume.id) && (
                    <button
                        onClick={() => setShowSnapshotDialog(true)}
                        className="flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white/85 px-3.5 py-2 text-sm text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800"
                        title="新建简历版本 · 记录当前版本以便对比和回溯"
                    >

                        <span className="truncate">新建版本</span>
                    </button>
                )}

                {/* 设置按钮 */}
                <button
                    onClick={() => {
                        setShowSettings((v) => !v)
                        setShowAIEvaluation(false)
                    }}
                    className={`
            flex flex-shrink items-center justify-center rounded-xl border px-2.5 py-2 text-sm shadow-sm transition-colors
            ${showSettings
                            ? 'border-primary/30 bg-primary/10 text-primary'
                            : 'border-slate-200 bg-white/85 text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                        }
          `}
                    title="简历设置 · 如遇内容被切割可调整间距"
                    aria-label="简历设置"
                >
                    <span className="truncate">设置</span>
                    <Settings className="w-3.5 h-3.5 flex-shrink-0" />
                </button>

                <button
                    onClick={() => {
                        if (hasDateErrors) return
                        if (!isAuthenticated) {
                            const currentPath = window.location.pathname
                            window.history.pushState({}, '', `/?login=1&return=${encodeURIComponent(currentPath)}`)
                            window.location.reload()
                            return
                        }
                        if (showAIEvaluation) {
                            setShowAIEvaluation(false)
                        } else {
                            setShowSettings(false)
                            setShowAIEvaluation(true)
                        }
                    }}
                    disabled={hasDateErrors}
                    title={hasDateErrors ? '请先修正日期范围错误' : undefined}
                    className={`flex min-w-0 flex-shrink items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm shadow-sm transition-colors ${hasDateErrors
                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                        : 'border-slate-200 bg-white/85 text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                        }`}
                >
                    <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{showAIEvaluation ? '返回编辑' : evaluating ? '评估中...' : 'AI评估'}</span>
                </button>

                {/* <button
                    onClick={handlePreview}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-800 transition-colors flex-shrink min-w-0"
                >
                    <Eye className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">预览</span>
                </button> */}

                <button
                    onClick={handleExport}
                    disabled={exporting || hasDateErrors}
                    title={hasDateErrors ? '请先修正日期范围错误' : undefined}
                    className={`flex min-w-0 flex-shrink items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm transition-colors ${hasDateErrors
                        ? 'cursor-not-allowed bg-slate-300 text-slate-500'
                        : 'bg-primary text-white shadow-[0_10px_20px_rgba(37,99,235,0.24)] hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60'
                        }`}
                >
                    <Download className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{exporting ? '导出中...' : '导出PDF'}</span>
                </button>
                </div>
                {编辑提醒.length > 0 && (
                    <NoticeCenter items={编辑提醒.slice(0, 1)} compact className="mt-2" />
                )}
            </div>

            {showSettings ? (
                <div className="flex-1 overflow-y-auto bg-gray-50/70 px-4 py-4 no-scrollbar">
                    <div className="max-w-[96%] mx-auto">
                        <SettingsPanel onClose={() => setShowSettings(false)} initialAIConfig={aiConfigFromServer ?? null} />
                    </div>
                </div>
            ) : showAIEvaluation ? (
                <div className="flex-1 overflow-hidden bg-white">
                    <div className="flex h-full flex-col">
                        <div className="flex-shrink-0 border-b border-gray-100 bg-white px-4 py-3">
                            <div className="grid grid-cols-3 gap-2 rounded-xl bg-gray-100 p-1 text-sm">
                                <button
                                    type="button"
                                    onClick={() => setActiveAITool('evaluate')}
                                    className={`rounded-lg px-3 py-2 transition-colors ${activeAITool === 'evaluate' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    简历评估
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveAITool('jd_match')}
                                    className={`rounded-lg px-3 py-2 transition-colors ${activeAITool === 'jd_match' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    JD 匹配
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveAITool('cover_letter')}
                                    className={`rounded-lg px-3 py-2 transition-colors ${activeAITool === 'cover_letter' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    求职信
                                </button>
                            </div>
                        </div>
                        <div className="min-h-0 flex-1 overflow-hidden">
                            {activeAITool === 'evaluate' && (
                                <ResumeScoreDrawer
                                    embedded
                                    open={showAIEvaluation}
                                    result={evaluateResult}
                                    restoredResult={restoredEvaluation}
                                    preloadedHistory={preloadedEvalHistory}
                                    loading={evaluating}
                                    streamDone={evaluateStreamDone}
                                    error={evaluateError}
                                    streamText={evaluateStreamText}
                                    modelName={evaluateModelName}
                                    currentResumeUpdatedAt={resume.updatedAt}
                                    evaluatedResumeUpdatedAt={evaluatedResumeUpdatedAt}
                                    lastEvaluatedAt={lastEvaluatedAt}
                                    modeLabel={aiModeLabel}
                                    isAuthenticated={isAuthenticated}
                                    resumeId={resume.id}
                                    onReevaluate={handleReevaluate}
                                    onRetry={handleRetryEvaluate}
                                    onJumpToModule={handleJumpToIssueModule}
                                    onConversationSelect={handleConversationSelect}
                                />
                            )}
                            {activeAITool === 'jd_match' && (
                                <JDMatchPanel
                                    resume={resume}
                                    preloadedHistory={preloadedJDHistory}
                                    loading={jdMatching}
                                    scoreLoading={jdScoring}
                                    error={jdMatchError}
                                    scoreError={jdScoreError}
                                    result={jdMatchResult}
                                    scoreResult={jdScoreResult}
                                    restoredResult={restoredJDMatch}
                                    restoredScoreResult={restoredJDScore}
                                    modelName={jdMatchModelName}
                                    lastMatchedAt={lastMatchedAt}
                                    lastScoredAt={lastScoredAt}
                                    onRunMatch={handleRunJDMatch}
                                    onRunScore={handleRunJDScore}
                                    onReset={resetMatch}
                                    onResetScore={resetScore}
                                    onRestoreHistory={handleRestoreJDMatch}
                                    onRestoreScoreHistory={handleRestoreJDScore}
                                />
                            )}
                            {activeAITool === 'cover_letter' && (
                                <CoverLetterPanel
                                    loading={generatingCoverLetter}
                                    error={coverLetterError}
                                    result={coverLetterResult}
                                    restoredResult={restoredCoverLetter}
                                    lastGeneratedAt={lastGeneratedAt}
                                    onGenerate={handleGenerateCoverLetter}
                                    onReset={resetCoverLetter}
                                />
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    {/* 当前模块标题 */}
                    <div className="flex-shrink-0 px-5 py-3 border-b border-gray-100 bg-white">
                        {activeModule && moduleMeta ? (
                            <div className="flex items-center gap-2">
                                <span className="text-xl">{moduleMeta.icon}</span>
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-800">
                                        {activeModuleTitle}
                                    </h3>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {activeModule.type === 'personal'
                                            ? '建议完善个人信息，提升简历完整度'
                                            : '填写完成后将实时显示在简历中'}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-400">请从左侧选择一个模块</p>
                        )}
                    </div>

                    {/* 表单编辑区 */}
                    <div
                        ref={formRef}
                        className="flex-1 overflow-y-auto no-scrollbar px-5 py-4 editor-form-shell"
                    >
                        {activeModule ? (
                            <div className="pb-8" key={activeModule.id}>
                                {renderModuleForm(
                                    activeModule.type,
                                    activeModule.id,
                                    activeModule.data as Parameters<typeof renderModuleForm>[2]
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
                                <span className="text-5xl">👈</span>
                                <p className="text-gray-400 text-sm">点击左侧模块开始编辑</p>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* 保存对话框 */}
            {showSnapshotDialog && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30" onClick={() => { setShowSnapshotDialog(false); setSnapshotLabel(''); setSnapshotError('') }}>
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-[380px]" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-base font-semibold text-slate-800 mb-4">新建简历版本</h3>
                        <label className="block text-sm text-slate-600 mb-2">快照标签</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="如：投腾讯云版、定稿v1"
                            value={snapshotLabel}
                            onChange={(e) => {
                                setSnapshotLabel(e.target.value)
                                if (snapshotError) setSnapshotError('')
                            }}
                            maxLength={100}
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    handleCreateSnapshot()
                                }
                                if (e.key === 'Escape') { setShowSnapshotDialog(false); setSnapshotLabel(''); setSnapshotError('') }
                            }}
                        />
                        {snapshotError && (
                            <p className="mt-2 text-xs text-rose-600">{snapshotError}</p>
                        )}
                        <p className="mt-2 text-xs text-slate-400">
                            💡 建议：为不同岗位投递的简历版本添加标签，方便后续快速切换和对比
                        </p>
                        <div className="flex justify-end gap-3 mt-5">
                            <button className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                                onClick={() => { setShowSnapshotDialog(false); setSnapshotLabel(''); setSnapshotError('') }}>
                                取消
                            </button>
                            <button className="px-4 py-2 text-sm font-medium text-white bg-[#1A56DB] hover:bg-blue-700 rounded-lg disabled:opacity-50"
                                disabled={!snapshotLabel.trim() || snapshotSaving}
                                onClick={handleCreateSnapshot}
                            >
                                {snapshotSaving ? '保存中...' : '保存'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default RightPanel
