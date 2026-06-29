import { useRef, useState } from 'react'
import { aiApi } from '@/api'
import type { CheckupFinding, ResumeCheckupResponse } from '@/api/ai'
import type { Resume } from '@/types/resume'

interface ResumeCheckupState {
    loading: boolean
    streamDone: boolean
    error: string | null
    healthScore: number | null
    summary: string
    findings: CheckupFinding[]
    modelName: string | null
    conversationId: string | null
    lastCheckedAt: number | null
}

const createDefaultState = (): ResumeCheckupState => ({
    loading: false,
    streamDone: false,
    error: null,
    healthScore: null,
    summary: '',
    findings: [],
    modelName: null,
    conversationId: null,
    lastCheckedAt: null,
})

/**
 * 简历一致性体检：跨模块流式扫描，边收边渲染。
 * contentAlt 为另一 locale 副本，存在时启用中英一致性检查。
 */
export const useResumeCheckup = () => {
    const [state, setState] = useState<ResumeCheckupState>(createDefaultState)
    const requestIdRef = useRef(0)

    const runCheckup = async (
        resume: Resume,
        snapshotVersionId?: string | null,
        contentAlt?: Record<string, unknown>
    ): Promise<ResumeCheckupResponse | null> => {
        if (state.loading) return null

        const nextRequestId = requestIdRef.current + 1
        requestIdRef.current = nextRequestId

        setState({
            ...createDefaultState(),
            loading: true,
        })

        try {
            const output = await aiApi.checkupStream(
                {
                    resumeId: resume.id,
                    snapshotVersionId: snapshotVersionId ?? undefined,
                    content: resume as unknown as Record<string, unknown>,
                    contentAlt,
                },
                (partial) => {
                    if (requestIdRef.current !== nextRequestId) return
                    if (partial.model) {
                        setState((prev) => ({ ...prev, modelName: partial.model ?? null }))
                    }
                    if (partial.summary !== undefined) {
                        setState((prev) => ({ ...prev, summary: partial.summary ?? '' }))
                    }
                    if (partial.healthScore !== undefined) {
                        setState((prev) => ({ ...prev, healthScore: partial.healthScore ?? null }))
                    }
                    if (partial.findings?.length) {
                        // 流式逐批追加 findings
                        setState((prev) => ({ ...prev, findings: [...prev.findings, ...(partial.findings ?? [])] }))
                    }
                    if (partial.finish) {
                        setState((prev) => ({ ...prev, streamDone: true }))
                    }
                }
            )

            if (requestIdRef.current !== nextRequestId) return null

            setState({
                loading: false,
                streamDone: false,
                error: null,
                healthScore: output.healthScore,
                summary: output.summary,
                findings: output.findings,
                modelName: output.model,
                conversationId: output.conversationId,
                lastCheckedAt: Date.now(),
            })
            return output
        } catch (error) {
            if (requestIdRef.current !== nextRequestId) return null
            const message = error instanceof Error ? error.message : 'AI 体检失败'
            setState((prev) => ({ ...prev, loading: false, streamDone: false, error: message }))
            return null
        }
    }

    const resetCheckup = () => {
        requestIdRef.current += 1
        setState(createDefaultState())
    }

    return {
        ...state,
        hasResult: state.findings.length > 0 || state.healthScore !== null,
        runCheckup,
        resetCheckup,
    }
}
