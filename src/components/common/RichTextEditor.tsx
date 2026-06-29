// ============================================================
// RichTextEditor — Tiptap 所见即所得富文本编辑器
// 支持：加粗、斜体、下划线、链接、无序/有序列表
// ============================================================

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Bold, Italic, Sparkles, Underline as UnderlineIcon, Link2, List, ListOrdered, Wand2, Lightbulb } from 'lucide-react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useResumeStore } from '@/store/resumeStore'
import { useAuthStore } from '@/store/authStore'
import type { ModuleType } from '@/types/resume'
import AIRewritePanel from '@/components/common/ai/AIRewritePanel'
import StarGuidePanel from '@/components/common/ai/StarGuidePanel'
import InlineDiagnosisBar from '@/components/common/ai/InlineDiagnosisBar'
import { getProviderPresetById, readAIUserConfig } from '@/ai'
import { useAISuggest } from '@/hooks/useAISuggest'
import { useBulletRewrite } from '@/hooks/useBulletRewrite'
import { useStarRewrite } from '@/hooks/useStarRewrite'
import { useWritingAssistant } from '@/hooks/useWritingAssistant'
import { getAutoFixEnabled, inspectClipboardText } from '@/utils/textGuard'
import type { WritingDiagnosis } from '@/api/ai'

interface RichTextEditorProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    minRows?: number
    maxLength?: number
    className?: string
    enableAISuggest?: boolean
    aiContext?: {
        moduleType?: ModuleType
        targetPosition?: string
        moduleInstanceId?: string
    }
}

const 看起来像HTML = (text: string) => /<\/?[a-z][\s\S]*>/i.test(text)

