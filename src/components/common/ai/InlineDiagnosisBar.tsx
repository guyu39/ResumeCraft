import React from 'react'
import { AlertTriangle, Lightbulb, ArrowUp, X, Loader2 } from 'lucide-react'
import type { WritingDiagnosis } from '@/api/ai'

interface InlineDiagnosisBarProps {
    diagnoses: WritingDiagnosis[]
    loading: boolean
    onDismiss: (code: string) => void
    onApplyQuickFix: (diagnosis: WritingDiagnosis) => void
}

// code → 图标/配色映射，新增诊断维度时只需在此扩展
const codeStyle: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
    duty_not_result: { icon: AlertTriangle, color: 'text-red-500' },
    missing_metrics: { icon: AlertTriangle, color: 'text-red-500' },
    weak_verb: { icon: ArrowUp, color: 'text-amber-500' },
    vague: { icon: Lightbulb, color: 'text-amber-500' },
    too_long: { icon: Lightbulb, color: 'text-gray-400' },
    passive: { icon: Lightbulb, color: 'text-gray-400' },
}

const severityRing: Record<string, string> = {
    high: 'border-red-200 bg-red-50/60',
    medium: 'border-amber-200 bg-amber-50/60',
    low: 'border-gray-200 bg-gray-50',
}

// InlineDiagnosisBar — 编辑器底部实时写作诊断浮层
const InlineDiagnosisBar: React.FC<InlineDiagnosisBarProps> = ({
    diagnoses,
    loading,
    onDismiss,
    onApplyQuickFix,
}) => {
    if (!loading && diagnoses.length === 0) return null

    return (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 bg-white px-2 py-1.5">
            {loading && (
                <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    AI 诊断中…
                </span>
            )}
            {diagnoses.map((d) => {
                const style = codeStyle[d.code] ?? { icon: Lightbulb, color: 'text-gray-400' }
                const Icon = style.icon
                return (
                    <span
                        key={d.code}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-gray-700 ${severityRing[d.severity] ?? severityRing.low}`}
                        title={d.span ? `命中：${d.span}` : undefined}
                    >
                        <Icon className={`h-3 w-3 flex-shrink-0 ${style.color}`} />
                        <span className="max-w-[220px] truncate">{d.label}</span>
                        {d.quickFix && (
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => onApplyQuickFix(d)}
                                className="ml-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/20"
                            >
                                改为「{d.quickFix}」
                            </button>
                        )}
                        <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => onDismiss(d.code)}
                            className="ml-0.5 text-gray-300 hover:text-gray-500"
                            title="忽略"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </span>
                )
            })}
        </div>
    )
}

export default InlineDiagnosisBar
