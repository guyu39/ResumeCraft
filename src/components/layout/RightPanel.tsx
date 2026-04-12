// ============================================================
// RightPanel — 右栏（步骤五/六/七：设置面板 + PDF 导出）
// ============================================================

import React, { useEffect, useRef, useState } from 'react'
import { Eye, Download, Settings, Sparkles, X } from 'lucide-react'
import { useResumeStore } from '@/store/resumeStore'
import { MODULE_META_LIST, ModuleType } from '@/types/resume'
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
import { useExportPDF } from '@/hooks/useExportPDF'
import { useResumeEvaluation } from '@/hooks/useResumeEvaluation'
import ResumeScoreDrawer from '@/components/layout/ai/ResumeScoreDrawer'

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

// 设置面板组件
import ThemeColorPicker from '@/components/common/ThemeColorPicker'
import TemplateSwitcher from '@/components/common/TemplateSwitcher'
import IndustryPresetPicker from '@/components/common/IndustryPresetPicker'

const FONT_OPTIONS = [
    { label: '思源黑体', value: 'Source Han Sans' },
    { label: '微软雅黑', value: 'Microsoft YaHei' },
    { label: '宋体', value: 'SimSun' },
    { label: '楷体', value: 'KaiTi' },
    { label: 'Arial', value: 'Arial' },
    { label: 'Times New Roman', value: 'Times New Roman' },
    { label: '苹方', value: 'PingFang SC' },
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
    evaluateModel: string
    apiKey: string
    timeoutMs: string
    evaluateTimeoutMs: string
}

