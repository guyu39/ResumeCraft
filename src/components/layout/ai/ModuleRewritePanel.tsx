import React, { useMemo, useState } from 'react'
import { Loader2, Wand2, Check, X, Undo2 } from 'lucide-react'
import type { Resume, ModuleType } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import { useModuleRewrite } from '@/hooks/useModuleRewrite'
import RichTextPreview from '@/components/common/RichTextPreview'

interface ModuleRewritePanelProps {
    resume: Resume
}

// items 数组模块（逐条 description）+ 单字段模块（content）
const ITEM_TYPES: ModuleType[] = ['work', 'project']
const SINGLE_TYPES: ModuleType[] = ['skills', 'summary']

type RowState =
    | { status: 'pending' }
    | { status: 'accepted'; prevText: string } // 记录原值用于撤回
    | { status: 'ignored' }

const ModuleRewritePanel: React.FC<ModuleRewritePanelProps> = ({ resume }) => {
    const updateModuleData = useResumeStore((s) => s.updateModuleData)
    const { loading, error, result, runRewrite, reset } = useModuleRewrite()

    // 可改写模块：work/project（有 items）+ skills/summary（有 content）
    const rewritableModules = useMemo(
        () => resume.modules.filter((m) => {
            if (ITEM_TYPES.includes(m.type)) return (((m.data as { items?: unknown[] }).items?.length ?? 0) > 0)
            if (SINGLE_TYPES.includes(m.type)) return !!(m.data as { content?: string }).content?.trim()
            return false
        }),
        [resume.modules],
    )

    const [selectedModuleId, setSelectedModuleId] = useState<string>(() => rewritableModules[0]?.id ?? '')
    const [jdText, setJdText] = useState('')
    const [targetTitle, setTargetTitle] = useState('')
    // 勾选要改写的条目 index（仅对 items 模块有意义；单字段模块固定 [-1]）
    const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set())
    const [rowStates, setRowStates] = useState<Record<number, RowState>>({})

    const selectedModule = rewritableModules.find((m) => m.id === selectedModuleId) ?? null
    const isItemModule = selectedModule ? ITEM_TYPES.includes(selectedModule.type) : false

    // 当前模块的可选条目列表（供勾选）
    const moduleItems = useMemo(() => {
        if (!selectedModule) return [] as { index: number; label: string; text: string }[]
        if (isItemModule) {
            const items = ((selectedModule.data as { items?: Array<Record<string, unknown>> }).items ?? [])
            return items
                .map((it, i) => ({ index: i, label: String(it.company ?? it.name ?? `条目 ${i + 1}`), text: String(it.description ?? '') }))
                .filter((it) => it.text.trim())
        }
        return [{ index: -1, label: selectedModule.title, text: String((selectedModule.data as { content?: string }).content ?? '') }]
    }, [selectedModule, isItemModule])

    const switchModule = (id: string) => {
        setSelectedModuleId(id)
        setSelectedIdx(new Set())
        setRowStates({})
        reset()
    }

    const toggleIdx = (index: number) => {
        setSelectedIdx((s) => {
            const next = new Set(s)
            if (next.has(index)) next.delete(index)
            else next.add(index)
            return next
        })
    }

    const handleRun = async () => {
        if (!selectedModule) return
        setRowStates({})
        // 构造仅含勾选条目的 content；未勾选则默认全部
        const useIdx = selectedIdx.size > 0 ? selectedIdx : new Set(moduleItems.map((i) => i.index))
        let content: Record<string, unknown>
        if (isItemModule) {
            const allItems = ((selectedModule.data as { items?: Array<Record<string, unknown>> }).items ?? [])
            // 保留原 index：用占位空 description 跳过未勾选项（后端按 description 非空抽取）
            content = {
                ...(selectedModule.data as Record<string, unknown>),
                items: allItems.map((it, i) => useIdx.has(i) ? it : { ...it, description: '' }),
            }
        } else {
            content = selectedModule.data as unknown as Record<string, unknown>
        }
        await runRewrite({
            resumeId: resume.id,
            moduleType: selectedModule.type,
            moduleInstanceId: selectedModule.id,
            content,
            jdText,
            targetTitle,
        })
    }

    // 采纳单条：写回并记录原值供撤回
    const acceptItem = (index: number, rewritten: string) => {
        if (!selectedModule) return
        let prevText = ''
        updateModuleData(selectedModule.id, (prev) => {
            if (index === -1) {
                prevText = String((prev as { content?: string }).content ?? '')
                return { content: rewritten } as never
            }
            const items = [...((prev as { items?: Array<Record<string, unknown>> }).items ?? [])]
            if (items[index]) {
                prevText = String(items[index].description ?? '')
                items[index] = { ...items[index], description: rewritten }
            }
            return { items } as never
        })
        setRowStates((s) => ({ ...s, [index]: { status: 'accepted', prevText } }))
    }

    // 撤回：恢复原值
    const undoItem = (index: number) => {
        const st = rowStates[index]
        if (!selectedModule || !st || st.status !== 'accepted') return
        const prevText = st.prevText
        updateModuleData(selectedModule.id, (prev) => {
            if (index === -1) return { content: prevText } as never
            const items = [...((prev as { items?: Array<Record<string, unknown>> }).items ?? [])]
            if (items[index]) items[index] = { ...items[index], description: prevText }
            return { items } as never
        })
        setRowStates((s) => ({ ...s, [index]: { status: 'pending' } }))
    }

    const ignoreItem = (index: number) => {
        setRowStates((s) => ({ ...s, [index]: { status: 'ignored' } }))
    }

    return (
        <div className="h-full overflow-y-auto bg-gray-50/80 px-4 py-4 no-scrollbar">
            <div className="space-y-4">
                {/* Header */}
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900">批量改写（整模块逐条）</h3>
                            <p className="mt-1 text-xs leading-relaxed text-gray-500">
                                已写好但想更出彩时用：选择模块与条目，AI 一次优化多条要点、补强成果与量化，逐条预览后采纳，可撤回。
                            </p>
                        </div>
                        {result && (
                            <button
                                type="button"
                                onClick={() => { reset(); setRowStates({}) }}
                                className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50"
                            >
                                清空
                            </button>
                        )}
                    </div>

                    <div className="mt-4 space-y-3">
                        {rewritableModules.length === 0 ? (
                            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-600">
                                暂无可改写内容，请先填写工作/项目描述、专业技能或自我评价。
                            </p>
                        ) : (
                            <>
                                <select
                                    value={selectedModuleId}
                                    onChange={(e) => switchModule(e.target.value)}
                                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
                                >
                                    {rewritableModules.map((m) => (
                                        <option key={m.id} value={m.id}>{m.title}</option>
                                    ))}
                                </select>

                                {/* 条目勾选（仅 items 模块且多于 1 条时显示） */}
                                {isItemModule && moduleItems.length > 1 && (
                                    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-2">
                                        <p className="mb-1.5 px-1 text-[11px] text-gray-400">选择要改写的条目（不选则全部）</p>
                                        <div className="space-y-1">
                                            {moduleItems.map((it) => (
                                                <label key={it.index} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-white">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIdx.has(it.index)}
                                                        onChange={() => toggleIdx(it.index)}
                                                        className="accent-primary"
                                                    />
                                                    <span className="truncate text-gray-700">{it.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <input
                                    value={targetTitle}
                                    onChange={(e) => setTargetTitle(e.target.value)}
                                    placeholder="目标岗位，可选（提升针对性）"
                                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
                                />
                                <textarea
                                    value={jdText}
                                    onChange={(e) => setJdText(e.target.value)}
                                    placeholder="粘贴目标岗位 JD，可选（让改写更贴合岗位）"
                                    className="min-h-24 w-full resize-none no-scrollbar rounded-xl border border-gray-200 px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary"
                                />
                                {error && <p className="text-xs text-red-600">{error}</p>}
                                <button
                                    type="button"
                                    disabled={loading || !selectedModule}
                                    onClick={handleRun}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                                    {loading ? '改写中...' : '开始改写'}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* 结果 diff */}
                {result && (
                    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                        <h4 className="mb-3 text-sm font-semibold text-gray-800">改写建议（{result.items.length} 条）</h4>
                        <div className="space-y-3">
                            {result.items.map((item) => {
                                const st = rowStates[item.index] ?? { status: 'pending' as const }
                                return (
                                    <div key={item.index} className={`rounded-xl border p-3 ${st.status === 'accepted' ? 'border-green-100 bg-green-50/40' : st.status === 'ignored' ? 'border-gray-100 bg-gray-50/40 opacity-60' : 'border-gray-100 bg-gray-50/60'}`}>
                                        <div className="rounded-md bg-white/70 p-2 text-[11px] text-gray-400">
                                            <RichTextPreview text={item.original} />
                                        </div>
                                        <div className="mt-2 rounded-md bg-white p-2 text-sm leading-relaxed text-gray-800">
                                            <RichTextPreview text={item.rewritten} />
                                        </div>
                                        {item.highlights?.length > 0 && (
                                            <div className="mt-1.5 flex flex-wrap gap-1">
                                                {item.highlights.map((h, i) => (
                                                    <span key={i} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{h}</span>
                                                ))}
                                            </div>
                                        )}
                                        {st.status === 'pending' && (
                                            <div className="mt-2 flex gap-2">
                                                <button type="button" onClick={() => acceptItem(item.index, item.rewritten)} className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs text-white hover:bg-primary/90">
                                                    <Check className="h-3 w-3" />采纳
                                                </button>
                                                <button type="button" onClick={() => ignoreItem(item.index)} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50">
                                                    <X className="h-3 w-3" />忽略
                                                </button>
                                            </div>
                                        )}
                                        {st.status === 'accepted' && (
                                            <div className="mt-2 flex items-center gap-2">
                                                <span className="text-xs text-green-600">已采纳</span>
                                                <button type="button" onClick={() => undoItem(item.index)} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50">
                                                    <Undo2 className="h-3 w-3" />撤回
                                                </button>
                                            </div>
                                        )}
                                        {st.status === 'ignored' && <p className="mt-2 text-xs text-gray-400">已忽略</p>}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default ModuleRewritePanel
