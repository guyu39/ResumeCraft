import { useRef, useState } from 'react'
import { aiApi } from '@/api'
import type { RichTextSuggestInput, RichTextSuggestOutput } from '@/ai'

interface AISuggestState {
    loading: boolean
    error: string | null
    data: RichTextSuggestOutput | null
    fromCache: boolean
}

const createDefaultState = (): AISuggestState => ({
    loading: false,
    error: null,
    data: null,
    fromCache: false,
})

// MD5 简化实现，用于生成内容哈希
function simpleHash(content: string): string {
    let hash = 0
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash
    }
    return Math.abs(hash).toString(16).padStart(8, '0')
}

export const useAISuggest = () => {
    const [state, setState] = useState<AISuggestState>(createDefaultState)
    const requestIdRef = useRef(0)

    const configuredMode = 'openai-compatible' // 始终使用后端模式

    const runSuggest = async (
        input: RichTextSuggestInput,
        resumeId: string = 'local'
    ): Promise<RichTextSuggestOutput | null> => {
        if (state.loading) {
            return state.data
        }

        const nextRequestId = requestIdRef.current + 1
        requestIdRef.current = nextRequestId

        // 以 fullText + selectedText 作为内容指纹
        const contentForHash = input.selectedText || input.fullText
        const contentHash = simpleHash(contentForHash)

        setState((prev) => ({ ...prev, loading: true, error: null }))

        try {
            // 调用后端 API
            const output = await aiApi.suggest({
                resumeId,
                moduleType: input.moduleType ?? 'custom',
                moduleInstanceId: input.moduleInstanceId ?? '',
                fieldKey: input.targetPosition ?? 'content',
                content: contentForHash,
                contentHash,
            })

            if (requestIdRef.current !== nextRequestId) {
                return null
            }

            // 转换后端响应为前端格式
            const result: RichTextSuggestOutput = {
                suggestions: output.suggestions.map((s, i) => ({
                    id: `suggestion-${i}`,
                    title: `建议 ${i + 1}`,
                    reason: s.reason || '',
                    rewrite: s.content || '',
                })),
                model: output.model,
                rawText: output.rawText,
                conversationId: output.conversationId,
            }

            setState({
                loading: false,
                error: null,
                data: result,
                fromCache: output.fromCache ?? false,
            })
            return result
        } catch (error) {
            if (requestIdRef.current !== nextRequestId) {
                return null
            }
            const message = error instanceof Error ? error.message : 'AI 建议生成失败'
            setState((prev) => ({
                ...prev,
                loading: false,
                error: message,
                fromCache: false,
            }))
            return null
        }
    }

    const resetSuggest = () => {
        requestIdRef.current += 1
        setState(createDefaultState())
    }

    return {
        ...state,
        runSuggest,
        resetSuggest,
        mode: configuredMode,
    }
}