// ============================================================
// RichTextEditor — Tiptap 所见即所得富文本编辑器
// 支持：加粗、斜体、下划线、链接、无序/有序列表
// ============================================================

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Bold, Italic, Sparkles, Underline as UnderlineIcon, Link2, List, ListOrdered } from 'lucide-react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import { useResumeStore } from '@/store/resumeStore'
import type { ModuleType } from '@/types/resume'
import AISuggestionPanel from '@/components/common/ai/AISuggestionPanel'
import { getProviderPresetById, readAIUserConfig } from '@/ai'
import { useAISuggest } from '@/hooks/useAISuggest'

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
    const locale = useResumeStore((state) => state.resume.locale)
    const 上次合法HTML引用 = useRef<string>(转为编辑器HTML(value))
    const 链接输入框引用 = useRef<HTMLInputElement>(null)
    const [工具栏版本, set工具栏版本] = useState(0)
    const [链接弹窗显示, set链接弹窗显示] = useState(false)
    const [链接输入值, set链接输入值] = useState('https://')
    const [AI建议面板显示, setAI建议面板显示] = useState(false)
    const [上次建议输入, set上次建议输入] = useState<{
        fullText: string
        selectedText?: string
        moduleType?: ModuleType
        targetPosition?: string
    } | null>(null)
    const { loading: AI建议加载中, error: AI建议错误, data: AI建议结果, runSuggest, mode } = useAISuggest()
    const 编辑器高度 = Math.max(8, minRows) * 28
    const AI模式文案 = (() => {
        if (mode !== 'openai-compatible') {
            return '未接入AI'
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
            StarterKit,
            Underline,
            Link.configure({
                openOnClick: false,
                autolink: true,
                defaultProtocol: 'https',
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
            上次合法HTML引用.current = html
            onChange(html)
        },
        editorProps: {
            attributes: {
                class:
                    'overflow-y-auto no-scrollbar px-3 py-2 text-sm text-gray-800 outline-none ProseMirror rich-editor-content',
                style: `height: ${编辑器高度}px;`,
            },
        },
    })

    useEffect(() => {
        if (!editor) return
        const next = 转为编辑器HTML(value)
        if (editor.getHTML() !== next) {
            editor.commands.setContent(next, { emitUpdate: false })
            上次合法HTML引用.current = next
        }
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

    const 获取编辑器文本 = () => {
        if (!editor) {
            return { fullText: '', selectedText: '' }
        }

        const fullText = editor.getText().trim()
        const { from, to } = editor.state.selection
        const selectedText = from === to ? '' : editor.state.doc.textBetween(from, to, '\n').trim()
        return { fullText, selectedText }
    }

    const 触发AI建议 = async () => {
        if (!editor || AI建议加载中) return

        const { fullText, selectedText } = 获取编辑器文本()
        if (!fullText) {
            return
        }

        const suggestInput = {
            locale,
            fullText,
            selectedText,
            moduleType: aiContext?.moduleType,
            targetPosition: aiContext?.targetPosition,
        }
        set上次建议输入(suggestInput)
        setAI建议面板显示(true)

        const 是否与上次输入一致 = Boolean(
            上次建议输入
            && 上次建议输入.fullText === suggestInput.fullText
            && (上次建议输入.selectedText ?? '') === (suggestInput.selectedText ?? '')
            && (上次建议输入.moduleType ?? '') === (suggestInput.moduleType ?? '')
            && (上次建议输入.targetPosition ?? '') === (suggestInput.targetPosition ?? '')
        )

        if (是否与上次输入一致 && AI建议结果?.suggestions?.length) {
            return
        }

        await runSuggest(suggestInput)
    }

    const 应用AI建议 = (rewrite: string) => {
        if (!editor) return
        const { from, to } = editor.state.selection
        const chain = editor.chain().focus()

        if (from !== to) {
            chain.insertContent(rewrite).run()
        } else {
            chain.setContent(转为编辑器HTML(rewrite)).run()
        }

        setAI建议面板显示(false)
    }

    const 重试AI建议 = async () => {
        if (!上次建议输入 || AI建议加载中) return
        await runSuggest({
            locale,
            ...上次建议输入,
        })
    }

    const 重新优化AI建议 = async () => {
        if (!上次建议输入 || AI建议加载中) return
        await runSuggest({
            locale,
            ...上次建议输入,
        }, { force: true })
    }

    const 按钮列表 = useMemo(
        () => [
            ...(enableAISuggest
                ? [
                    {
                        key: 'ai-suggest',
                        title: 'AI 优化建议',
                        label: AI建议加载中 ? '生成中...' : 'AI建议',
                        icon: Sparkles,
                        active: false,
                        onClick: 触发AI建议,
                        disabled: AI建议加载中,
                    },
                ]
                : []),
            {
                key: 'bold',
                title: '加粗（Ctrl/Cmd + B）',
                label: '加粗',
                icon: Bold,
                active: editor?.isActive('bold') ?? false,
                onClick: () => editor?.chain().focus().toggleBold().run(),
            },
            {
                key: 'italic',
                title: '斜体（Ctrl/Cmd + I）',
                label: '斜体',
                icon: Italic,
                active: editor?.isActive('italic') ?? false,
                onClick: () => editor?.chain().focus().toggleItalic().run(),
            },
            {
                key: 'underline',
                title: '下划线（Ctrl/Cmd + U）',
                label: '下划线',
                icon: UnderlineIcon,
                active: editor?.isActive('underline') ?? false,
                onClick: () => editor?.chain().focus().toggleUnderline().run(),
            },
            {
                key: 'link',
                title: '插入链接（Ctrl/Cmd + K）',
                label: '链接',
                icon: Link2,
                active: editor?.isActive('link') ?? false,
                onClick: 打开链接弹窗,
            },
            {
                key: 'bullet',
                title: '无序列表（Ctrl/Cmd + Shift + 8）',
                label: '无序列表',
                icon: List,
                active: editor?.isActive('bulletList') ?? false,
                onClick: () => editor?.chain().focus().toggleBulletList().run(),
            },
            {
                key: 'ordered',
                title: '有序列表（Ctrl/Cmd + Shift + 7）',
                label: '有序列表',
                icon: ListOrdered,
                active: editor?.isActive('orderedList') ?? false,
                onClick: () => editor?.chain().focus().toggleOrderedList().run(),
            },
        ],
        [editor, 工具栏版本, enableAISuggest, AI建议加载中]
    )

    return (
        <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100 bg-gray-50">
                {按钮列表.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        title={item.title}
                        disabled={Boolean(item.disabled)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={item.onClick}
                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${item.active
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-gray-100 text-gray-700'
                            }`}
                    >
                        <item.icon className="w-3.5 h-3.5" />
                        {item.label}
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

            <AISuggestionPanel
                open={AI建议面板显示}
                suggestions={AI建议结果?.suggestions ?? []}
                loading={AI建议加载中}
                error={AI建议错误}
                modeLabel={AI模式文案}
                onApplySuggestion={应用AI建议}
                onRetry={重试AI建议}
                onRefresh={重新优化AI建议}
                onClose={() => setAI建议面板显示(false)}
            />
        </div>
    )
}

export default RichTextEditor
