import { buildResumeEvaluatePrompt, buildRichTextSuggestPrompt, sanitizeAIText } from './prompts'
import type {
    AIConfig,
    AIProvider,
    AIProviderError,
    ResumeEvaluateInput,
    ResumeEvaluateOptions,
    ResumeEvaluateOutput,
    RichTextSuggestInput,
    RichTextSuggestOutput,
} from './types'

interface ResponsesApiContentItem {
    type?: string
    text?: string
}

interface ResponsesApiOutputItem {
    content?: ResponsesApiContentItem[]
}

interface ResponsesApiResponse {
    output_text?: string
    output?: ResponsesApiOutputItem[]
    error?: {
        code?: string
        message?: string
        type?: string
    }
}

interface ChatCompletionsResponse {
    choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>
    error?: {
        code?: string
        message?: string
        type?: string
    }
}

interface ModelTextResult {
    text: string
    reasoningText?: string
}

interface ResponsesRequestOptions {
    model?: string
    timeoutMs?: number
    onMessage?: (chunk: string) => void
}

interface SSEEventPayload {
    data: string
}

const createProviderError = (
    message: string,
    code: AIProviderError['code'],
    status?: number,
): AIProviderError => {
    const error = new Error(message) as AIProviderError
    error.code = code
    error.status = status
    return error
}

const extractJsonText = (raw: string): string => {
    const cleaned = sanitizeAIText(raw)
    const firstBrace = cleaned.indexOf('{')
    const lastBrace = cleaned.lastIndexOf('}')
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        throw createProviderError('模型返回内容不是合法 JSON 对象', 'PARSE_ERROR')
    }
    return cleaned.slice(firstBrace, lastBrace + 1)
}

const parseJson = <T>(raw: string): T => {
    const normalizeJsonLikeText = (input: string): string => {
        return input
            .replace(/[“”]/g, '"')
            .replace(/[‘’]/g, "'")
            .replace(/：/g, ':')
            .replace(/，/g, ',')
            .replace(/,\s*([}\]])/g, '$1')
    }

    try {
        const jsonText = extractJsonText(raw)
        try {
            return JSON.parse(jsonText) as T
        } catch {
            const normalized = normalizeJsonLikeText(jsonText)
            return JSON.parse(normalized) as T
        }
    } catch (error) {
        if ((error as AIProviderError).code === 'PARSE_ERROR') {
            throw error
        }
        throw createProviderError('解析模型响应失败', 'PARSE_ERROR')
    }
}

const toNetworkError = (error: unknown): AIProviderError => {
    if (error instanceof DOMException && error.name === 'AbortError') {
        return createProviderError('AI 请求超时', 'TIMEOUT')
    }
    if ((error as AIProviderError).code) {
        return error as AIProviderError
    }
    return createProviderError('AI 请求失败，请检查网络或配置', 'NETWORK_ERROR')
}

const mapStatusToMessage = (status: number, bodyText: string): string => {
    try {
        const payload = JSON.parse(bodyText) as ResponsesApiResponse
        const serverMessage = payload.error?.message?.trim()
        if (serverMessage) {
            return serverMessage
        }
    } catch {
        // ignore parse error
    }

    if (status === 401) {
        return '鉴权失败，请检查 API Key 是否有效'
    }
    if (status === 403) {
        return '无权限访问当前模型，请检查账号与模型权限'
    }
    if (status === 429) {
        return '请求过于频繁，请稍后重试'
    }
    return `AI 服务返回错误: ${status}`
}

const buildResponsesUrl = (baseUrl?: string): string => {
    const normalized = (baseUrl ?? '').trim().replace(/\/+$/, '')
    if (!normalized) {
        throw createProviderError('AI 服务地址为空', 'CONFIG_ERROR')
    }

    if (normalized.endsWith('/responses')) {
        return normalized
    }

    // 开发代理通常是相对路径（如 /api/ark），不应强制插入 /v1
    if (normalized.startsWith('/')) {
        return `${normalized}/responses`
    }

    if (normalized.endsWith('/v1') || normalized.endsWith('/api/v3')) {
        return `${normalized}/responses`
    }

    return `${normalized}/v1/responses`
}

