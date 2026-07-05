import React, { useState, useCallback, useEffect } from 'react'
import {
    GraduationCap,
    Wand2,
    Mic,
    Code2,
    FolderKanban,
    Building2,
    Users,
    MessageCircle,
    ChevronDown,
    ChevronUp,
    Check,
    X,
    AlertTriangle,
    FileText,
    Loader2,
    History,
} from 'lucide-react'
import { useInterviewPrep } from '@/hooks/useInterviewPrep'
import { aiApi, applicationsApi } from '@/api'
import { extractTextFromDocx, isDocxFile } from '@/utils/docxParser'
import { InterviewHistoryDrawer } from './InterviewHistoryDrawer'
import { scoreClass } from './shared'
import type { InterviewSessionDetail } from '@/api/ai'
import InlineError from '@/components/common/InlineError'

interface InterviewPrepPanelProps {
    resumeId: string
    content: Record<string, unknown>
    activeSnapshotId: string | null
    aiConfigured: boolean
    jdText?: string
    targetTitle?: string
    companyName?: string
    onJdTextChange?: (text: string) => void
    onTargetTitleChange?: (title: string) => void
    onCompanyNameChange?: (name: string) => void
}

type InterviewRound = 'technical' | 'hr'

const FOCUS_OPTIONS = [
    { key: 'technical', label: '技术深度', icon: Code2 },
    { key: 'project', label: '项目经验', icon: FolderKanban },
    { key: 'industry', label: '行业知识', icon: Building2 },
    { key: 'soft_skill', label: '软技能', icon: Users },
    { key: 'behavioral', label: '行为面试', icon: MessageCircle },
] as const

const DIFFICULTY_CONFIG: Record<string, { label: string; class: string }> = {
    basic: { label: '基础', class: 'bg-green-50 text-green-700 border-green-100' },
    medium: { label: '中等', class: 'bg-amber-50 text-amber-700 border-amber-100' },
    advanced: { label: '进阶', class: 'bg-red-50 text-red-700 border-red-100' },
}

const ROUND_CONFIG: Record<InterviewRound, { label: string; class: string }> = {
    technical: { label: '技术', class: 'bg-blue-50 text-blue-700' },
    hr: { label: 'HR', class: 'bg-green-50 text-green-700' },
}

