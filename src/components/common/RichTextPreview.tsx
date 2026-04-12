// ============================================================
// RichTextPreview — 轻量富文本预览（标题/文本样式/列表/链接）
// 支持语法：#、##、**加粗**、*斜体*、__下划线__、[文本](链接)、-、1.
// ============================================================

import React from 'react'
import DOMPurify from 'dompurify'

interface RichTextPreviewProps {
    text: string
    className?: string
}

const 是HTML文本 = (text: string) => /<\/?[a-z][\s\S]*>/i.test(text)

const 加粗行内文本 = (line: string): React.ReactNode[] => {
    const 节点: React.ReactNode[] = []
    const 模式 = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|__([^_]+)__)/g
    let 上一个结束 = 0
    let 匹配结果: RegExpExecArray | null

    while ((匹配结果 = 模式.exec(line)) !== null) {
        const [完整匹配, , 链接文本, 链接地址, 加粗文本, 斜体文本, 下划线文本] = 匹配结果
        const 当前开始 = 匹配结果.index

        if (当前开始 > 上一个结束) {
            节点.push(line.slice(上一个结束, 当前开始))
        }

        if (链接文本 && 链接地址) {
            节点.push(
                <a
                    key={`${当前开始}-link`}
                    href={链接地址}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline"
                >
                    {链接文本}
                </a>
            )
        } else if (加粗文本) {
            节点.push(<strong key={`${当前开始}-bold`}>{加粗文本}</strong>)
        } else if (斜体文本) {
            节点.push(<em key={`${当前开始}-italic`}>{斜体文本}</em>)
        } else if (下划线文本) {
            节点.push(<u key={`${当前开始}-underline`}>{下划线文本}</u>)
        } else {
            节点.push(完整匹配)
        }

        上一个结束 = 当前开始 + 完整匹配.length
    }

    if (上一个结束 < line.length) {
        节点.push(line.slice(上一个结束))
    }

    return 节点.length > 0 ? 节点 : [line]
}

const RichTextPreview: React.FC<RichTextPreviewProps> = ({ text, className = '' }) => {
    if (是HTML文本(text)) {
        const 安全HTML = DOMPurify.sanitize(text)
        return (
            <div
                className={`rich-preview-content ${className}`.trim()}
                dangerouslySetInnerHTML={{ __html: 安全HTML }}
            />
        )
    }

    const 行数组 = text.split(/\r?\n/)
    const 节点列表: React.ReactNode[] = []
    let i = 0

    while (i < 行数组.length) {
        const 当前行 = 行数组[i].trim()

        if (!当前行) {
            i += 1
            continue
        }

        const 无序匹配 = /^[-*]\s+(.+)$/.exec(当前行)
        const 有序匹配 = /^\d+\.\s+(.+)$/.exec(当前行)

        if (无序匹配) {
            const 条目: string[] = []
            while (i < 行数组.length) {
                const 匹配 = /^[-*]\s+(.+)$/.exec(行数组[i].trim())
                if (!匹配) break
                条目.push(匹配[1])
                i += 1
            }
            节点列表.push(
                <ul key={`ul-${i}`} className="list-disc pl-4">
                    {条目.map((条目文本, idx) => (
                        <li key={idx}>{加粗行内文本(条目文本)}</li>
                    ))}
                </ul>
            )
            continue
        }

        if (有序匹配) {
            const 条目: string[] = []
            while (i < 行数组.length) {
                const 匹配 = /^\d+\.\s+(.+)$/.exec(行数组[i].trim())
                if (!匹配) break
                条目.push(匹配[1])
                i += 1
            }
            节点列表.push(
                <ol key={`ol-${i}`} className="list-decimal pl-4">
                    {条目.map((条目文本, idx) => (
                        <li key={idx}>{加粗行内文本(条目文本)}</li>
                    ))}
                </ol>
            )
            continue
        }

        const 二级标题 = /^##\s+(.+)$/.exec(当前行)
        if (二级标题) {
            节点列表.push(
                <h4 key={`h4-${i}`} className="font-semibold text-[9.8pt]">
                    {加粗行内文本(二级标题[1])}
                </h4>
            )
            i += 1
            continue
        }

        const 一级标题 = /^#\s+(.+)$/.exec(当前行)
        if (一级标题) {
            节点列表.push(
                <h3 key={`h3-${i}`} className="font-semibold text-[10.5pt]">
                    {加粗行内文本(一级标题[1])}
                </h3>
            )
            i += 1
            continue
        }

        节点列表.push(
            <p key={`p-${i}`} className="leading-relaxed">
                {加粗行内文本(当前行)}
            </p>
        )
        i += 1
    }

    return <div className={`rich-preview-content ${className}`.trim()}>{节点列表}</div>
}

export default RichTextPreview