const buildChatCompletionsUrl = (baseUrl?: string): string => {
    const normalized = (baseUrl ?? '').trim().replace(/\/+$/, '')
    if (!normalized) {
        throw createProviderError('AI 服务地址为空', 'CONFIG_ERROR')
    }

    if (normalized.endsWith('/chat/completions')) {
        return normalized
    }

    if (normalized.startsWith('/')) {
        return `${normalized}/chat/completions`
    }

    if (normalized.endsWith('/v1') || normalized.endsWith('/api/v3')) {
        return `${normalized}/chat/completions`
    }

    return `${normalized}/v1/chat/completions`
}

const isDeepSeekProvider = (config: AIConfig, model?: string): boolean => {
    const base = (config.baseUrl ?? '').toLowerCase()
    const modelName = (model ?? '').toLowerCase()
    return base.includes('deepseek.com') || modelName.startsWith('deepseek-')
}

const extractOutputText = (payload: ResponsesApiResponse): string => {
    if (payload.output_text && payload.output_text.trim()) {
        return payload.output_text.trim()
    }

    const textList = (payload.output ?? [])
        .flatMap((item) => item.content ?? [])
        .map((item) => item.text?.trim() ?? '')
        .filter(Boolean)

    if (textList.length === 0) {
        throw createProviderError('AI 服务未返回内容', 'PARSE_ERROR')
    }

    return textList.join('\n')
}

const readSSE = async (
    response: Response,
    onEvent: (payload: SSEEventPayload) => void,
): Promise<void> => {
    const reader = response.body?.getReader()
    if (!reader) {
        throw createProviderError('流式响应不可用', 'PARSE_ERROR')
    }

    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    const flushEventBlock = (block: string): void => {
        const lines = block.split(/\r?\n/)
        const dataLines: string[] = []

        lines.forEach((line) => {
            if (!line.trim()) return
            if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trim())
            }
        })

        if (dataLines.length === 0) return
        onEvent({ data: dataLines.join('\n') })
    }

    while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const eventBlocks = buffer.split(/\r?\n\r?\n/)
        buffer = eventBlocks.pop() ?? ''
        eventBlocks.forEach(flushEventBlock)
    }

    const finalBuffer = buffer.trim()
    if (finalBuffer) {
        flushEventBlock(finalBuffer)
    }
}

const extractStreamTextFromResponsesEvent = (payload: Record<string, unknown>): string => {
    const type = typeof payload.type === 'string' ? payload.type : ''
    if (type === 'response.output_text.delta') {
        return typeof payload.delta === 'string' ? payload.delta : ''
    }
    if (type === 'response.output_text.done') {
        return typeof payload.text === 'string' ? payload.text : ''
    }
    return ''
}

const extractStreamTextFromChatEvent = (payload: Record<string, unknown>): string => {
    const choices = Array.isArray(payload.choices) ? payload.choices : []
    const first = choices[0] as Record<string, unknown> | undefined
    const delta = (first?.delta ?? {}) as Record<string, unknown>
    return typeof delta.content === 'string' ? delta.content : ''
}

const callResponsesApi = async (config: AIConfig, prompt: string, options?: ResponsesRequestOptions): Promise<ModelTextResult> => {
    const model = options?.model ?? config.model
    const timeoutMs = options?.timeoutMs ?? 120000
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
    const url = buildResponsesUrl(config.baseUrl)

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                model,
                stream: Boolean(options?.onMessage),
                input: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
            }),
            signal: controller.signal,
        })

        if (!response.ok) {
            const bodyText = await response.text()
            const message = mapStatusToMessage(response.status, bodyText)
            if (response.status === 429) {
                throw createProviderError(message, 'RATE_LIMIT', response.status)
            }
            throw createProviderError(message, 'NETWORK_ERROR', response.status)
        }

        const contentType = (response.headers.get('content-type') ?? '').toLowerCase()

        if (options?.onMessage && contentType.includes('text/event-stream')) {
            let textBuffer = ''
            await readSSE(response, ({ data }) => {
                if (data === '[DONE]') {
                    return
                }
                try {
                    const eventPayload = JSON.parse(data) as Record<string, unknown>
                    const chunk = extractStreamTextFromResponsesEvent(eventPayload)
                    if (chunk) {
                        textBuffer += chunk
                        options.onMessage?.(chunk)
                    }
                } catch {
                    // ignore
                }
            })

            if (!textBuffer.trim()) {
                throw createProviderError('AI 服务未返回内容', 'PARSE_ERROR')
            }

            return { text: textBuffer }
        }

        const payload = (await response.json()) as ResponsesApiResponse
        return {
            text: extractOutputText(payload),
        }
    } catch (error) {
        throw toNetworkError(error)
    } finally {
        window.clearTimeout(timeout)
    }
}