const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; label: string; class: string }> = {
    technical:  { icon: Code2,         label: '技术深度', class: 'bg-blue-50 text-blue-700 border-blue-100' },
    project:    { icon: FolderKanban,  label: '项目经验', class: 'bg-purple-50 text-purple-700 border-purple-100' },
    industry:   { icon: Building2,     label: '行业知识', class: 'bg-amber-50 text-amber-700 border-amber-100' },
    soft_skill: { icon: Users,         label: '软技能',   class: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
    behavioral: { icon: MessageCircle, label: '行为面试', class: 'bg-pink-50 text-pink-700 border-pink-100' },
}

// 分类配置：与后端 model.InterviewQuestion.category 枚举对齐
const CATEGORY_FALLBACK = { icon: Code2, label: '其他', class: 'bg-gray-50 text-gray-700 border-gray-100' }

const InterviewPrepPanel: React.FC<InterviewPrepPanelProps> = ({
    resumeId,
    content,
    activeSnapshotId,
    aiConfigured,
    jdText,
    targetTitle,
    companyName,
}) => {
    const {
        mode,
        setMode,
        interviewRound,
        setInterviewRound,
        questions,
        generating,
        generateError,
        generateQuestions,
        transcriptText,
        setTranscriptText,
        analyzing,
        analyzeError,
        analyzeTranscript,
        answers,
        setAnswer,
        evaluation,
        evaluating,
        submitForEvaluation,
        sessionId,
        reset,
        loadSession,
    } = useInterviewPrep()

    const [focusAreas, setFocusAreas] = useState<string[]>([])
    const [questionCount, setQuestionCount] = useState(10)
    const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({})
    const [expandedQuestionIdx, setExpandedQuestionIdx] = useState<number | null>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [localJdText, setLocalJdText] = useState(jdText ?? '')
    const [localTargetTitle, setLocalTargetTitle] = useState(targetTitle ?? '')
    const [localCompanyName, setLocalCompanyName] = useState(companyName ?? '')
    const [localDropError, setLocalDropError] = useState<string | null>(null)
    const [parsingFile, setParsingFile] = useState(false)
    const [historyOpen, setHistoryOpen] = useState(false)
    // 逐题追问对话（严格以 questionId 为 key，互不干扰）
    const [followups, setFollowups] = useState<Record<string, { turns: Array<{ role: 'user' | 'assistant'; content: string }>; loading: boolean; done: boolean; draft: string }>>({})

    // 追问轮数上限：最多 3 轮 AI 追问，达上限自动结束，避免无限追问烧 token
    const MAX_FOLLOWUP_ROUNDS = 3

    // 从投递页跳转而来时，读取 URL 上下文并预填录音分析表单
    useEffect(() => {
        const contextRaw = sessionStorage.getItem('interview_analysis_context')
        if (!contextRaw) return
        try {
            const context = JSON.parse(contextRaw) as {
                mode?: string
                applicationId?: string
                interviewId?: string
                interviewRound?: string
                companyName?: string
                targetTitle?: string
                jdText?: string
            }
            if (context.mode === 'transcript') {
                setMode('transcript')
            }
            if (context.interviewRound) {
                // 中文轮次映射到面板选项：HR 面 -> hr，其余 -> technical
                const round = context.interviewRound === 'HR面' ? 'hr' : 'technical'
                setInterviewRound(round as InterviewRound)
            }
            if (context.companyName) setLocalCompanyName(context.companyName)
            if (context.targetTitle) setLocalTargetTitle(context.targetTitle)
            if (context.jdText) setLocalJdText(context.jdText)
        } catch {
            // ignore invalid context
        }
    }, [setMode, setInterviewRound])

    // 从投递页带来的面试录音文件，解码后预填到转写文本；无录音时 fallback 到面试记录文本
    useEffect(() => {
        const contextRaw = sessionStorage.getItem('interview_analysis_context')
        const transcriptFallback = sessionStorage.getItem('interview_analysis_transcript')
        if (!contextRaw) {
            if (transcriptFallback) {
                setTranscriptText(transcriptFallback)
                sessionStorage.removeItem('interview_analysis_transcript')
            }
            return
        }
        ;(async () => {
            try {
                const context = JSON.parse(contextRaw) as {
                    applicationId?: string
                    interviewId?: string
                }
                let text = transcriptFallback || ''
                if (context.applicationId && context.interviewId) {
                    try {
                        const data = await applicationsApi.getInterviewRecording(context.applicationId, context.interviewId)
                        if (data.attachment && data.content) {
                            const bytes = base64ToArrayBuffer(data.content)
                            if (data.attachment.fileType === 'docx') {
                                const file = new File([bytes], data.attachment.fileName, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
                                text = await extractTextFromDocx(file)
                            } else {
                                text = new TextDecoder().decode(bytes)
                            }
                        }
                    } catch {
                        // 录音读取失败时仍尝试使用 fallback 文本
                    }
                }
                if (text) setTranscriptText(text)
            } catch {
                if (transcriptFallback) setTranscriptText(transcriptFallback)
            } finally {
                sessionStorage.removeItem('interview_analysis_context')
                sessionStorage.removeItem('interview_analysis_transcript')
            }
        })()
    }, [setTranscriptText])

    const startOrContinueFollowup = async (questionId: string, questionText: string, firstAnswer: string) => {
        if (!sessionId) return
        const cur = followups[questionId] ?? { turns: [], loading: false, done: false, draft: '' }
        if (cur.loading || cur.done) return
        const userContent = cur.turns.length === 0 ? firstAnswer : cur.draft.trim()
        if (!userContent) return

        const history = cur.turns.length === 0 ? [] : [...cur.turns, { role: 'user' as const, content: userContent }]
        setFollowups((s) => ({
            ...s,
            [questionId]: {
                turns: cur.turns.length === 0 ? [] : [...cur.turns, { role: 'user', content: userContent }],
                loading: true,
                done: false,
                draft: '',
            },
        }))
        try {
            const { followup, done } = await aiApi.interviewFollowup({
                sessionId,
                questionId,
                question: questionText,
                answer: firstAnswer,
                history,
            })
            setFollowups((s) => {
                const prev = s[questionId] ?? { turns: [], loading: false, done: false, draft: '' }
                const nextTurns = done || !followup ? prev.turns : [...prev.turns, { role: 'assistant' as const, content: followup }]
                // AI 追问轮数（assistant 条数）达上限则结束
                const aiRounds = nextTurns.filter((t) => t.role === 'assistant').length
                return {
                    ...s,
                    [questionId]: {
                        turns: nextTurns,
                        loading: false,
                        done: done || !followup || aiRounds >= MAX_FOLLOWUP_ROUNDS,
                        draft: '',
                    },
                }
            })
        } catch {
            setFollowups((s) => ({ ...s, [questionId]: { ...(s[questionId] ?? { turns: [], done: false, draft: '' }), loading: false } }))
        }
    }

    const setFollowupDraft = (questionId: string, draft: string) => {
        setFollowups((s) => ({ ...s, [questionId]: { ...(s[questionId] ?? { turns: [], loading: false, done: false }), draft } }))
    }

    const toggleFocus = (key: string) => {
        setFocusAreas((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
        )
    }

    const toggleCategory = (cat: string) => {
        setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }))
    }

    const handleGenerate = () => {
        if (!aiConfigured) return
        generateQuestions(
            resumeId,
            content,
            localJdText,
            localTargetTitle,
            localCompanyName,
            focusAreas,
            questionCount,
            activeSnapshotId ?? undefined,
        )
    }

    const handleAnalyze = () => {
        if (!aiConfigured || !transcriptText.trim()) return
        analyzeTranscript(
            resumeId,
            content,
            localJdText,
            localTargetTitle,
            localCompanyName,
            activeSnapshotId ?? undefined,
        )
    }

    const handleSubmitEvaluation = () => {
        if (!aiConfigured) return
        submitForEvaluation()
    }

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }, [])

    const handleDragLeave = useCallback(() => {
        setIsDragging(false)
    }, [])

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files[0]
        if (!file) return

        const name = file.name.toLowerCase()

        if (file.size > 10 * 1024 * 1024) {
            setLocalDropError('文件过大（>10MB），请压缩或拆分后再上传。')
            return
        }

        // .docx 走专用解析器（ZIP 解压 + XML 提取）
        if (isDocxFile(file)) {
            setLocalDropError(null)
            setParsingFile(true)
            try {
                const text = await extractTextFromDocx(file)
                if (!text) {
                    setLocalDropError('未从 Word 文档中提取到任何文本，请检查文档内容。')
                } else {
                    setTranscriptText(text)
                }
            } catch (err) {
                setLocalDropError(
                    `Word 文档解析失败：${err instanceof Error ? err.message : '未知错误'}。可尝试用 Word 打开后另存为 .txt 再上传。`
                )
            } finally {
                setParsingFile(false)
            }
            return
        }

        // 老 .doc 二进制格式：浏览器无法解析
        if (name.endsWith('.doc')) {
            setLocalDropError('不支持旧版 .doc 二进制格式。请用 Word 打开后另存为 .docx 或 .txt 再上传。')
            return
        }

        // .pdf 浏览器解析复杂，建议用户转 txt
        if (name.endsWith('.pdf')) {
            setLocalDropError('暂不支持 .pdf 直接上传。请用 PDF 阅读器复制文字内容粘贴到下方文本框。')
            return
        }

        // 纯文本类
        const isTextLike =
            file.type.startsWith('text/') ||
            name.endsWith('.txt') ||
            name.endsWith('.srt') ||
            name.endsWith('.vtt') ||
            name.endsWith('.md') ||
            name.endsWith('.csv')

        if (!isTextLike) {
            const ext = name.split('.').pop() || '未知'
            setLocalDropError(
                `暂不支持 .${ext} 格式。请使用 .txt / .docx / .srt / .vtt 等格式，或直接将文字粘贴到下方文本框。`
            )
            return
        }

        setLocalDropError(null)
        const reader = new FileReader()
        reader.onload = (ev) => {
            const text = ev.target?.result as string
            if (!text) return
            // 防御：二进制头检测
            const head = text.slice(0, 4)
            if (head.startsWith('PK') || head.startsWith('%PDF') || head.startsWith('\x7fELF')) {
                setLocalDropError('检测到二进制文件内容，请上传纯文本（.txt/.srt）或 .docx 文件。')
                return
            }
            setTranscriptText(text)
        }
        reader.onerror = () => {
            setLocalDropError('文件读取失败，请重试或直接粘贴文本。')
        }
        reader.readAsText(file, 'utf-8')
    }, [setTranscriptText])

    const questionsByCategory = questions.reduce<Record<string, typeof questions>>((acc, q) => {
        const cat = q.category || 'other'
        if (!acc[cat]) acc[cat] = []
        acc[cat].push(q)
        return acc
    }, {})

    const canGenerate = localJdText.trim().length > 0 && localTargetTitle.trim().length > 0 && !generating
    const canAnalyze = transcriptText.trim().length > 0 && !analyzing

    return (
        <div className="h-full overflow-y-auto bg-gray-50/80 px-4 py-4 no-scrollbar">
            <div className="space-y-4">
                {/* Header */}
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900">面试准备</h3>
                            <p className="mt-1 text-xs leading-relaxed text-gray-500">
                                模拟面试生成针对性题目，或上传录音转写获取面试分析。
                            </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => setHistoryOpen(true)}
                                className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50"
                                title="面试历史"
                            >
                                <History className="h-3.5 w-3.5" />
                                <span>历史</span>
                            </button>
                            {(questions.length > 0 || evaluation) && (
                                <button
                                    type="button"
                                    onClick={reset}
                                    className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50"
                                >
                                    重置
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Mode Switch */}
                    <div className="mt-4 grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => setMode('simulate')}
                            className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                                mode === 'simulate'
                                    ? 'bg-primary text-white'
                                    : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            <GraduationCap className="h-3.5 w-3.5" />
                            模拟面试
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('transcript')}
                            className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                                mode === 'transcript'
                                    ? 'bg-primary text-white'
                                    : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            <Mic className="h-3.5 w-3.5" />
                            录音分析
                        </button>
                    </div>

                    {/* Common Fields */}
                    <div className="mt-4 space-y-3">
                        <input
                            value={localTargetTitle}
                            onChange={(e) => setLocalTargetTitle(e.target.value)}
                            placeholder="目标岗位，例如：前端工程师"
                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                        <input
                            value={localCompanyName}
                            onChange={(e) => setLocalCompanyName(e.target.value)}
                            placeholder="公司名称，可选"
                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
                        />

                        {/* Interview Round */}
                        <div className="grid grid-cols-2 gap-2">
                            {(['technical', 'hr'] as InterviewRound[]).map((round) => (
                                <button
                                    key={round}
                                    type="button"
                                    onClick={() => setInterviewRound(round)}
                                    className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                                        interviewRound === round
                                            ? `${ROUND_CONFIG[round].class} border`
                                            : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                                    }`}
                                >
                                    {round === 'hr' ? 'HR 面' : '技术面'}
                                </button>
                            ))}
                        </div>

                        {/* Focus Areas (multi-select) */}
                        <div>
                            <p className="mb-1.5 text-xs text-gray-500">面试侧重（多选）</p>
                            <div className="flex flex-wrap gap-1.5">
                                {FOCUS_OPTIONS.map(({ key, label, icon: Icon }) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => toggleFocus(key)}
                                        className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors ${
                                            focusAreas.includes(key)
                                                ? 'bg-primary/10 text-primary'
                                                : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                                        }`}
                                    >
                                        <Icon className="h-3 w-3" />
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Simulate Mode: JD + Count + Generate */}
                    {mode === 'simulate' && (
                        <div className="mt-4 space-y-3">
                            <textarea
                                value={localJdText}
                                onChange={(e) => setLocalJdText(e.target.value)}
                                placeholder="粘贴岗位 JD，建议包含岗位职责、任职要求、技术栈和加分项"
                                className="min-h-36 w-full resize-none no-scrollbar rounded-xl border border-gray-200 px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary"
                            />
                            <div className="flex items-center justify-between text-xs text-gray-400">
                                <span>{localJdText.length}/20000</span>
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-gray-50/40 px-3 py-2.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-gray-600">题目数量</span>
                                    <span className="text-sm font-semibold text-primary tabular-nums">{questionCount} 道</span>
                                </div>
                                <input
                                    type="range"
                                    min={3}
                                    max={30}
                                    step={1}
                                    value={questionCount}
                                    onChange={(e) => setQuestionCount(Number(e.target.value))}
                                    className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-primary"
                                />
                                <div className="mt-1 flex justify-between text-[10px] text-gray-400">
                                    <span>少（3）</span>
                                    <span>常用（10-15）</span>
                                    <span>密集（30）</span>
                                </div>
                            </div>
                            {!aiConfigured && (
                                <p className="flex items-center gap-1 text-xs text-amber-600">
                                    <AlertTriangle className="h-3 w-3" />
                                    请先配置 AI 服务
                                </p>
                            )}
                            <button
                                type="button"
                                disabled={!canGenerate}
                                onClick={handleGenerate}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:opacity-100"
                            >
                                {generating ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span>正在生成中，请稍候…</span>
                                    </>
                                ) : (
                                    <>
                                        <Wand2 className="h-4 w-4" />
                                        <span>{questions.length > 0 ? '重新生成' : '生成面试题'}</span>
                                    </>
                                )}
                            </button>
                            {generating && (
                                <p className="text-center text-xs text-gray-500">
                                    AI 正在为你定制面试题，预计需要 10-30 秒，期间请勿刷新页面
                                </p>
                            )}
                            {generateError && !generating && (
                                <InlineError message={generateError} />
                            )}
                        </div>
                    )}

                    {/* Transcript Mode */}
                    {mode === 'transcript' && (
                        <div className="mt-4 space-y-3">
                            <div
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                className={`relative rounded-xl border-2 border-dashed transition-colors ${
                                    isDragging
                                        ? 'border-primary bg-primary/5'
                                        : 'border-gray-200 bg-gray-50/50'
                                }`}
                            >
                                <textarea
                                    value={transcriptText}
                                    onChange={(e) => setTranscriptText(e.target.value)}
                                    placeholder="粘贴录音转写文本，或拖拽 .txt / .docx / .srt 文件到此处"
                                    className="min-h-32 w-full resize-none bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-gray-400 focus:ring-0"
                                />
                                {isDragging && (
                                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-primary/10">
                                        <FileText className="h-6 w-6 text-primary" />
                                    </div>
                                )}
                                {parsingFile && (
                                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-white/80 backdrop-blur-sm">
                                        <div className="flex items-center gap-2 text-sm text-primary">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span>正在解析 Word 文档…</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <p className="flex items-start gap-1 text-[11px] leading-relaxed text-gray-400">
                                <FileText className="mt-0.5 h-3 w-3 flex-shrink-0" />
                                <span>支持 .txt / .docx / .srt / .vtt / .md / .csv（最大 10MB）。.doc 旧格式请另存为 .docx；.pdf 请复制文字后粘贴。</span>
                            </p>
                            {localDropError && (
                                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                                    <span>{localDropError}</span>
                                </div>
                            )}
                            {!aiConfigured && (
                                <p className="flex items-center gap-1 text-xs text-amber-600">
                                    <AlertTriangle className="h-3 w-3" />
                                    请先配置 AI 服务
                                </p>
                            )}
                            <button
                                type="button"
                                disabled={!canAnalyze}
                                onClick={handleAnalyze}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:opacity-100"
                            >
                                {analyzing ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span>正在分析录音中，请稍候…</span>
                                    </>
                                ) : (
                                    <>
                                        <Mic className="h-4 w-4" />
                                        <span>分析录音</span>
                                    </>
                                )}
                            </button>
                            {analyzing && (
                                <p className="text-center text-xs text-gray-500">
                                    AI 正在分析录音文本，预计需要 15-40 秒，期间请勿刷新页面
                                </p>
                            )}
                            {analyzeError && !analyzing && (
                                <InlineError message={analyzeError} />
                            )}
                        </div>
                    )}
                </div>

                {/* Questions List */}
                {questions.length > 0 && !evaluation && (
                    <div className="space-y-3">
                        {Object.entries(questionsByCategory).map(([category, items]) => {
                            const cfg = CATEGORY_CONFIG[category] || CATEGORY_FALLBACK
                            const Icon = cfg.icon
                            const collapsed = collapsedCategories[category]
                            return (
                                <div key={category} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                                    <button
                                        type="button"
                                        onClick={() => toggleCategory(category)}
                                        className="flex w-full items-center justify-between"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md border ${cfg.class}`}>
                                                <Icon className="h-3.5 w-3.5" />
                                            </span>
                                            <h4 className="text-sm font-semibold text-gray-900">{cfg.label}</h4>
                                            <span className={`rounded-full border px-1.5 py-0.5 text-xs ${cfg.class}`}>
                                                {items.length}
                                            </span>
                                        </div>
                                        {collapsed ? (
                                            <ChevronDown className="h-4 w-4 text-gray-400" />
                                        ) : (
                                            <ChevronUp className="h-4 w-4 text-gray-400" />
                                        )}
                                    </button>

                                    {!collapsed && (
                                        <div className="mt-3 space-y-2">
                                            {items.map((q, _) => {
                                                const globalIdx = questions.indexOf(q)
                                                const difficulty = q.difficulty || 'medium'
                                                const diffCfg = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.medium
                                                const round = (q as unknown as Record<string, unknown>).round as InterviewRound | undefined
                                                const isExpanded = expandedQuestionIdx === globalIdx
                                                return (
                                                    <div key={globalIdx} className="rounded-xl border border-gray-100 p-3">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setExpandedQuestionIdx(isExpanded ? null : globalIdx)
                                                            }
                                                            className="flex w-full items-start justify-between gap-2 text-left"
                                                        >
                                                            <div className="flex items-start gap-2">
                                                                <span className="mt-0.5 text-xs text-gray-400">{globalIdx + 1}.</span>
                                                                <span className="text-sm text-gray-800">{q.question}</span>
                                                            </div>
                                                            <div className="flex shrink-0 items-center gap-1">
                                                                {round && (
                                                                    <span className={`rounded px-1.5 py-0.5 text-xs ${ROUND_CONFIG[round]?.class || ''}`}>
                                                                        {ROUND_CONFIG[round]?.label}
                                                                    </span>
                                                                )}
                                                                <span className={`rounded border px-1.5 py-0.5 text-xs ${diffCfg.class}`}>
                                                                    {diffCfg.label}
                                                                </span>
                                                                {isExpanded ? (
                                                                    <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
                                                                ) : (
                                                                    <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                                                                )}
                                                            </div>
                                                        </button>

                                                        {isExpanded && (
                                                            <div className="mt-3 space-y-2">
                                                                <textarea
                                                                    value={answers.get(questions[globalIdx].id)?.answer || ''}
                                                                    onChange={(e) => setAnswer(questions[globalIdx].id, e.target.value)}
                                                                    placeholder="输入你的回答..."
                                                                    className="min-h-24 w-full resize-none no-scrollbar rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary"
                                                                />
                                                                <div className="flex items-center justify-end">
                                                                    <span className="text-xs text-gray-400">
                                                                        {globalIdx + 1} / {questions.length}
                                                                    </span>
                                                                </div>

                                                                {/* 追问对话区（严格按 questionId 渲染，与展开索引无关，避免切题串台） */}
                                                                {(() => {
                                                                    const qid = questions[globalIdx].id
                                                                    const qText = questions[globalIdx].question
                                                                    const ans = answers.get(qid)?.answer?.trim() || ''
                                                                    const fu = followups[qid]
                                                                    const started = !!fu && (fu.turns.length > 0 || fu.loading || fu.done)
                                                                    return (
                                                                        <div className="mt-1 border-t border-gray-100 pt-2">
                                                                            {!started ? (
                                                                                <button
                                                                                    type="button"
                                                                                    disabled={!ans}
                                                                                    onClick={() => startOrContinueFollowup(qid, qText, ans)}
                                                                                    className="flex items-center gap-1 rounded-lg border border-primary/30 px-2.5 py-1 text-xs text-primary hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed"
                                                                                    title={ans ? '让 AI 基于你的回答提出一个追问' : '请先填写回答'}
                                                                                >
                                                                                    <MessageCircle className="h-3.5 w-3.5" />模拟追问
                                                                                </button>
                                                                            ) : (
                                                                                <div className="space-y-2">
                                                                                    {fu.turns.map((t, ti) => (
                                                                                        <div key={ti} className={`rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${t.role === 'assistant' ? 'bg-primary/5 text-gray-700' : 'bg-gray-100 text-gray-600'}`}>
                                                                                            <span className="mr-1 font-medium text-gray-400">{t.role === 'assistant' ? '面试官' : '我'}：</span>
                                                                                            {t.content}
                                                                                        </div>
                                                                                    ))}
                                                                                    {fu.loading && (
                                                                                        <div className="flex items-center gap-1 text-xs text-gray-400">
                                                                                            <Loader2 className="h-3 w-3 animate-spin" />AI 思考中...
                                                                                        </div>
                                                                                    )}
                                                                                    {fu.done && (
                                                                                        <p className="text-xs text-gray-400">追问结束</p>
                                                                                    )}
                                                                                    {/* 手动追问：AI 给出追问后，由用户先作答，再手动点「继续追问」生成下一问 */}
                                                                                    {!fu.loading && !fu.done && fu.turns.length > 0 && (
                                                                                        <div className="space-y-2">
                                                                                            <textarea
                                                                                                value={fu.draft}
                                                                                                onChange={(e) => setFollowupDraft(qid, e.target.value)}
                                                                                                placeholder="回答这个追问..."
                                                                                                className="min-h-20 w-full resize-none no-scrollbar rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary"
                                                                                            />
                                                                                            <div className="flex justify-end">
                                                                                                <button
                                                                                                    type="button"
                                                                                                    disabled={!fu.draft.trim()}
                                                                                                    onClick={() => startOrContinueFollowup(qid, qText, ans)}
                                                                                                    className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90 disabled:opacity-40"
                                                                                                >
                                                                                                    <MessageCircle className="h-3.5 w-3.5" />继续追问
                                                                                                </button>
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )
                                                                })()}
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            )
                        })}

                        {/* Submit for Evaluation */}
                        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Wand2 className="h-4 w-4 text-primary" />
                                <h4 className="text-sm font-semibold text-gray-900">答题评估</h4>
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                                回答题目后提交，AI 会逐题评估并给出改进建议。
                            </p>
                            {(() => {
                                const answeredCount = Array.from(answers.values()).filter((a) => a.answer?.trim()).length
                                return (
                                    <p className="mt-1 text-xs text-gray-400">
                                        已回答 {answeredCount} / {questions.length} 题
                                    </p>
                                )
                            })()}
                            <button
                                type="button"
                                disabled={evaluating || Array.from(answers.values()).filter((a) => a.answer?.trim()).length === 0}
                                onClick={handleSubmitEvaluation}
                                className="mt-3 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {evaluating ? '评估中...' : '提交评估'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Evaluation Results */}
                {evaluation && (
                    <div className="space-y-4">
                        {/* 综合评分 */}
                        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-xs text-gray-500">综合评分</p>
                                    <div className="mt-1 flex items-end gap-2">
                                        <span className={`text-4xl font-bold ${scoreClass(evaluation.overallScore ?? 0)}`}>
                                            {evaluation.overallScore ?? 0}
                                        </span>
                                        {evaluation.overallLevel && (
                                            <span className="mb-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                                                {evaluation.overallLevel}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <GraduationCap className="h-4 w-4 text-primary" />
                                    <span className="text-xs text-gray-500">评估完成</span>
                                </div>
                            </div>
                            {evaluation.summary && (
                                <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-600">
                                    {evaluation.summary}
                                </p>
                            )}
                        </div>

                        {/* 分轮次通过率 + 评分理由 */}
                        {Object.keys(evaluation.roundScores ?? {}).length > 0 && (
                            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                                <h4 className="text-sm font-semibold text-gray-900">分轮次通过率</h4>
                                <div className="mt-3 space-y-2">
                                    {Object.entries(evaluation.roundScores).map(([roundKey, score]) => {
                                        const cfg = ROUND_CONFIG[roundKey as InterviewRound]
                                        const reason = evaluation.roundReasons?.[roundKey]
                                        return (
                                            <div key={roundKey} className="rounded-xl bg-gray-50 p-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        {cfg && (
                                                            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${cfg.class}`}>
                                                                {cfg.label}
                                                            </span>
                                                        )}
                                                        <span className="text-sm font-medium text-gray-700">
                                                            {roundKey === 'hr' ? 'HR 面'
                                                                : (roundKey === 'technical' || roundKey === 'technical_1' || roundKey === 'technical_2') ? '技术面'
                                                                : roundKey}
                                                        </span>
                                                    </div>
                                                    <span className={`text-lg font-bold ${scoreClass(score)}`}>{score}</span>
                                                </div>
                                                {reason && (
                                                    <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
                                                        <span className="font-medium text-gray-600">理由：</span>
                                                        {reason}
                                                    </p>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* 维度评分 */}
                        {Object.keys(evaluation.dimensionScores ?? {}).length > 0 && (
                            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                                <h4 className="text-sm font-semibold text-gray-900">维度评分</h4>
                                <div className="mt-3 space-y-2">
                                    {Object.entries(evaluation.dimensionScores).map(([dimKey, dim]) => {
                                        const dimCfg = CATEGORY_CONFIG[dimKey] || CATEGORY_FALLBACK
                                        return (
                                            <div key={dimKey} className="rounded-xl bg-gray-50 p-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-md border ${dimCfg.class}`}>
                                                            <dimCfg.icon className="h-3 w-3" />
                                                        </span>
                                                        <span className="text-sm font-medium text-gray-700">{dimCfg.label}</span>
                                                        {dim.level && (
                                                            <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
                                                                {dim.level}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className={`text-sm font-semibold ${scoreClass(dim.score)}`}>{dim.score}</span>
                                                </div>
                                                {dim.feedback && (
                                                    <p className="mt-1.5 text-xs leading-relaxed text-gray-500">{dim.feedback}</p>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* 逐题评估 */}
                        {(evaluation.questionEvaluations?.length ?? 0) > 0 && (
                            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                                <h4 className="text-sm font-semibold text-gray-900">逐题评估</h4>
                                <div className="mt-3 space-y-2">
                                    {evaluation.questionEvaluations.map((qe, idx) => {
                                        const q = questions.find(x => x.id === qe.questionId)
                                        return (
                                            <div key={idx} className="rounded-xl border border-gray-100 p-3">
                                                <div className="flex items-start justify-between gap-2">
                                                    <span className="text-sm text-gray-800">
                                                        Q{idx + 1}. {q?.question || qe.questionId}
                                                    </span>
                                                    <div className="flex shrink-0 items-center gap-1">
                                                        {qe.score >= 60 ? (
                                                            <Check className="h-4 w-4 text-green-600" />
                                                        ) : (
                                                            <X className="h-4 w-4 text-red-500" />
                                                        )}
                                                        <span className={`text-sm font-semibold ${scoreClass(qe.score)}`}>{qe.score}</span>
                                                    </div>
                                                </div>
                                                {qe.briefFeedback && (
                                                    <p className="mt-2 text-xs leading-relaxed text-gray-500">{qe.briefFeedback}</p>
                                                )}
                                                {qe.keyPointsHit?.length > 0 && (
                                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                                        {qe.keyPointsHit.map((kp, i) => (
                                                            <span key={i} className="rounded-md bg-green-50 px-1.5 py-0.5 text-[10px] text-green-700">✓ {kp}</span>
                                                        ))}
                                                    </div>
                                                )}
                                                {qe.missedPoints?.length > 0 && (
                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                        {qe.missedPoints.map((mp, i) => (
                                                            <span key={i} className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600">✗ {mp}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* 提升建议 */}
                        {(evaluation.improvementSuggestions?.length ?? 0) > 0 && (
                            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                                <h4 className="text-sm font-semibold text-gray-900">提升建议</h4>
                                <ul className="mt-3 space-y-2">
                                    {evaluation.improvementSuggestions.map((sug, idx) => {
                                        const priorityColor =
                                            sug.priority === 'high' ? 'bg-red-50 text-red-700 border-red-100'
                                            : sug.priority === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-100'
                                            : 'bg-blue-50 text-blue-700 border-blue-100'
                                        return (
                                            <li key={idx} className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                                                <div className="flex items-start gap-2">
                                                    <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${priorityColor}`}>
                                                        {sug.priority === 'high' ? '高' : sug.priority === 'medium' ? '中' : '低'}
                                                    </span>
                                                    <div className="flex-1 text-sm text-gray-700">
                                                        {sug.area && <span className="font-medium">[{sug.area}] </span>}
                                                        {sug.suggestion}
                                                        {sug.estimatedGain > 0 && (
                                                            <span className="ml-1 text-xs text-green-600">+{sug.estimatedGain}分</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </li>
                                        )
                                    })}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <InterviewHistoryDrawer
                open={historyOpen}
                onClose={() => setHistoryOpen(false)}
                resumeId={resumeId}
                onLoadSession={(detail: InterviewSessionDetail) => {
                    // 兜底：detail 顶层的 overallScore/passLevel 是从数据库列直接读的，
                    // 而 evaluation 里的 overallScore 来自 JSON。两者不一致时以列值为准。
                    const enrichedEvaluation = detail.evaluation
                        ? {
                            ...detail.evaluation,
                            overallScore: detail.evaluation.overallScore ?? detail.overallScore,
                            overallLevel: detail.evaluation.overallLevel || detail.passLevel || '',
                        }
                        : undefined
                    loadSession({
                        id: detail.id,
                        mode: detail.mode,
                        interviewRound: detail.interviewRound,
                        questions: detail.questions || [],
                        answers: detail.answers || [],
                        evaluation: enrichedEvaluation,
                        transcriptText: detail.transcriptText,
                        status: detail.status,
                    })
                }}
            />
        </div>
    )
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes.buffer
}

export default InterviewPrepPanel
