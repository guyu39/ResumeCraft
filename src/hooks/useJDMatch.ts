import { useRef, useState } from 'react'
import { aiApi } from '@/api'
import type { JDMatchResponse } from '@/api/ai'
import type { Resume } from '@/types/resume'

interface JDMatchState {
    loading: boolean
    streamDone: boolean
    error: string | null
    result: JDMatchResponse | null
    modelName: string | null
    lastMatchedAt: number | null
}

const createDefaultState = (): JDMatchState => ({
    loading: false,
    streamDone: false,
    error: null,
    result: null,
    modelName: null,
    lastMatchedAt: null,
})

export const useJDMatch = () => {
    const [state, setState] = useState<JDMatchState>(createDefaultState)
    const requestIdRef = useRef(0)

    const runMatch = async (
        resume: Resume,
        form: { jdText: string; targetTitle?: string; companyName?: string }
    ): Promise<JDMatchResponse | null> => {
        if (state.loading) {
            return state.result
        }

        const jdText = form.jdText.trim()
        if (!jdText) {
            setState((prev) => ({ ...prev, error: '请先粘贴岗位 JD' }))
            return null
        }
        if (jdText.length > 20000) {
            setState((prev) => ({ ...prev, error: 'JD 内容过长，请精简到 20000 字以内' }))
            return null
        }

        const nextRequestId = requestIdRef.current + 1
        requestIdRef.current = nextRequestId
        setState((prev) => ({ ...prev, loading: true, streamDone: false, error: null }))

        try {
            const output = await aiApi.jdMatchStream(
                {
                    resumeId: resume.id,
                    content: resume as unknown as Record<string, unknown>,
                    jdText,
                    targetTitle: form.targetTitle?.trim(),
                    companyName: form.companyName?.trim(),
                },
                (partial) => {
                    if (requestIdRef.current !== nextRequestId) return
                    if (partial.model) {
                        setState((prev) => ({ ...prev, modelName: partial.model ?? null }))
                    }
                    if (partial.finish) {
                        setState((prev) => ({ ...prev, streamDone: true }))
                    }
                    setState((prev) => ({
                        ...prev,
                        result: {
                            matchScore: partial.matchScore ?? prev.result?.matchScore ?? 0,
                            level: partial.level ?? prev.result?.level ?? '',
                            summary: partial.summary ?? prev.result?.summary ?? '',
                            keywordMatches: partial.keywordMatches ?? prev.result?.keywordMatches ?? [],
                            strengths: partial.strengths ?? prev.result?.strengths ?? [],
                            gaps: partial.gaps ?? prev.result?.gaps ?? [],
                            resumeSuggestions: partial.resumeSuggestions ?? prev.result?.resumeSuggestions ?? [],
                            actionItems: partial.actionItems ?? prev.result?.actionItems ?? [],
                            targetTitle: prev.result?.targetTitle,
                            companyName: prev.result?.companyName,
                            model: partial.model ?? prev.result?.model ?? prev.modelName ?? '',
                            conversationId: prev.result?.conversationId ?? '',
                        },
                    }))
                }
            )

            if (requestIdRef.current !== nextRequestId) {
                return null
            }

            const merged: JDMatchResponse = {
                ...output,
                jdText: form.jdText,
                targetTitle: output.targetTitle || form.targetTitle?.trim(),
                companyName: output.companyName || form.companyName?.trim(),
            }
            setState({
                loading: false,
                streamDone: false,
                error: null,
                result: merged,
                modelName: output.model,
                lastMatchedAt: Date.now(),
            })
            return merged
        } catch (error) {
            if (requestIdRef.current !== nextRequestId) {
                return null
            }
            const message = error instanceof Error ? error.message : 'JD 匹配分析失败'
            setState((prev) => ({ ...prev, loading: false, streamDone: false, error: message }))
            return null
        }
    }

    const resetMatch = () => {
        requestIdRef.current += 1
        setState(createDefaultState())
    }

    return {
        ...state,
        hasResult: Boolean(state.result),
        runMatch,
        resetMatch,
    }
}
