import { useRef, useState } from 'react'
import { aiApi } from '@/api'
import type { StarDimension } from '@/api/ai'

interface StarRewriteState {
    analyzing: boolean
    generating: boolean
    error: string | null
    dimensions: StarDimension[] | null
    generatedHtml: string | null
    model: string | null
}

const createDefaultState = (): StarRewriteState => ({
    analyzing: false,
    generating: false,
    error: null,
    dimensions: null,
    generatedHtml: null,
    model: null,
})

/**
 * STAR 引导改写两阶段流程：
 * 1. analyze(scenario) — 识别原文已有/缺失的 S/T/A/R 维度
 * 2. generate(scenario, supplements) — 结合用户补充内容生成 STAR HTML
 */
export const useStarRewrite = () => {
    const [state, setState] = useState<StarRewriteState>(createDefaultState)
    const requestIdRef = useRef(0)

    const analyze = async (scenario: string): Promise<StarDimension[] | null> => {
        if (state.analyzing) return state.dimensions

        const nextRequestId = requestIdRef.current + 1
        requestIdRef.current = nextRequestId

        setState((prev) => ({ ...prev, analyzing: true, error: null, generatedHtml: null }))

        try {
            const output = await aiApi.starAnalyze({ scenario })
            if (requestIdRef.current !== nextRequestId) return null

            setState((prev) => ({
                ...prev,
                analyzing: false,
                dimensions: output.dimensions,
                model: output.model,
            }))
            return output.dimensions
        } catch (error) {
            if (requestIdRef.current !== nextRequestId) return null
            const message = error instanceof Error ? error.message : 'STAR 分析失败'
            setState((prev) => ({ ...prev, analyzing: false, error: message }))
            return null
        }
    }

    const generate = async (
        scenario: string,
        supplements?: Record<string, string>
    ): Promise<string | null> => {
        if (state.generating) return state.generatedHtml

        const nextRequestId = requestIdRef.current + 1
        requestIdRef.current = nextRequestId

        setState((prev) => ({ ...prev, generating: true, error: null }))

        try {
            const output = await aiApi.starGenerate({ scenario, supplements })
            if (requestIdRef.current !== nextRequestId) return null

            setState((prev) => ({ ...prev, generating: false, generatedHtml: output.result }))
            return output.result
        } catch (error) {
            if (requestIdRef.current !== nextRequestId) return null
            const message = error instanceof Error ? error.message : 'STAR 生成失败'
            setState((prev) => ({ ...prev, generating: false, error: message }))
            return null
        }
    }

    const reset = () => {
        requestIdRef.current += 1
        setState(createDefaultState())
    }

    return {
        ...state,
        analyze,
        generate,
        reset,
    }
}
