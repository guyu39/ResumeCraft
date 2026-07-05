// ============================================================
// RightPanel — 右栏（步骤五/六/七：设置面板 + PDF 导出）
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BriefcaseBusiness, GitBranch, Settings, Sparkles, Link2, MessageSquare } from 'lucide-react'
import { useResumeStore, flushToCloud } from '@/store/resumeStore'
import { useAuthStore } from '@/store/authStore'
import { MODULE_META_LIST, ModuleType } from '@/types/resume'
import ShareModal from '@/components/resume/ShareModal'
import CommentsPanel from '@/components/resume/CommentsPanel'
import { readAIUserConfig, type ResumeEvaluateOutput } from '@/ai'
import { useExport } from '@/hooks/useExport'
import { toast } from '@/components/common/Toast'
import { useResumeEvaluation } from '@/hooks/useResumeEvaluation'
import { useResumeCheckup } from '@/hooks/useResumeCheckup'
import { useJDMatch } from '@/hooks/useJDMatch'
import { useJDScore } from '@/hooks/useJDScore'
import ResumeScoreDrawer from '@/components/layout/ai/ResumeScoreDrawer'
import JDMatchPanel from '@/components/layout/ai/JDMatchPanel'
import InterviewPrepPanel from '@/components/layout/ai/InterviewPrepPanel'
import ModuleRewritePanel from '@/components/layout/ai/ModuleRewritePanel'
import ResumeCheckupPanel from '@/components/layout/ai/ResumeCheckupPanel'
import SettingsPanel from '@/components/layout/SettingsPanel'
import { aiApi, resumeApi, ApiError, type JDMatchResponse, type JDScoreResponse, type ConversationItem } from '@/api'
import type { ExportFormat } from '@/api/types'

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
import ExportMenu from '@/components/common/ExportMenu'


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