const callChatCompletionsApi = async (config: AIConfig, prompt: string, options?: ResponsesRequestOptions): Promise<ModelTextResult> => {
    const model = options?.model ?? config.model
    const timeoutMs = options?.timeoutMs ?? 120000
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
    const url = buildChatCompletionsUrl(config.baseUrl)

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                model,
                stream: Boolean(options?.onMessage),
                messages: [
                    { role: 'user', content: prompt },
                ],
            }),
            signal: controller.signal,
        })

        if (!response.ok) {
            const bodyText = await response.text()
            const message = mapStatusToMessage(response.status, bodyText)
            if (response.status === 429) {
                throw createProviderError(message, 'RATE_LIMIT', response.status)
            }
            throw createProviderError(message, 'NETWORK_ERROR', response.status)
        }

        const contentType = (response.headers.get('content-type') ?? '').toLowerCase()

        if (options?.onMessage && contentType.includes('text/event-stream')) {
            let textBuffer = ''
            await readSSE(response, ({ data }) => {
                if (data === '[DONE]') {
                    return
                }
                try {
                    const eventPayload = JSON.parse(data) as Record<string, unknown>
                    const chunk = extractStreamTextFromChatEvent(eventPayload)
                    if (chunk) {
                        textBuffer += chunk
                        options.onMessage?.(chunk)
                    }
                } catch {
                    // ignore
                }
            })

            if (!textBuffer.trim()) {
                throw createProviderError('AI 服务未返回内容', 'PARSE_ERROR')
            }

            return { text: textBuffer }
        }

        const payload = (await response.json()) as ChatCompletionsResponse
        const message = payload.choices?.[0]?.message
        const content = message?.content?.trim()
        if (!content) {
            throw createProviderError('AI 服务未返回内容', 'PARSE_ERROR')
        }
        return {
            text: content,
            reasoningText: message?.reasoning_content?.trim(),
        }
    } catch (error) {
        throw toNetworkError(error)
    } finally {
        window.clearTimeout(timeout)
    }
}

const callModelApi = async (config: AIConfig, prompt: string, options?: ResponsesRequestOptions): Promise<ModelTextResult> => {
    if (isDeepSeekProvider(config, options?.model)) {
        return callChatCompletionsApi(config, prompt, options)
    }

    try {
        return await callResponsesApi(config, prompt, options)
    } catch (error) {
        const providerError = error as AIProviderError
        // 部分 OpenAI 兼容服务（如 DeepSeek）尚不支持 /responses，404 时自动回退。
        if (providerError?.status === 404) {
            return callChatCompletionsApi(config, prompt, options)
        }
        throw error
    }
}

const splitReasoningSteps = (text?: string): string[] => {
    if (!text) return []
    const lines = text
        .split(/\r?\n+/)
        .map((item) => item.trim())
        .filter(Boolean)

    if (lines.length > 0) {
        return lines.slice(0, 12)
    }

    return text
        .split(/[。！？!?；;]+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 12)
}

const parseSuggestResponse = (responseText: string): RichTextSuggestOutput => {
    const parsed = parseJson<RichTextSuggestOutput>(responseText)
    if (!Array.isArray(parsed.suggestions)) {
        throw createProviderError('AI 建议响应缺少 suggestions 数组', 'PARSE_ERROR')
    }
    return {
        suggestions: parsed.suggestions,
        rawText: responseText,
    }
}