const 转为编辑器HTML = (text: string): string => {
    if (!text.trim()) return ''
    if (看起来像HTML(text)) return text

    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    return `<p>${escaped.replace(/\n/g, '<br/>')}</p>`
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({
    value,
    onChange,
    placeholder,
    minRows = 10,
    maxLength,
    className = '',
    enableAISuggest = true,
    aiContext,
}) => {
    const resumeId = useResumeStore((state) => state.resume.id)
    const locale = useResumeStore((state) => state.resume.locale)
    const 上次合法HTML引用 = useRef<string>(转为编辑器HTML(value))
    // 追踪最近一次由编辑器 onUpdate 产出的 HTML，
    // 用于区分 value 变化来源：编辑器内部（用户打字）vs 外部注入（快照切换/AI 生成）
    const lastEditorHtml = useRef<string>('')
    const 链接输入框引用 = useRef<HTMLInputElement>(null)
    const [工具栏版本, set工具栏版本] = useState(0)
    const [链接弹窗显示, set链接弹窗显示] = useState(false)
    const [链接输入值, set链接输入值] = useState('https://')
    const [AI改写面板显示, setAI改写面板显示] = useState(false)
    const [Bullet重写JD, setBullet重写JD] = useState('')
    const [Bullet重写目标岗位, setBullet重写目标岗位] = useState('')
    const [Bullet重写公司, setBullet重写公司] = useState('')
    const [STAR面板显示, setSTAR面板显示] = useState(false)
    const [STAR场景, setSTAR场景] = useState('')
    const [剪贴板提示, set剪贴板提示] = useState<string | null>(null)
    const 提示定时器引用 = useRef<number | null>(null)
    const Bullet重写选区引用 = useRef<{ from: number; to: number } | null>(null)
    const [上次Bullet重写输入, set上次Bullet重写输入] = useState<{
        fullText: string
        selectedText: string
    } | null>(null)
    const [上次建议输入, set上次建议输入] = useState<{
        fullText: string
        selectedText?: string
        moduleType?: ModuleType
        targetPosition?: string
    } | null>(null)
    const { loading: AI建议加载中, error: AI建议错误, data: AI建议结果, fromCache, runSuggest, resetSuggest, mode } = useAISuggest()
    const {
        loading: Bullet重写加载中,
        error: Bullet重写错误,
        data: Bullet重写结果,
        runRewrite,
        resetRewrite,
    } = useBulletRewrite()
    const {
        analyzing: STAR分析中,
        generating: STAR生成中,
        error: STAR错误,
        dimensions: STAR维度,
        generatedHtml: STAR生成结果,
        model: STAR模型,
        analyze: 运行STAR分析,
        generate: 运行STAR生成,
        reset: 重置STAR,
    } = useStarRewrite()
    const {
        enabled: 写作助手开启,
        setEnabled: set写作助手开启,
        loading: 写作诊断中,
        diagnoses: 写作诊断结果,
        trigger: 触发写作诊断,
        dismiss: 忽略写作诊断,
        clear: 清空写作诊断,
    } = useWritingAssistant()
    const { isAuthenticated } = useAuthStore()
    const 编辑器高度 = Math.max(8, minRows) * 28
    const AI模式文案 = (() => {
        if (mode !== 'openai-compatible') {
            return '未接入AI'
        }
        // 优先使用实际调用的模型名
        if (AI建议结果?.model) {
            return `已接入${AI建议结果.model}`
        }

        const userConfig = readAIUserConfig()
        if (!userConfig?.providerPreset) {
            return '已接入AI'
        }

        const presetId = getProviderPresetById(userConfig.providerPreset).id
        return `已接入${presetId}`
    })()

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                link: {
                    openOnClick: false,
                    autolink: true,
                    defaultProtocol: 'https',
                },
            }),
        ],
        content: 转为编辑器HTML(value),
        onUpdate: ({ editor: instance }) => {
            const plainText = instance.getText()
            if (maxLength && plainText.length > maxLength) {
                instance.commands.setContent(上次合法HTML引用.current, { emitUpdate: false })
                return
            }

            const html = instance.getHTML()
            lastEditorHtml.current = html
            上次合法HTML引用.current = html
            onChange(html)

            // 实时写作助手：仅在启用且已登录时触发（hook 内部已做防抖 + 去重）
            if (enableAISuggest && isAuthenticated && 写作助手开启) {
                // 折叠连续空行，避免空白段落干扰诊断与触发判断
                触发写作诊断(plainText.replace(/\n[ \t]*\n+/g, '\n').trim(), {
                    resumeId,
                    moduleType: aiContext?.moduleType,
                    moduleInstanceId: aiContext?.moduleInstanceId,
                    fieldKey: aiContext?.targetPosition ?? 'content',
                })
            }
        },
        editorProps: {
            attributes: {
                class:
                    'overflow-y-auto no-scrollbar px-3 py-2 text-sm text-gray-800 outline-none ProseMirror rich-editor-content',
                style: `height: ${编辑器高度}px;`,
            },
            handlePaste: (view, event) => {
                const text = event.clipboardData?.getData('text') ?? ''
                const result = inspectClipboardText(text, getAutoFixEnabled())
                if (提示定时器引用.current) {
                    window.clearTimeout(提示定时器引用.current)
                    提示定时器引用.current = null
                }
                set剪贴板提示(result.message)
                if (result.message) {
                    提示定时器引用.current = window.setTimeout(() => set剪贴板提示(null), 1000)
                }

                if (result.nextText !== text) {
                    event.preventDefault()
                    view.dispatch(view.state.tr.insertText(result.nextText))
                    return true
                }

                return false
            },
        },
    })

    const editorReadyRef = useRef(false)

    // 挂载/重挂载时强制同步 —— tiptap 的 content 参数是劝告性的，
    // 在 React 18 StrictMode 下编辑器可能被创建-销毁-重建，初始 content 不保证生效。
    // 需要在 editor 首次就绪后显式 setContent，不做比较、直接覆盖。
    useEffect(() => {
        if (!editor) {
            editorReadyRef.current = false
            return
        }
        const next = 转为编辑器HTML(value)
        editor.commands.setContent(next, { emitUpdate: false })
        上次合法HTML引用.current = next
        editorReadyRef.current = true
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor])

    // 外部 value 变化时同步 —— 仅在 editor 就绪后生效。
    // 通过 lastEditorHtml 追踪变化来源：
    // - value 与 lastEditorHtml 相同 → 来源于编辑器内部（用户打字）→ 跳过
    // - value 不同 → 来源于外部注入（快照切换、AI 生成等）→ 强制同步
    useEffect(() => {
        if (!editor || !editorReadyRef.current) return
        const next = 转为编辑器HTML(value)
        if (value === lastEditorHtml.current) return
        editor.commands.setContent(next, { emitUpdate: false })
        上次合法HTML引用.current = next
        // 外部注入（切快照/换字段/AI 生成）时清空旧诊断，避免误标到新内容
        清空写作诊断()
    }, [editor, value])

    useEffect(() => {
        if (!editor) return

        const 刷新工具栏状态 = () => set工具栏版本((v) => v + 1)

        editor.on('selectionUpdate', 刷新工具栏状态)
        editor.on('transaction', 刷新工具栏状态)
        editor.on('focus', 刷新工具栏状态)
        editor.on('blur', 刷新工具栏状态)

        return () => {
            editor.off('selectionUpdate', 刷新工具栏状态)
            editor.off('transaction', 刷新工具栏状态)
            editor.off('focus', 刷新工具栏状态)
            editor.off('blur', 刷新工具栏状态)
        }
    }, [editor])

    useEffect(() => {
        if (!链接弹窗显示) return
        const timer = window.setTimeout(() => {
            链接输入框引用.current?.focus()
            链接输入框引用.current?.select()
        }, 0)
        return () => window.clearTimeout(timer)
    }, [链接弹窗显示])

    const 打开链接弹窗 = () => {
        if (!editor) return
        const 当前链接 = editor.getAttributes('link').href as string | undefined
        set链接输入值(当前链接 ?? 'https://')
        set链接弹窗显示(true)
    }

    const 关闭链接弹窗 = () => {
        set链接弹窗显示(false)
    }

    const 提交链接 = () => {
        if (!editor) return
        const url = 链接输入值.trim()
        if (!url) {
            editor.chain().focus().unsetLink().run()
            set链接弹窗显示(false)
            return
        }
        editor.chain().focus().setLink({ href: url }).run()
        set链接弹窗显示(false)
    }

    // 将 tiptap getText 产出的连续空行折叠为单个换行，避免多空段落累积成大段空白
    const 规整文本 = (text: string) => text.replace(/\n[ \t]*\n+/g, '\n').trim()

    const 获取编辑器文本 = () => {
        if (!editor) {
            return { fullText: '', selectedText: '' }
        }

        const fullText = 规整文本(editor.getText({ blockSeparator: '\n' }))
        const { from, to } = editor.state.selection
        const selectedText = from === to ? '' : 规整文本(editor.state.doc.textBetween(from, to, '\n'))
        return { fullText, selectedText }
    }

    const 触发AI建议 = async () => {
        if (!editor) return

        // 记录选区，供两种模式（点评建议/多版本重写）共用写回
        const { from, to } = editor.state.selection
        Bullet重写选区引用.current = { from, to }

        const { fullText, selectedText } = 获取编辑器文本()

        // 未登录：只显示面板提示，不调用后端
        if (!isAuthenticated) {
            setAI改写面板显示(true)
            return
        }

        // 如果正在加载中，直接显示面板，不打断生成过程
        if (AI建议加载中) {
            setAI改写面板显示(true)
            return
        }

        if (!fullText) {
            return
        }

        // 同步多版本重写所需的原文输入（用户切到 rewrite tab 即可直接生成）
        set上次Bullet重写输入({ fullText, selectedText })

        const suggestInput = {
            locale,
            fullText,
            selectedText,
            moduleType: aiContext?.moduleType,
            targetPosition: aiContext?.targetPosition,
            moduleInstanceId: aiContext?.moduleInstanceId,
        }
        set上次建议输入(suggestInput)
        setAI改写面板显示(true)

        await runSuggest(suggestInput, resumeId)
    }

    const 应用AI建议 = (rewrite: string) => {
        if (!editor) return
        const selection = Bullet重写选区引用.current
        const chain = editor.chain().focus()

        if (selection && selection.from !== selection.to) {
            chain.setTextSelection(selection).insertContent(rewrite).run()
        } else {
            chain.setContent(转为编辑器HTML(rewrite)).run()
        }

        setAI改写面板显示(false)
    }

    const 生成Bullet重写 = async () => {
        if (!isAuthenticated || !上次Bullet重写输入 || Bullet重写加载中) return

        const content = 上次Bullet重写输入.selectedText || 上次Bullet重写输入.fullText
        await runRewrite({
            resumeId,
            moduleType: aiContext?.moduleType ?? 'custom',
            moduleInstanceId: aiContext?.moduleInstanceId ?? '',
            fieldKey: aiContext?.targetPosition ?? 'content',
            content,
            jdText: Bullet重写JD,
            targetTitle: Bullet重写目标岗位,
            companyName: Bullet重写公司,
        })
    }

    const 应用Bullet重写 = (rewrite: string) => {
        if (!editor) return
        const selection = Bullet重写选区引用.current
        const chain = editor.chain().focus()

        if (selection && selection.from !== selection.to) {
            chain.setTextSelection(selection).insertContent(rewrite).run()
        } else {
            chain.setContent(转为编辑器HTML(rewrite)).run()
        }

        setAI改写面板显示(false)
    }

    const 关闭AI改写 = () => {
        setAI改写面板显示(false)
        resetSuggest()
        resetRewrite()
    }

    const 打开STAR改写 = () => {
        if (!editor) return
        const { fullText, selectedText } = 获取编辑器文本()
        const scenario = selectedText || fullText
        if (!scenario) return
        Bullet重写选区引用.current = editor.state.selection
            ? { from: editor.state.selection.from, to: editor.state.selection.to }
            : null
        setSTAR场景(scenario)
        重置STAR()
        setSTAR面板显示(true)
    }

    const 关闭STAR改写 = () => {
        setSTAR面板显示(false)
        重置STAR()
    }

    const 应用STAR改写 = (html: string) => {
        if (!editor) return
        const selection = Bullet重写选区引用.current
        const chain = editor.chain().focus()
        if (selection && selection.from !== selection.to) {
            chain.setTextSelection(selection).insertContent(html).run()
        } else {
            chain.setContent(转为编辑器HTML(html)).run()
        }
        setSTAR面板显示(false)
        重置STAR()
    }

    // 写作助手 quickFix：将命中的弱词替换为建议词（无 span 时不替换，仅作提示）
    const 应用写作快修 = (diagnosis: WritingDiagnosis) => {
        if (!editor || !diagnosis.quickFix || !diagnosis.span) {
            忽略写作诊断(diagnosis.code)
            return
        }
        const fullText = editor.getText()
        const idx = fullText.indexOf(diagnosis.span)
        if (idx === -1) {
            忽略写作诊断(diagnosis.code)
            return
        }
        // tiptap doc 的位置从 1 开始（doc 起始有一个虚拟位置），纯文本 idx 需 +1
        const from = idx + 1
        const to = from + diagnosis.span.length
        editor.chain().focus().setTextSelection({ from, to }).insertContent(diagnosis.quickFix).run()
        忽略写作诊断(diagnosis.code)
    }

    const 重试AI建议 = async () => {
        if (!isAuthenticated || !上次建议输入 || AI建议加载中) return
        await runSuggest({
            locale,
            ...上次建议输入,
        }, resumeId)
    }

    const 重新优化AI建议 = async () => {
        if (!isAuthenticated || !上次建议输入 || AI建议加载中) return
        await runSuggest({
            locale,
            ...上次建议输入,
        }, resumeId)
    }

    const 按钮列表 = useMemo(
        () => [
            ...(enableAISuggest
                ? [
                    {
                        key: 'ai-rewrite',
                        title: 'AI 改写（点评建议 / 多版本重写）',
                        label: AI建议加载中 || Bullet重写加载中 ? '生成中...' : 'AI 改写',
                        icon: Sparkles,
                        active: AI改写面板显示,
                        onClick: 触发AI建议,
                        disabled: AI建议加载中 || Bullet重写加载中,
                    },
                    {
                        key: 'star-rewrite',
                        title: 'STAR 引导改写',
                        label: STAR分析中 || STAR生成中 ? '处理中...' : 'STAR',
                        icon: Wand2,
                        active: STAR面板显示,
                        onClick: 打开STAR改写,
                        disabled: STAR分析中 || STAR生成中,
                    },
                    {
                        key: 'writing-assistant',
                        title: 写作助手开启 ? '实时建议：开（点击关闭）' : '实时建议：关（点击开启）',
                        label: 写作助手开启 ? '实时建议' : '实时建议',
                        icon: Lightbulb,
                        active: 写作助手开启,
                        onClick: () => set写作助手开启(!写作助手开启),
                    },
                ]
                : []),
            {
                key: 'bold',
                title: '加粗（Ctrl/Cmd + B）',
                icon: Bold,
                active: editor?.isActive('bold') ?? false,
                onClick: () => editor?.chain().focus().toggleBold().run(),
            },
            {
                key: 'italic',
                title: '斜体（Ctrl/Cmd + I）',
                icon: Italic,
                active: editor?.isActive('italic') ?? false,
                onClick: () => editor?.chain().focus().toggleItalic().run(),
            },
            {
                key: 'underline',
                title: '下划线（Ctrl/Cmd + U）',
                icon: UnderlineIcon,
                active: editor?.isActive('underline') ?? false,
                onClick: () => editor?.chain().focus().toggleUnderline().run(),
            },
            {
                key: 'link',
                title: '插入链接（Ctrl/Cmd + K）',
                icon: Link2,
                active: editor?.isActive('link') ?? false,
                onClick: 打开链接弹窗,
            },
            {
                key: 'bullet',
                title: '无序列表（Ctrl/Cmd + Shift + 8）',
                icon: List,
                active: editor?.isActive('bulletList') ?? false,
                onClick: () => editor?.chain().focus().toggleBulletList().run(),
            },
            {
                key: 'ordered',
                title: '有序列表（Ctrl/Cmd + Shift + 7）',
                icon: ListOrdered,
                active: editor?.isActive('orderedList') ?? false,
                onClick: () => editor?.chain().focus().toggleOrderedList().run(),
            },
        ],
        [editor, 工具栏版本, enableAISuggest, AI建议加载中, AI改写面板显示, Bullet重写加载中, STAR分析中, STAR生成中, STAR面板显示, 写作助手开启]
    )

    return (
        <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100 bg-gray-50 overflow-x-auto no-scrollbar flex-nowrap">
                {按钮列表.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        title={item.title}
                        disabled={Boolean(item.disabled)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={item.onClick}
                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors disabled:cursor-not-allowed disabled:opacity-60 flex-shrink min-w-0 ${item.active
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-gray-100 text-gray-700'
                            }`}
                    >
                        <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
                        {'label' in item && <span className="truncate">{item.label}</span>}
                    </button>
                ))}
            </div>

            <div className={`relative ${className}`}>
                <EditorContent editor={editor} />
                {editor?.isEmpty && (
                    <p className="pointer-events-none absolute left-3 top-2 text-sm text-gray-300 select-none">
                        {placeholder}
                    </p>
                )}
            </div>
            {enableAISuggest && isAuthenticated && 写作助手开启 && (
                <InlineDiagnosisBar
                    diagnoses={写作诊断结果}
                    loading={写作诊断中}
                    onDismiss={忽略写作诊断}
                    onApplyQuickFix={应用写作快修}
                />
            )}
            {剪贴板提示 && (
                <p className="px-3 pb-2 text-[12px] text-amber-600">
                    {剪贴板提示}
                </p>
            )}

            {链接弹窗显示 && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4">
                    <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
                        <h4 className="text-sm font-semibold text-gray-800">设置链接</h4>
                        <p className="mt-1 text-xs text-gray-500">留空可清除当前链接</p>

                        <input
                            ref={链接输入框引用}
                            type="text"
                            value={链接输入值}
                            onChange={(event) => set链接输入值(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault()
                                    提交链接()
                                }
                                if (event.key === 'Escape') {
                                    event.preventDefault()
                                    关闭链接弹窗()
                                }
                            }}
                            className="mt-3 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-primary/30"
                            placeholder="https://example.com"
                        />

                        <div className="mt-3 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={关闭链接弹窗}
                                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                onClick={提交链接}
                                className="rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90"
                            >
                                确认
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <AIRewritePanel
                open={AI改写面板显示}
                isAuthenticated={isAuthenticated}
                onClose={关闭AI改写}
                suggestions={AI建议结果?.suggestions ?? []}
                suggestLoading={AI建议加载中}
                suggestError={AI建议错误}
                modeLabel={AI模式文案}
                fromCache={fromCache}
                originalContent={上次建议输入?.fullText}
                resumeId={resumeId}
                moduleType={aiContext?.moduleType}
                fieldKey={aiContext?.targetPosition}
                moduleInstanceId={aiContext?.moduleInstanceId}
                conversationId={AI建议结果?.conversationId}
                onApplySuggestion={应用AI建议}
                onRetrySuggest={重试AI建议}
                onRefreshSuggest={重新优化AI建议}
                bulletData={Bullet重写结果}
                bulletLoading={Bullet重写加载中}
                bulletError={Bullet重写错误}
                rewriteContentPreview={上次Bullet重写输入?.selectedText || 上次Bullet重写输入?.fullText || ''}
                rewriteHasSelection={Boolean(上次Bullet重写输入?.selectedText)}
                jdText={Bullet重写JD}
                targetTitle={Bullet重写目标岗位}
                companyName={Bullet重写公司}
                onJdTextChange={setBullet重写JD}
                onTargetTitleChange={setBullet重写目标岗位}
                onCompanyNameChange={setBullet重写公司}
                onGenerateBullet={生成Bullet重写}
                onApplyBullet={应用Bullet重写}
            />

            <StarGuidePanel
                open={STAR面板显示}
                scenario={STAR场景}
                analyzing={STAR分析中}
                generating={STAR生成中}
                error={STAR错误}
                dimensions={STAR维度}
                generatedHtml={STAR生成结果}
                model={STAR模型}
                isAuthenticated={isAuthenticated}
                onClose={关闭STAR改写}
                onAnalyze={() => 运行STAR分析(STAR场景)}
                onGenerate={(supplements) => 运行STAR生成(STAR场景, supplements)}
                onApply={应用STAR改写}
            />
        </div>
    )
}

export default RichTextEditor