// ---------- 右栏主组件 ----------
const RightPanel: React.FC = () => {
    const { resume, activeModuleId, setActiveModule, activeSnapshotId, triggerSnapshotRefresh, setBasedOnSnapshotId, snapshots } = useResumeStore()
    const { isAuthenticated } = useAuthStore()
    const formRef = useRef<HTMLDivElement>(null)
    const [showSettings, setShowSettings] = useState(false)
    const [showSnapshotDialog, setShowSnapshotDialog] = useState(false)
    const [shareOpen, setShareOpen] = useState(false)
    const [showComments, setShowComments] = useState(false)
    const currentSnapshotLabel = useMemo(() => {
        if (!activeSnapshotId) return undefined
        return snapshots.find(s => s.id === activeSnapshotId)?.label
    }, [activeSnapshotId, snapshots])
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
    const [activeAITool, setActiveAITool] = useState<'evaluate' | 'jd_match' | 'module_rewrite' | 'interview_prep' | 'checkup'>('evaluate')
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
    const { exportFile, exporting, error: exportError, reset: resetExport } = useExport()
    const {
        loading: evaluating,
        streamDone: evaluateStreamDone,
        error: evaluateError,
        result: evaluateResult,
        streamText: evaluateStreamText,
        modelName: evaluateModelName,
        runEvaluate,
        mode: evaluateMode,
    } = useResumeEvaluation()
    const {
        loading: checkupLoading,
        streamDone: checkupStreamDone,
        error: checkupError,
        healthScore: checkupHealthScore,
        summary: checkupSummary,
        findings: checkupFindings,
        modelName: checkupModelName,
        runCheckup,
    } = useResumeCheckup()
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

    // 组件挂载时从后端加载 AI 配置（按用户 ID，不依赖是否打开设置）
    // 这是 AI 配置的唯一加载点；模型名称显示等都复用此处结果，避免重复请求。
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
        }).catch((err) => {
            // 区分「未配置」(404/未找到，正常) 与「加载失败」(网络/服务异常，需提示)
            const status = err instanceof ApiError ? err.status : 0
            if (status && status !== 404) {
                toast('AI 配置加载失败，请稍后重试')
            }
            setAiConfigFromServer(null)
        })
    }, [isAuthenticated])

    // 解析 URL 参数：从投递页跳转而来时自动打开面试录音分析面板
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const tab = params.get('tab')
        const mode = params.get('mode')
        if (tab !== 'interview') return

        // 打开 AI 面板并切换到"面试" tab
        setShowSettings(false)
        setShowComments(false)
        setShowAIEvaluation(true)
        setActiveAITool('interview_prep')

        // 将相关参数存入 sessionStorage，供 InterviewPrepPanel 读取并预填
        if (mode === 'transcript') {
            const payload = {
                mode,
                applicationId: params.get('applicationId') || '',
                resumeId: params.get('resumeId') || resume.id,
                snapshotId: params.get('snapshotId') || activeSnapshotId || '',
                interviewId: params.get('interviewId') || '',
                interviewRound: params.get('interviewRound') || '',
                companyName: params.get('companyName') || '',
                targetTitle: params.get('targetTitle') || '',
                jdText: params.get('jdText') || '',
            }
            sessionStorage.setItem('interview_analysis_context', JSON.stringify(payload))
        }

        // 清理 URL 参数，避免刷新时重复触发
        const cleanUrl = `${window.location.pathname}${window.location.hash}`
        window.history.replaceState({}, '', cleanUrl)
    }, [isAuthenticated, resume.id, activeSnapshotId])

    // 进入评估面板时：加载当前快照对应的最新评估历史
    useEffect(() => {
        if (!showAIEvaluation) {
            setInitialEvaluation(null)
            return
        }
        if (!isAuthenticated) {
            return
        }
        // cancelled 守卫：快速切 tab/换简历时，丢弃过期请求的结果，避免覆盖新状态
        let cancelled = false
        const loadLatest = async () => {
            try {
                // 加载更多条，然后客户端按快照过滤
                const res = await aiApi.getConversations({ type: 'evaluate', resumeId: resume.id, pageSize: 10 })
                if (cancelled) return
                const items = res.items || []
                // 保存预取列表供 Drawer 使用（消除"查看历史"延迟）
                setPreloadedEvalHistory(items.slice(0, 5))
                if (items.length > 0) {
                    const detail = await aiApi.getConversation(items[0].id)
                    if (cancelled) return
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
                if (!cancelled) console.error('Failed to load initial evaluation:', err)
            }
        }
        loadLatest()
        return () => { cancelled = true }
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
        // cancelled 守卫：避免快速切 tab/换简历时旧请求覆盖新面板状态
        let cancelled = false
        if (activeAITool === 'jd_match') {
            setRestoredJDMatch(null)
            aiApi.getConversations({ type: 'jd_match', resumeId: resume.id, pageSize: 10 }).then((res) => {
                if (cancelled) return null
                const items = res.items || []
                // 保存预取列表供面板使用
                setPreloadedJDHistory(items.slice(0, 5))
                if (items.length > 0) {
                    return aiApi.getConversation(items[0].id)
                }
                return null
            }).then((detail) => {
                if (cancelled || !detail) {
                    if (!cancelled) setRestoredJDMatch(null)
                    return
                }
                if (detail.context) {
                    const ctx = detail.context as Record<string, unknown>
                    if (ctx.matchScore !== undefined) {
                        setRestoredJDMatch(ctx as unknown as JDMatchResponse)
                    }
                } else {
                    setRestoredJDMatch(null)
                }
            }).catch(() => { })
        }
        return () => { cancelled = true }
    }, [showAIEvaluation, activeAITool, isAuthenticated, resume.id])

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
    const handleExport = async (format: ExportFormat = 'pdf') => {
        const labels: Record<ExportFormat, string> = { pdf: 'PDF', markdown: 'Markdown', json: 'JSON', resume: 'Resume' }
        toast(`正在生成 ${labels[format]}，请稍候...`, 'success')
        await flushToCloud()
        // 失败不再抛出：useExport 已 setError，由右侧 NoticeCenter 内嵌显示，避免重复提示
        await exportFile(resume.id, format, {
            versionId: activeSnapshotId || '',
            filename: resume.title,
        })
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

    const handleRunCheckup = async () => {
        await flushToCloud()
        await runCheckup(resume, activeSnapshotId)
    }

    const handleRunJDMatch = async (form: { jdText: string; targetTitle?: string; companyName?: string }) => {        setRestoredJDMatch(null)
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
                onClose: resetExport,
            })
        }

        return notices
    }, [exportError, resetExport])

    return (
        <>
        <div className="flex flex-col h-full">
            {/* 顶部操作栏 */}
            <div className="flex-shrink-0 border-b border-slate-200/70 bg-white/80 px-3 py-2.5 backdrop-blur">
                <div className="flex items-center justify-end gap-1.5">
                    {/* 保存按钮 */}
                    {resume.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resume.id) && (
                        <button
                            onClick={() => setShowSnapshotDialog(true)}
                            className="flex-shrink-0 p-2 rounded-xl border border-slate-200 bg-white/85 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                            title="新建简历版本 · 记录当前版本以便对比和回溯"
                        >
                            <GitBranch className="w-3.5 h-3.5" />
                        </button>
                    )}

                    <button
                        onClick={() => { window.location.href = '/applications' }}
                        className="flex-shrink-0 p-2 rounded-xl border border-slate-200 bg-white/85 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                        title="投递管理 / 职位库"
                        aria-label="投递管理 / 职位库"
                    >
                        <BriefcaseBusiness className="w-3.5 h-3.5" />
                    </button>

                    {/* 设置按钮 */}
                    <button
                        onClick={() => {
                            setShowSettings((v) => !v)
                            setShowAIEvaluation(false)
                            setShowComments(false)
                        }}
                        className={`flex-shrink-0 p-2 rounded-xl border transition-colors ${
                            showSettings
                                ? 'border-primary/30 bg-primary/10 text-primary'
                                : 'border-slate-200 bg-white/85 text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                        }`}
                        title="简历设置"
                        aria-label="简历设置"
                    >
                        <Settings className="w-3.5 h-3.5" />
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
                                setShowComments(false)
                                setShowAIEvaluation(true)
                            }
                        }}
                        disabled={hasDateErrors}
                        title={hasDateErrors ? '请先修正日期范围错误' : showAIEvaluation ? '返回编辑' : evaluating ? 'AI 评估中...' : 'AI 评估'}
                        className={`flex-shrink-0 p-2 rounded-xl border transition-colors ${hasDateErrors
                            ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                            : showAIEvaluation
                                ? 'border-primary/30 bg-primary/10 text-primary'
                                : 'border-slate-200 bg-white/85 text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                            }`}
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                    </button>

                    <button
                        onClick={() => setShareOpen(true)}
                        className="flex-shrink-0 p-2 rounded-xl border border-slate-200 bg-white/85 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                        title="分享"
                    >
                        <Link2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                        onClick={() => {
                            setShowComments(v => !v)
                            setShowSettings(false)
                            setShowAIEvaluation(false)
                        }}
                        className={`flex-shrink-0 p-2 rounded-xl border transition-colors ${
                            showComments
                                ? 'border-primary/30 bg-primary/10 text-primary'
                                : 'border-slate-200 bg-white/85 text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                        }`}
                        title="评论"
                    >
                        <MessageSquare className="w-3.5 h-3.5" />
                    </button>

                    <ExportMenu
                        exporting={exporting}
                        disabled={hasDateErrors}
                        onExport={handleExport}
                    />
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
                            <div className="grid grid-cols-5 gap-1 rounded-xl bg-gray-100 p-1 text-xs">
                                <button
                                    type="button"
                                    onClick={() => setActiveAITool('evaluate')}
                                    className={`rounded-lg px-2 py-2 transition-colors ${activeAITool === 'evaluate' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    简历评估
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveAITool('checkup')}
                                    className={`rounded-lg px-2 py-2 transition-colors ${activeAITool === 'checkup' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    体检
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveAITool('jd_match')}
                                    className={`rounded-lg px-2 py-2 transition-colors ${activeAITool === 'jd_match' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    JD 匹配
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveAITool('module_rewrite')}
                                    className={`rounded-lg px-2 py-2 transition-colors ${activeAITool === 'module_rewrite' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    改写
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveAITool('interview_prep')}
                                    className={`rounded-lg px-2 py-2 transition-colors ${activeAITool === 'interview_prep' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    面试
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
                            {activeAITool === 'module_rewrite' && (
                                <ModuleRewritePanel resume={resume} />
                            )}
                            {activeAITool === 'checkup' && (
                                <ResumeCheckupPanel
                                    resume={resume}
                                    loading={checkupLoading}
                                    streamDone={checkupStreamDone}
                                    error={checkupError}
                                    healthScore={checkupHealthScore}
                                    summary={checkupSummary}
                                    findings={checkupFindings}
                                    modelName={checkupModelName}
                                    isAuthenticated={isAuthenticated}
                                    onRunCheckup={handleRunCheckup}
                                    onJumpToModule={handleJumpToIssueModule}
                                />
                            )}
                            {activeAITool === 'interview_prep' && (
                                <InterviewPrepPanel
                                    resumeId={resume.id}
                                    content={resume as unknown as Record<string, unknown>}
                                    activeSnapshotId={activeSnapshotId}
                                    aiConfigured={!!aiConfigFromServer?.hasApiKey}
                                />
                            )}
                        </div>
                    </div>
                </div>
            ) : showComments ? (
                <CommentsPanel resumeId={resume.id} onClose={() => setShowComments(false)} />
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
        {shareOpen && <ShareModal resumeId={resume.id} snapshotId={activeSnapshotId || undefined} snapshotLabel={currentSnapshotLabel} open={shareOpen} onClose={() => setShareOpen(false)} />}
        </>
    )
}

export default RightPanel
