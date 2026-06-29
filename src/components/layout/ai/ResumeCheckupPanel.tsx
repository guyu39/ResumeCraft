import React, { useState } from 'react'
import { ShieldCheck, AlertTriangle, RefreshCw, Loader2, Wand2, Check, Undo2, ArrowRight, Sparkles } from 'lucide-react'
import type { CheckupFinding } from '@/api/ai'
import type { ModuleType, Resume } from '@/types/resume'
import { aiApi } from '@/api'
import { useResumeStore } from '@/store/resumeStore'
import InlineError from '@/components/common/InlineError'
import {
    getFixTier,
    locateItem,
    buildDateFixPlan,
    buildFixInstruction,
    findingKey,
    moduleExists,
} from '@/utils/checkupFix'

interface ResumeCheckupPanelProps {
    resume: Resume
    loading: boolean
    streamDone: boolean
    error: string | null
    healthScore: number | null
    summary: string
    findings: CheckupFinding[]
    modelName: string | null
    isAuthenticated: boolean
    onRunCheckup: () => void
    onJumpToModule: (moduleType: ModuleType) => void
}

const codeLabel: Record<string, string> = {
    timeline_gap: '时间线断档',
    timeline_overlap: '时间线重叠',
    skill_evidence_missing: '技能无经历支撑',
    experience_skill_missing: '经历用了未列技能',
    metric_conflict: '指标前后矛盾',
    i18n_mismatch: '中英文版本不一致',
    title_mismatch: '求职意向与经历不符',
    date_format_inconsistent: '日期格式不统一',
    placeholder_content: '占位/无效内容',
    content_authenticity: '内容真实性存疑',
}

const severityStyle: Record<string, string> = {
    high: 'border-red-200 bg-red-50/60',
    medium: 'border-amber-200 bg-amber-50/60',
    low: 'border-gray-200 bg-gray-50',
}

const severityText: Record<string, string> = {
    high: '严重',
    medium: '中等',
    low: '轻微',
}

const scoreColor = (score: number): string => {
    if (score >= 85) return 'text-green-500'
    if (score >= 70) return 'text-amber-500'
    return 'text-red-500'
}

// 单条 finding 的修复状态
type FixState =
    | { status: 'idle' }
    | { status: 'rewriting' }
    | { status: 'proposed'; rewritten: string }       // LLM 改写完成，待采纳
    | { status: 'fixed'; undo: () => void }            // 已修复，可撤回
    | { status: 'failed'; message: string }

