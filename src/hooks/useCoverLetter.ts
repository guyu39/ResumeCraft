import { useRef, useState } from 'react'
import { aiApi } from '@/api'
import type { CoverLetterResponse } from '@/api/ai'
import type { Resume } from '@/types/resume'

interface CoverLetterState {
    loading: boolean
    error: string | null
    result: CoverLetterResponse | null
    lastGeneratedAt: number | null
}

const createDefaultState = (): CoverLetterState => ({
    loading: false,
    error: null,
    result: null,
    lastGeneratedAt: null,
})

export const useCoverLetter = () => {
    const [state, setState] = useState<CoverLetterState>(createDefaultState)
    const requestIdRef = useRef(0)

    const generateCoverLetter = async (
        resume: Resume,
        form: { jdText?: string; jobTitle: string; companyName?: string; tone?: string; language?: string },
        snapshotVersionId?: string | null
    ): Promise<CoverLetterResponse | null> => {
        if (state.loading) {
            return state.result
        }

        const jobTitle = form.jobTitle.trim()
        if (!jobTitle) {
            setState((prev) => ({ ...prev, error: '请填写目标岗位' }))
            return null
        }
        if ((form.jdText?.length ?? 0) > 20000) {
            setState((prev) => ({ ...prev, error: 'JD 内容过长，请精简到 20000 字以内' }))
            return null
        }

        const nextRequestId = requestIdRef.current + 1
        requestIdRef.current = nextRequestId
        setState((prev) => ({ ...prev, loading: true, error: null }))

        try {
            const output = await aiApi.generateCoverLetter({
                resumeId: resume.id,
                snapshotVersionId: snapshotVersionId ?? undefined,
                content: resume as unknown as Record<string, unknown>,
                jdText: form.jdText?.trim(),
                jobTitle,
                companyName: form.companyName?.trim(),
                tone: form.tone,
                language: form.language,
            })

            if (requestIdRef.current !== nextRequestId) {
                return null
            }

            const merged: CoverLetterResponse = {
                ...output,
                jdText: form.jdText?.trim(),
                jobTitle: output.jobTitle || jobTitle,
                companyName: output.companyName || form.companyName?.trim(),
            }
            setState({
                loading: false,
                error: null,
                result: merged,
                lastGeneratedAt: Date.now(),
            })
            return merged
        } catch (error) {
            if (requestIdRef.current !== nextRequestId) {
                return null
            }
            const message = error instanceof Error ? error.message : '生成求职信失败'
            setState((prev) => ({ ...prev, loading: false, error: message }))
            return null
        }
    }

    const resetCoverLetter = () => {
        requestIdRef.current += 1
        setState(createDefaultState())
    }

    return {
        ...state,
        hasResult: Boolean(state.result),
        generateCoverLetter,
        resetCoverLetter,
    }
}
