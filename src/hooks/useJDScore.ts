import { useRef, useState } from 'react'
import { aiApi } from '@/api'
import type { JDScoreResponse } from '@/api/ai'
import type { Resume } from '@/types/resume'

interface JDScoreState {
    loading: boolean
    error: string | null
    result: JDScoreResponse | null
    lastScoredAt: number | null
}

const createDefaultState = (): JDScoreState => ({
    loading: false,
    error: null,
    result: null,
    lastScoredAt: null,
})

export const useJDScore = () => {
    const [state, setState] = useState<JDScoreState>(createDefaultState)
    const requestIdRef = useRef(0)

    const runScore = async (
        resume: Resume,
        form: { jdText: string; targetTitle?: string; companyName?: string }
    ): Promise<JDScoreResponse | null> => {
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
        setState((prev) => ({ ...prev, loading: true, error: null }))

        try {
            const output = await aiApi.score({
                resumeId: resume.id,
                content: resume as unknown as Record<string, unknown>,
                jdText,
                targetTitle: form.targetTitle?.trim(),
                companyName: form.companyName?.trim(),
            })

            if (requestIdRef.current !== nextRequestId) {
                return null
            }

            const merged: JDScoreResponse = {
                ...output,
                jdText: output.jdText || jdText,
                targetTitle: output.targetTitle || form.targetTitle?.trim(),
                companyName: output.companyName || form.companyName?.trim(),
            }
            setState({
                loading: false,
                error: null,
                result: merged,
                lastScoredAt: Date.now(),
            })
            return merged
        } catch (error) {
            if (requestIdRef.current !== nextRequestId) {
                return null
            }
            const message = error instanceof Error ? error.message : 'JD 深度评分失败'
            setState((prev) => ({ ...prev, loading: false, error: message }))
            return null
        }
    }

    const resetScore = () => {
        requestIdRef.current += 1
        setState(createDefaultState())
    }

    return {
        ...state,
        hasResult: Boolean(state.result),
        runScore,
        resetScore,
    }
}