// ResumeCheckupPanel — 一致性体检面板：健康分 + 跨模块发现列表 + 一键修复闭环
const ResumeCheckupPanel: React.FC<ResumeCheckupPanelProps> = ({
    resume,
    loading,
    streamDone,
    error,
    healthScore,
    summary,
    findings,
    modelName,
    isAuthenticated,
    onRunCheckup,
    onJumpToModule,
}) => {
    const updateModuleData = useResumeStore((s) => s.updateModuleData)
    const [fixStates, setFixStates] = useState<Record<string, FixState>>({})
    const hasResult = findings.length > 0 || healthScore !== null

    const setFix = (key: string, st: FixState) => setFixStates((prev) => ({ ...prev, [key]: st }))

    // A 档：日期格式统一（纯规则，逐模块写回，可撤回）
    const handleAutoFixDate = (key: string) => {
        const plans = buildDateFixPlan(resume)
        if (plans.length === 0) {
            setFix(key, { status: 'failed', message: '未发现可统一的日期格式' })
            return
        }
        // 记录原 items 供撤回
        const prevSnapshot = plans.map((p) => ({
            moduleId: p.moduleId,
            items: (resume.modules.find((m) => m.id === p.moduleId)?.data as { items?: unknown[] }).items ?? [],
        }))
        plans.forEach((p) => updateModuleData(p.moduleId, { items: p.items } as never))
        setFix(key, {
            status: 'fixed',
            undo: () => prevSnapshot.forEach((s) => updateModuleData(s.moduleId, { items: s.items } as never)),
        })
    }

    // B 档：LLM 定向改写 → 提案
    const handleRewriteFix = async (key: string, finding: CheckupFinding) => {
        const target = locateItem(resume, finding)
        if (!target) {
            // 定位失败：降级为跳转
            const t = finding.targetModule || finding.modules[0]
            if (t) onJumpToModule(t as ModuleType)
            setFix(key, { status: 'failed', message: '无法定位到具体条目，已跳转到相关模块，请手动修改' })
            return
        }
        setFix(key, { status: 'rewriting' })
        try {
            const res = await aiApi.rewriteBullet({
                resumeId: resume.id,
                moduleType: target.moduleType,
                moduleInstanceId: target.moduleId,
                fieldKey: target.fieldKey,
                content: target.original,
                fixInstruction: buildFixInstruction(finding),
            })
            const best = res.versions[0]?.text
            if (!best) {
                setFix(key, { status: 'failed', message: '改写无有效结果' })
                return
            }
            setFix(key, { status: 'proposed', rewritten: best })
        } catch (e) {
            setFix(key, { status: 'failed', message: e instanceof Error ? e.message : '改写失败' })
        }
    }

    // 采纳改写提案 → 写回 store（按 moduleId + itemIndex），记录撤回
    const acceptProposal = (key: string, finding: CheckupFinding, rewritten: string) => {
        const target = locateItem(resume, finding)
        if (!target) {
            setFix(key, { status: 'failed', message: '原文已变化，无法采纳，请重新体检' })
            return
        }
        let prevText = ''
        updateModuleData(target.moduleId, (prev) => {
            if (target.itemIndex === -1) {
                prevText = String((prev as { content?: string }).content ?? '')
                return { content: rewritten } as never
            }
            const items = [...((prev as { items?: Array<Record<string, unknown>> }).items ?? [])]
            if (items[target.itemIndex]) {
                prevText = String(items[target.itemIndex].description ?? '')
                items[target.itemIndex] = { ...items[target.itemIndex], description: rewritten }
            }
            return { items } as never
        })
        setFix(key, {
            status: 'fixed',
            undo: () => updateModuleData(target.moduleId, (prev) => {
                if (target.itemIndex === -1) return { content: prevText } as never
                const items = [...((prev as { items?: Array<Record<string, unknown>> }).items ?? [])]
                if (items[target.itemIndex]) items[target.itemIndex] = { ...items[target.itemIndex], description: prevText }
                return { items } as never
            }),
        })
    }

    // 渲染单条 finding 的修复操作区
    const renderFixActions = (finding: CheckupFinding, index: number) => {
        const key = findingKey(finding, index)
        const st = fixStates[key] ?? { status: 'idle' as const }
        const tier = getFixTier(finding.code)

        if (st.status === 'fixed') {
            return (
                <div className="mt-2 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <Check className="h-3 w-3" />已修复
                    </span>
                    <button
                        type="button"
                        onClick={() => { st.undo(); setFix(key, { status: 'idle' }) }}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50"
                    >
                        <Undo2 className="h-3 w-3" />撤回
                    </button>
                </div>
            )
        }

        if (st.status === 'proposed') {
            return (
                <div className="mt-2 space-y-2">
                    <div className="rounded-md bg-white p-2 text-xs leading-relaxed text-gray-800">{st.rewritten}</div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => acceptProposal(key, finding, st.rewritten)}
                            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs text-white hover:bg-primary/90"
                        >
                            <Check className="h-3 w-3" />采纳
                        </button>
                        <button
                            type="button"
                            onClick={() => setFix(key, { status: 'idle' })}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50"
                        >
                            放弃
                        </button>
                    </div>
                </div>
            )
        }

        const failedMsg = st.status === 'failed' ? st.message : null

        // 按档位渲染主操作按钮
        let actionBtn: React.ReactNode = null
        if (tier === 'auto') {
            actionBtn = (
                <button
                    type="button"
                    onClick={() => handleAutoFixDate(key)}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs text-white hover:bg-primary/90"
                >
                    <Sparkles className="h-3 w-3" />一键统一
                </button>
            )
        } else if (tier === 'rewrite') {
            actionBtn = (
                <button
                    type="button"
                    disabled={!isAuthenticated || st.status === 'rewriting'}
                    onClick={() => handleRewriteFix(key, finding)}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {st.status === 'rewriting' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                    {st.status === 'rewriting' ? '修复中...' : 'AI 修复'}
                </button>
            )
        }

        // guide 档 + 所有档位都提供「去修改」跳转
        const jumpTarget = finding.targetModule || finding.modules[0]
        const jumpBtn = jumpTarget && moduleExists(resume.modules, jumpTarget) ? (
            <button
                type="button"
                onClick={() => onJumpToModule(jumpTarget as ModuleType)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600 hover:border-primary/40 hover:text-primary"
            >
                <ArrowRight className="h-3 w-3" />去修改
            </button>
        ) : null

        return (
            <div className="mt-2">
                <div className="flex flex-wrap gap-2">
                    {actionBtn}
                    {jumpBtn}
                </div>
                {failedMsg && <p className="mt-1.5 text-[11px] text-amber-600">{failedMsg}</p>}
            </div>
        )
    }

    return (
        <div className="flex h-full flex-col">
            <div className="flex-shrink-0 border-b border-gray-100 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold text-gray-800">一致性体检</span>
                    </div>
                    <button
                        type="button"
                        disabled={!isAuthenticated || loading}
                        onClick={() => { setFixStates({}); onRunCheckup() }}
                        className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        {loading ? '体检中...' : hasResult ? '重新体检' : '开始体检'}
                    </button>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                    扫描时间线断档、技能与经历矛盾、指标冲突等跨模块一致性问题，可一键修复
                </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 no-scrollbar">
                {!isAuthenticated && (
                    <p className="text-xs text-amber-600">请先登录并配置 AI 服务后再使用一致性体检。</p>
                )}
                {error && <InlineError message={error} />}

                {!hasResult && !loading && !error && (
                    <div className="mt-8 text-center text-sm text-gray-400">
                        点击「开始体检」，AI 将全面扫描简历的一致性问题
                    </div>
                )}

                {healthScore !== null && (
                    <div className="flex items-center gap-4 rounded-xl border border-gray-100 p-4">
                        <div className={`text-4xl font-bold ${scoreColor(healthScore)}`}>{healthScore}</div>
                        <div className="flex-1">
                            <p className="text-xs font-medium text-gray-500">一致性健康分</p>
                            {summary && <p className="mt-1 text-xs leading-relaxed text-gray-700">{summary}</p>}
                        </div>
                    </div>
                )}

                {loading && !streamDone && findings.length === 0 && (
                    <p className="mt-4 text-center text-xs text-gray-400">AI 正在分析简历一致性…</p>
                )}

                {findings.length > 0 && (
                    <div className="mt-4 space-y-2.5">
                        {findings.map((finding, index) => (
                            <div
                                key={findingKey(finding, index)}
                                className={`rounded-xl border p-3 ${severityStyle[finding.severity] ?? severityStyle.low}`}
                            >
                                <div className="flex items-center gap-2">
                                    <AlertTriangle
                                        className={`h-4 w-4 flex-shrink-0 ${finding.severity === 'high' ? 'text-red-500' : finding.severity === 'medium' ? 'text-amber-500' : 'text-gray-400'}`}
                                    />
                                    <span className="text-sm font-medium text-gray-800">
                                        {finding.title || codeLabel[finding.code] || finding.code}
                                    </span>
                                    <span className="ml-auto rounded-full bg-white/70 px-2 py-0.5 text-[10px] text-gray-500">
                                        {severityText[finding.severity] ?? finding.severity}
                                    </span>
                                </div>
                                {finding.detail && (
                                    <p className="mt-2 text-xs leading-relaxed text-gray-600">{finding.detail}</p>
                                )}
                                {finding.suggestion && (
                                    <p className="mt-1.5 text-xs leading-relaxed text-primary/80">
                                        建议：{finding.suggestion}
                                    </p>
                                )}
                                {renderFixActions(finding, index)}
                            </div>
                        ))}
                    </div>
                )}

                {hasResult && modelName && (
                    <p className="mt-4 text-right text-[11px] text-gray-400">
                        模型：{modelName}
                    </p>
                )}
            </div>
        </div>
    )
}

export default ResumeCheckupPanel
