import JSZip from 'jszip'

/**
 * 从 .docx 文件中提取纯文本
 *
 * .docx 实际上是一个 ZIP 包，包含 word/document.xml
 * <w:t> 节点是文本内容，<w:p> 是段落，<w:br/> 是换行
 *
 * 本函数：
 *  1. 用 JSZip 解压 docx
 *  2. 读取 word/document.xml
 *  3. 按 <w:p> 切分段落，每段内拼接所有 <w:t> 节点
 *  4. 段落之间用 \n 连接
 */
export async function extractTextFromDocx(file: File): Promise<string> {
    const zip = await JSZip.loadAsync(file)
    const documentXml = zip.file('word/document.xml')
    if (!documentXml) {
        throw new Error('文件结构异常：缺少 word/document.xml')
    }

    const xmlText = await documentXml.async('string')

    // 用 DOMParser 解析 XML
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlText, 'application/xml')

    const parserError = doc.querySelector('parsererror')
    if (parserError) {
        throw new Error('XML 解析失败')
    }

    // 优先按 <w:p> 段落切分
    const paragraphs = doc.getElementsByTagNameNS('*', 'p')
    if (paragraphs.length === 0) {
        // 兜底：直接抓所有 <w:t>
        const textNodes = doc.getElementsByTagNameNS('*', 't')
        const parts: string[] = []
        for (let i = 0; i < textNodes.length; i++) {
            parts.push(textNodes[i].textContent || '')
        }
        return parts.join('').trim()
    }

    const lines: string[] = []
    for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i]
        // 段内文本：拼接所有 <w:t>，遇到 <w:br/> 插入换行
        const texts = p.getElementsByTagNameNS('*', 't')
        let line = ''
        for (let j = 0; j < texts.length; j++) {
            line += texts[j].textContent || ''
        }
        // 处理软换行 <w:br/>
        const breaks = p.getElementsByTagNameNS('*', 'br')
        if (breaks.length > 0 && line) {
            // 段内有 <w:br/> 时，每个 br 后面也算换行（简化处理）
            line = line.replace(/\n+$/, '')
        }
        lines.push(line)
    }

    // 移除多余空行（连续 3 个以上空行压成 1 个）
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * 判断文件名是否为 .docx
 */
export function isDocxFile(file: File): boolean {
    const name = file.name.toLowerCase()
    return name.endsWith('.docx')
}
