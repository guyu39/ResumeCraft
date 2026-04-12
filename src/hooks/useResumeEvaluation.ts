import { useMemo, useRef, useState } from 'react'
import { createAIProvider, readAIUserConfig, resolveAIConfig, toAIConfigOverride, validateAIConfig } from '@/ai'
import type { ResumeEvaluateOutput } from '@/ai'
import type { Resume } from '@/types/resume'

const EVALUATION_CACHE_KEY = 'resumecraft_ai_evaluation_cache_v1'

interface ResumeEvaluationCacheRecord {
    result: ResumeEvaluateOutput
    lastEvaluatedAt: number
    evaluatedResumeUpdatedAt: number
}

type ResumeEvaluationCacheMap = Record<string, ResumeEvaluationCacheRecord>

const readEvaluationCacheMap = (): ResumeEvaluationCacheMap => {
    try {
        const raw = localStorage.getItem(EVALUATION_CACHE_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw) as ResumeEvaluationCacheMap
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

const writeEvaluationCacheMap = (map: ResumeEvaluationCacheMap): void => {
    localStorage.setItem(EVALUATION_CACHE_KEY, JSON.stringify(map))
}

const readEvaluationCache = (resumeId: string): ResumeEvaluationCacheRecord | null => {
    const map = readEvaluationCacheMap()
    return map[resumeId] ?? null
}

const writeEvaluationCache = (resumeId: string, record: ResumeEvaluationCacheRecord): void => {
    const map = readEvaluationCacheMap()
    map[resumeId] = record
    writeEvaluationCacheMap(map)
}

interface ResumeEvaluationState {
    loading: boolean
    error: string | null
    result: ResumeEvaluateOutput | null
    streamText: string
    lastEvaluatedAt: number | null
    evaluatedResumeUpdatedAt: number | null
}

const createDefaultState = (): ResumeEvaluationState => ({
    loading: false,
    error: null,
    result: null,
    streamText: '',
    lastEvaluatedAt: null,
    evaluatedResumeUpdatedAt: null,
})

export const useResumeEvaluation = () => {
    const [state, setState] = useState<ResumeEvaluationState>(createDefaultState)
    const requestIdRef = useRef(0)

    const configuredMode = useMemo(() => {
        const userConfig = readAIUserConfig()
        return userConfig?.mode ?? 'not-configured'
    }, [state.loading, state.error, state.result])

    const runEvaluate = async (resume: Resume, options?: { force?: boolean }): Promise<ResumeEvaluateOutput | null> => {
        const force = Boolean(options?.force)

        if (state.loading) {
            return state.result
        }

        if (!force) {
            const cached = readEvaluationCache(resume.id)
            if (cached) {
                setState((prev) => ({
                    ...prev,
                    loading: false,
                    error: null,
                    result: cached.result,
                    streamText: '',
                    lastEvaluatedAt: cached.lastEvaluatedAt,
                    evaluatedResumeUpdatedAt: cached.evaluatedResumeUpdatedAt,
                }))
                return cached.result
            }
        }

        const nextRequestId = requestIdRef.current + 1
        requestIdRef.current = nextRequestId

        const userConfig = readAIUserConfig()
        if (!userConfig) {
            setState((prev) => ({
                ...prev,
                loading: false,
                error: '未接入AI，请先在设置中完成配置',
                result: null,
            }))
            return null
        }

        const config = resolveAIConfig(toAIConfigOverride(userConfig))
        const errors = validateAIConfig(config)
        if (errors.length > 0) {
            setState((prev) => ({
                ...prev,
                loading: false,
                error: `AI 配置不完整：${errors.join('；')}`,
                result: null,
            }))
            return null
        }

        const provider = createAIProvider(toAIConfigOverride(userConfig))

        setState((prev) => ({ ...prev, loading: true, error: null, streamText: '' }))

        try {
            const output = await provider.evaluateResume({
                locale: resume.locale,
                resume,
            }, {
                onMessage: (chunk) => {
                    if (requestIdRef.current !== nextRequestId) return
                    setState((prev) => ({
                        ...prev,
                        streamText: `${prev.streamText}${chunk}`,
                    }))
                },
            })

            if (requestIdRef.current !== nextRequestId) {
                return null
            }

            const lastEvaluatedAt = Date.now()
            const evaluatedResumeUpdatedAt = resume.updatedAt
            writeEvaluationCache(resume.id, {
                result: output,
                lastEvaluatedAt,
                evaluatedResumeUpdatedAt,
            })

            setState({
                loading: false,
                error: null,
                result: output,
                streamText: '',
                lastEvaluatedAt,
                evaluatedResumeUpdatedAt,
            })
            return output
        } catch (error) {
            if (requestIdRef.current !== nextRequestId) {
                return null
            }

            const message = error instanceof Error ? error.message : 'AI 评估失败'
            setState((prev) => ({
                ...prev,
                loading: false,
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