const createAIFormFromStorage = (): AIConfigForm => {
    const stored = readAIUserConfig()
    const providerPreset = stored?.providerPreset ?? 'doubao'
    const preset = getProviderPresetById(providerPreset)
    return {
        providerPreset,
        baseUrl: stored?.baseUrl ?? preset.baseUrl,
        model: stored?.model ?? '',
        evaluateModel: stored?.evaluateModel ?? '',
        apiKey: stored?.apiKey ?? '',
        timeoutMs: String(stored?.timeoutMs ?? 45000),
        evaluateTimeoutMs: String(stored?.evaluateTimeoutMs ?? 90000),
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
const SettingsPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { resume, setThemeColor, setTemplate, setStyleSettings, applyIndustryPreset } = useResumeStore()
    const { styleSettings } = resume
    const [aiForm, setAiForm] = useState<AIConfigForm>(createAIFormFromStorage)
    const [aiStatus, setAiStatus] = useState<string | null>(null)
    const [aiError, setAiError] = useState<string | null>(null)

    const updateAIForm = <K extends keyof AIConfigForm>(key: K, value: AIConfigForm[K]) => {
        setAiForm((prev) => ({ ...prev, [key]: value }))
    }

    const applyProviderPreset = (providerPreset: AIProviderPreset) => {
        const preset = getProviderPresetById(providerPreset)
        setAiForm((prev) => ({
            ...prev,
            providerPreset,
            baseUrl: preset.baseUrl || prev.baseUrl,
            model: prev.model || preset.modelPlaceholder,
            evaluateModel: prev.evaluateModel || preset.evaluateModelPlaceholder || '',
        }))
    }

    const saveAIConfig = () => {
        const payload = {
            providerPreset: aiForm.providerPreset,
            mode: 'openai-compatible' as const,
            baseUrl: aiForm.baseUrl.trim() || undefined,
            model: aiForm.model.trim() || undefined,
            evaluateModel: aiForm.evaluateModel.trim() || undefined,
            apiKey: aiForm.apiKey.trim() || undefined,
            timeoutMs: Number(aiForm.timeoutMs || 0),
            evaluateTimeoutMs: Number(aiForm.evaluateTimeoutMs || 0),
        }

        const errors = validateAIConfig(resolveAIConfig(toAIConfigOverride(payload)))
        if (errors.length > 0) {
            setAiError(errors.join('；'))
            setAiStatus(null)
            return
        }

        saveAIUserConfig(payload)
        setAiError(null)
        setAiStatus('AI 配置已保存')
    }

    const clearAIConfig = () => {
        clearAIUserConfig()
        setAiForm(createAIFormFromStorage())
        setAiError(null)
        setAiStatus('AI 配置已清空')
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

            <div className="border-t border-gray-100 pt-4">
                <IndustryPresetPicker onApply={applyIndustryPreset} />
            </div>

            <div className="border-t border-gray-100 pt-4">
                <ThemeColorPicker
                    value={resume.themeColor}
                    onChange={setThemeColor}
                />
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-4">
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">
                        字体（{FONT_OPTIONS.find((item) => item.value === styleSettings.fontFamily)?.label ?? styleSettings.fontFamily}）
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
                    label="字号"
                    value={styleSettings.fontSize}
                    min={8}
                    max={18}
                    unit="pt"
                    onChange={(value) => setStyleSettings({ fontSize: value })}
                />

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
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-3">
                <h5 className="text-sm font-semibold text-gray-800">AI 接入配置</h5>

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

                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">Base URL</label>
                    <input
                        value={aiForm.baseUrl}
                        onChange={(e) => updateAIForm('baseUrl', e.target.value)}
                        className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="/api/ark 或 https://api.deepseek.com/v1"
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">建议模型</label>
                    <input
                        value={aiForm.model}
                        onChange={(e) => updateAIForm('model', e.target.value)}
                        className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder={getProviderPresetById(aiForm.providerPreset).modelPlaceholder}
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">评估模型（可选）</label>
                    <input
                        value={aiForm.evaluateModel}
                        onChange={(e) => updateAIForm('evaluateModel', e.target.value)}
                        className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder={getProviderPresetById(aiForm.providerPreset).evaluateModelPlaceholder || '留空则复用建议模型'}
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">API Key</label>
                    <input
                        type="password"
                        value={aiForm.apiKey}
                        onChange={(e) => updateAIForm('apiKey', e.target.value)}
                        className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="输入可用 API Key"
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-700">建议超时(ms)</label>
                        <input
                            type="number"
                            value={aiForm.timeoutMs}
                            onChange={(e) => updateAIForm('timeoutMs', e.target.value)}
                            className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-700">评估超时(ms)</label>
                        <input
                            type="number"
                            value={aiForm.evaluateTimeoutMs}
                            onChange={(e) => updateAIForm('evaluateTimeoutMs', e.target.value)}
                            className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                    </div>
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

                {aiError && (
                    <p className="text-xs text-red-600">{aiError}</p>
                )}
                {aiStatus && (
                    <p className="text-xs text-green-600">{aiStatus}</p>
                )}
            </div>
        </div>
    )
}

// ---------- 右栏主组件 ----------
const RightPanel: React.FC = () => {
    const { resume, activeModuleId, lastSavedAt, setActiveModule } = useResumeStore()
    const formRef = useRef<HTMLDivElement>(null)
    const [showSaved, setShowSaved] = useState(false)
    const [showSettings, setShowSettings] = useState(false)
    const [showAIEvaluation, setShowAIEvaluation] = useState(false)
    const { exportPDF, exporting, error: exportError } = useExportPDF()
    const {
        loading: evaluating,
        error: evaluateError,
        result: evaluateResult,
        streamText: evaluateStreamText,
        hasResult: hasEvaluateResult,
        lastEvaluatedAt,
        evaluatedResumeUpdatedAt,
        runEvaluate,
        mode: evaluateMode,
    } = useResumeEvaluation()

    const activeModule = resume.modules.find((m) => m.id === activeModuleId) ?? null
    const aiModeLabel = (() => {
        if (evaluateMode !== 'openai-compatible') {
            return '未接入AI'
        }

        const userConfig = readAIUserConfig()
        if (!userConfig?.providerPreset) {
            return '已接入AI'
        }

        const presetId = getProviderPresetById(userConfig.providerPreset).id
        return `已接入${presetId}`
    })()

    const activeModuleTitle =
        activeModule?.type === 'custom' && activeModule.title.startsWith('自定义-')
            ? activeModule.title.replace(/^自定义-/, '') || '自定义模块'
            : activeModule?.title
    const moduleMeta = activeModule
        ? MODULE_META_LIST.find((m) => m.type === activeModule.type)
        : null

    // 保存提示（显示 2 秒后自动消失）
    useEffect(() => {
        if (!lastSavedAt) return

        setShowSaved(true)
        const timer = window.setTimeout(() => setShowSaved(false), 2000)
        return () => window.clearTimeout(timer)
    }, [lastSavedAt])

    // 切换模块时滚动到顶部
    useEffect(() => {
        formRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }, [activeModuleId])

    // ---------- PDF 导出 ----------
    const handleExport = async () => {
        try {
            await exportPDF('resume-paper-export', resume)
        } catch {
            // 错误已由 hook 内部处理
        }
    }

    // ---------- 预览（全屏打印视图） ----------
    const handlePreview = () => {
        window.open('/preview', '_blank', 'noopener,noreferrer')
    }

    // ---------- AI 综合评估 ----------
    const handleEvaluateResume = async () => {
        setShowAIEvaluation(true)
        if (!hasEvaluateResult) {
            await runEvaluate(resume)
        }
    }

    const handleRetryEvaluate = async () => {
        await runEvaluate(resume, { force: true })
    }

    const handleReevaluate = async () => {
        setShowAIEvaluation(true)
        await runEvaluate(resume, { force: true })
    }

    const handleJumpToIssueModule = (moduleType: ModuleType) => {
        const targetModule = resume.modules.find((module) => module.type === moduleType)
        if (!targetModule) return
        setActiveModule(targetModule.id)
        setShowSettings(false)
        setShowAIEvaluation(false)
    }

    return (
        <div className="flex flex-col h-full">
            {/* 顶部操作栏 */}
            <div className="relative flex-shrink-0 flex items-center justify-end gap-2 px-4 py-3 border-b border-gray-100 bg-white z-10">
                {/* 自动保存状态（固定在顶部左侧，不占按钮布局） */}
                {showSaved && (
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-700 animate-fade-in">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        已保存
                    </div>
                )}

                {/* 设置按钮 */}
                <button
                    onClick={() => {
                        setShowSettings((v) => !v)
                        setShowAIEvaluation(false)
                    }}
                    className={`
            flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg transition-colors
            ${showSettings
                            ? 'border-primary text-primary bg-primary/5'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                        }
          `}
                    title="简历设置"
                >
                    <Settings className="w-3.5 h-3.5" />
                    {showSettings ? '收起' : '设置'}
                </button>

                <button
                    onClick={showAIEvaluation ? () => setShowAIEvaluation(false) : handleEvaluateResume}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-800 disabled:opacity-60 disabled:cursor-wait transition-colors"
                >
                    <Sparkles className="w-3.5 h-3.5" />
                    {showAIEvaluation ? '返回编辑' : evaluating ? '评估中...' : 'AI评估'}
                </button>

                <button
                    onClick={handlePreview}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-800 transition-colors"
                >
                    <Eye className="w-3.5 h-3.5" />
                    预览
                </button>

                <button
                    onClick={handleExport}
                    disabled={exporting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-60 disabled:cursor-wait transition-colors"
                >
                    <Download className="w-3.5 h-3.5" />
                    {exporting ? '导出中...' : '导出PDF'}
                </button>
            </div>

            {/* 导出错误提示 */}
            {exportError && (
                <div className="flex-shrink-0 mx-4 mt-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600">
                    ⚠ {exportError}
                </div>
            )}

            {showSettings ? (
                <div className="flex-1 bg-gray-50/90 px-4 py-4 overflow-y-auto no-scrollbar">
                    <div className="max-w-[96%] mx-auto">
                        <SettingsPanel onClose={() => setShowSettings(false)} />
                    </div>
                </div>
            ) : showAIEvaluation ? (
                <div className="flex-1 overflow-hidden bg-white">
                    <ResumeScoreDrawer
                        embedded
                        open={showAIEvaluation}
                        result={evaluateResult}
                        loading={evaluating}
                        error={evaluateError}
                        streamText={evaluateStreamText}
                        currentResumeUpdatedAt={resume.updatedAt}
                        evaluatedResumeUpdatedAt={evaluatedResumeUpdatedAt}
                        lastEvaluatedAt={lastEvaluatedAt}
                        modeLabel={aiModeLabel}
                        onReevaluate={handleReevaluate}
                        onRetry={handleRetryEvaluate}
                        onJumpToModule={handleJumpToIssueModule}
                        onClose={() => setShowAIEvaluation(false)}
                    />
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
                            <div className="pb-8">
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
        </div>
    )
}

export default RightPanel