const parseEvaluateResponse = (responseText: string): ResumeEvaluateOutput => {
    const normalizeLooseText = (input: string): string => {
        return sanitizeAIText(input)
            .replace(/：/g, ':')
            .replace(/，/g, ',')
    }

    const extractQuotedField = (text: string, fieldName: string): string | null => {
        const keyPattern = new RegExp(`["“”]${fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["“”]\\s*:`)
        const keyMatch = keyPattern.exec(text)
        if (!keyMatch) return null

        let index = (keyMatch.index ?? 0) + keyMatch[0].length
        while (index < text.length && /\s/.test(text[index])) index += 1

        const startQuote = text[index]
        const quotePairs: Record<string, string> = {
            '"': '"',
            "'": "'",
            '“': '”',
            '‘': '’',
        }
        const endQuote = quotePairs[startQuote]
        if (!endQuote) return null

        index += 1
        let escaped = false
        let result = ''
        while (index < text.length) {
            const char = text[index]
            if (startQuote === '"' && !escaped && char === '\\') {
                escaped = true
                result += char
                index += 1
                continue
            }
            if (char === endQuote && !escaped) {
                return result.replace(/\\n/g, '\n').trim()
            }
            escaped = false
            result += char
            index += 1
        }
        return result.replace(/\\n/g, '\n').trim() || null
    }

    const toSafeScore = (value: unknown, fallback = 0): number => {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return Math.max(0, Math.min(100, Math.round(value)))
        }
        return fallback
    }

    const extractArraySection = (source: string, fieldName: string): string | null => {
        const keyRegex = new RegExp(`["“”]${fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["“”]\\s*:`)
        const keyMatch = keyRegex.exec(source)
        if (!keyMatch) return null

        const start = source.indexOf('[', (keyMatch.index ?? 0) + keyMatch[0].length)
        if (start === -1) return null

        let inString = false
        let escaped = false
        let depth = 0
        for (let i = start; i < source.length; i += 1) {
            const char = source[i]
            if (inString) {
                if (escaped) {
                    escaped = false
                } else if (char === '\\') {
                    escaped = true
                } else if (char === '"') {
                    inString = false
                }
                continue
            }
            if (char === '"') {
                inString = true
                continue
            }
            if (char === '[') {
                depth += 1
                continue
            }
            if (char === ']') {
                depth -= 1
                if (depth === 0) {
                    return source.slice(start + 1, i)
                }
            }
        }
        return source.slice(start + 1)
    }

    const parseQuotedItemsFromArray = (sectionText: string): string[] => {
        const result: string[] = []
        let index = 0
        while (index < sectionText.length) {
            const start = sectionText.indexOf('"', index)
            if (start === -1) break
            index = start + 1

            let value = ''
            let escaped = false
            while (index < sectionText.length) {
                const char = sectionText[index]
                if (!escaped && char === '\\') {
                    escaped = true
                    value += char
                    index += 1
                    continue
                }
                if (!escaped && char === '"') {
                    index += 1
                    break
                }
                escaped = false
                value += char
                index += 1
            }

            const normalized = value.replace(/\\n/g, '\n').trim()
            if (normalized && normalized.length >= 6) {
                result.push(normalized)
            }
        }

        return result.slice(0, 3)
    }

    const parseObjectBlocksFromArray = (sectionText: string): string[] => {
        const blocks: string[] = []
        let inString = false
        let escaped = false
        let depth = 0
        let blockStart = -1

        for (let i = 0; i < sectionText.length; i += 1) {
            const char = sectionText[i]

            if (inString) {
                if (escaped) {
                    escaped = false
                } else if (char === '\\') {
                    escaped = true
                } else if (char === '"') {
                    inString = false
                }
                continue
            }

            if (char === '"') {
                inString = true
                continue
            }

            if (char === '{') {
                if (depth === 0) {
                    blockStart = i
                }
                depth += 1
                continue
            }

            if (char === '}') {
                depth -= 1
                if (depth === 0 && blockStart !== -1) {
                    blocks.push(sectionText.slice(blockStart, i + 1))
                    blockStart = -1
                }
            }
        }

        return blocks
    }

    const extractNumberField = (text: string, fieldName: string): number | null => {
        const escapedField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const numberMatch = text.match(
            new RegExp(`["“”]${escapedField}["“”]\\s*:\\s*(-?\\d{1,3}(?:\\.\\d+)?)`),
        )
        if (!numberMatch) {
            return null
        }
        const value = Number(numberMatch[1])
        return Number.isFinite(value) ? value : null
    }

    try {
        const parsed = parseJson<ResumeEvaluateOutput>(responseText)
        if (!Array.isArray(parsed.dimensions) || !Array.isArray(parsed.issues) || !Array.isArray(parsed.actionItems)) {
            throw createProviderError('AI 评估响应结构不完整', 'PARSE_ERROR')
        }
        return {
            ...parsed,
            rawText: responseText,
        }
    } catch {
        const text = normalizeLooseText(responseText)

        const overallScoreMatch = text.match(/"overallScore"\s*:\s*(\d{1,3})/)
        const levelMatch = text.match(/"level"\s*:\s*"([^"]+)"/)
        const summary = extractQuotedField(text, 'summary') ?? '模型返回格式不完整，已进行容错解析。'

        const dimensionBlocks = parseObjectBlocksFromArray(extractArraySection(text, 'dimensions') ?? '')
        const dimensions: ResumeEvaluateOutput['dimensions'] = dimensionBlocks
            .map((block) => {
                const key = extractQuotedField(block, 'key')
                const label = extractQuotedField(block, 'label')
                const score = extractNumberField(block, 'score')

                if (!key || !label || score === null) {
                    return null
                }

                return {
                    key,
                    label,
                    score: toSafeScore(score, 0),
                    comment: extractQuotedField(block, 'comment') ?? '暂无评论',
                }
            })
            .filter((item): item is ResumeEvaluateOutput['dimensions'][number] => item !== null)

        const issueBlocks = parseObjectBlocksFromArray(extractArraySection(text, 'issues') ?? '')
        const issues: ResumeEvaluateOutput['issues'] = issueBlocks
            .map((block, index) => {
                const severity = extractQuotedField(block, 'severity')
                const safeSeverity: ResumeEvaluateOutput['issues'][number]['severity'] =
                    severity === 'high' || severity === 'medium' || severity === 'low'
                        ? severity
                        : 'medium'
                const id = extractQuotedField(block, 'id') ?? `issue-${index + 1}`

                return {
                    id,
                    severity: safeSeverity,
                    title: extractQuotedField(block, 'title') ?? '待补充问题',
                    description: extractQuotedField(block, 'description') ?? '模型返回格式不完整，已容错提取。',
                    suggestion: extractQuotedField(block, 'suggestion') ?? '请点击重新评估获取完整建议。',
                }
            })
            .slice(0, 5)

        const actionItems = parseQuotedItemsFromArray(extractArraySection(text, 'actionItems') ?? '')

        return {
            overallScore: toSafeScore(overallScoreMatch ? Number(overallScoreMatch[1]) : null, 0),
            level: levelMatch?.[1] ?? 'C',
            summary,
            dimensions,
            issues,
            actionItems,
            rawText: responseText,
        }
    }
}

export const createOpenAICompatibleProvider = (config: AIConfig): AIProvider => {
    return {
        mode: 'openai-compatible',
        async suggestForRichText(input: RichTextSuggestInput): Promise<RichTextSuggestOutput> {
            const prompt = buildRichTextSuggestPrompt(input)
            const response = await callModelApi(config, prompt, {
                model: config.model,
            })
            const raw = response.text
            const parsed = parseSuggestResponse(raw)
            return {
                ...parsed,
                model: config.model,
            }
        },
        async evaluateResume(input: ResumeEvaluateInput, options?: ResumeEvaluateOptions): Promise<ResumeEvaluateOutput> {
            const prompt = buildResumeEvaluatePrompt(input)
            const response = await callModelApi(config, prompt, {
                model: config.model,
                onMessage: options?.onMessage,
            })
            const raw = response.text
            const parsed = parseEvaluateResponse(raw)
            const reasoningSteps = parsed.reasoningSteps && parsed.reasoningSteps.length > 0
                ? parsed.reasoningSteps
                : splitReasoningSteps(response.reasoningText)
            return {
                ...parsed,
                reasoningSteps,
                model: config.model,
            }
        },
    }
}
