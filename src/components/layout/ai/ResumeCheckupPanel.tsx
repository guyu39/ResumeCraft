import React from 'react'
import { ShieldCheck, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react'
import type { CheckupFinding } from '@/api/ai'
import type { ModuleType, Resume } from '@/types/resume'

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
}

const moduleLabel: Record<string, string> = {
    personal: '个人信息',
    education: '教育经历',
    work: '工作经历',
    project: '项目经历',
    skills: '技能清单',
    awards: '荣誉奖项',
    summary: '自我评价',
    certificates: '证书资质',
    portfolio: '作品集',
    languages: '语言能力',
    custom: '自定义模块',
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

// ResumeCheckupPanel — 简历一致性体检面板：健康分 + 跨模块发现列表
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
    const hasResult = findings.length > 0 || healthScore !== null
    const moduleExists = (type: string) => resume.modules.some((m) => m.type === type)

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
                        onClick={onRunCheckup}
                        className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        {loading ? '体检中...' : hasResult ? '重新体检' : '开始体检'}
                    </button>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                    扫描时间线断档、技能与经历矛盾、指标冲突等跨模块一致性问题
                </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 no-scrollbar">
                {!isAuthenticated && (
                    <p className="text-xs text-amber-600">请先登录并配置 AI 服务后再使用一致性体检。</p>
                )}
                {error && <p className="text-xs text-red-600">{error}</p>}

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
                                key={`${finding.code}-${index}`}
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
                                {finding.modules.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {finding.modules.map((m) => (
                                            <button
                                                key={m}
                                                type="button"
                                                disabled={!moduleExists(m)}
                                                onClick={() => onJumpToModule(m as ModuleType)}
                                                className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-600 hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                {moduleLabel[m] ?? m}
                                            </button>
                                        ))}
                                    </div>
                                )}
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
