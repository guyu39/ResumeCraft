import { useRef, useState } from 'react'
import { aiApi } from '@/api'
import type { ResumeEvaluateOutput } from '@/ai'
import type { Resume } from '@/types/resume'

interface ResumeEvaluationState {
    loading: boolean
    streamDone: boolean
    error: string | null
    result: ResumeEvaluateOutput | null
    streamText: string
    modelName: string | null
    lastEvaluatedAt: number | null
    evaluatedResumeUpdatedAt: number | null
}

const createDefaultState = (): ResumeEvaluationState => ({
    loading: false,
    streamDone: false,
    error: null,
    result: null,
    streamText: '',
    modelName: null,
    lastEvaluatedAt: null,
    evaluatedResumeUpdatedAt: null,
})

export const useResumeEvaluation = () => {
    const [state, setState] = useState<ResumeEvaluationState>(createDefaultState)
    const requestIdRef = useRef(0)

    const configuredMode = 'openai-compatible' // 始终使用后端模式

    const runEvaluate = async (resume: Resume): Promise<ResumeEvaluateOutput | null> => {
        if (state.loading) {
            return state.result
        }

        const nextRequestId = requestIdRef.current + 1
        requestIdRef.current = nextRequestId

        setState((prev) => ({ ...prev, loading: true, streamDone: false, error: null, streamText: '' }))

        try {
            // 调用后端流式 API
            const output = await aiApi.evaluateStream(
                {
                    resumeId: resume.id,
                    content: resume as unknown as Record<string, unknown>,
                },
                (partial) => {
                    // 累积原始文本用于显示思考过程
                    if (partial.raw) {
                        setState((prev) => ({ ...prev, streamText: partial.raw as string }))
                    }
                    // 更新模型名称
                    if (partial.model) {
                        setState((prev) => ({ ...prev, modelName: partial.model ?? null }))
                    }
                    // AI 输出结束，停止计时器显示
                    if (partial.finish) {
                        setState((prev) => ({ ...prev, streamDone: true }))
                    }
                }
            )

            if (requestIdRef.current !== nextRequestId) {
                return null
            }

            const lastEvaluatedAt = Date.now()
            const evaluatedResumeUpdatedAt = resume.updatedAt

            // 转换为 ResumeEvaluateOutput 格式
            const result: ResumeEvaluateOutput = {
                overallScore: output.overallScore,
                level: output.level,
                summary: output.summary,
                dimensions: output.dimensions,
                issues: output.issues.map((issue) => ({
                    ...issue,
                    severity: issue.severity as 'high' | 'medium' | 'low',
                })),
                actionItems: output.actionItems,
                reasoningSteps: output.reasoningSteps,
                rawText: output.rawText,
                model: output.model,
                conversationId: output.conversationId,
            }

            setState({
                loading: false,
                streamDone: false,
                error: null,
                result,
                streamText: '',
                modelName: output.model,
                lastEvaluatedAt,
                evaluatedResumeUpdatedAt,
            })
            return result
        } catch (error) {
            if (requestIdRef.current !== nextRequestId) {
                return null
            }

            const message = error instanceof Error ? error.message : 'AI 评估失败'
            setState((prev) => ({
                ...prev,
                loading: false,
                streamDone: false,
                error: message,
            }))
            return null
        }
    }

    const resetEvaluate = () => {
        requestIdRef.current += 1
        setState(createDefaultState())
    }

    return {
        ...state,
        hasResult: Boolean(state.result),
        runEvaluate,
        resetEvaluate,
        mode: configuredMode,
    }
}
