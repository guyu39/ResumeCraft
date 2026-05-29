import { useRef, useState } from 'react'
import { aiApi } from '@/api'
import type { BulletRewriteRequest, BulletRewriteResponse } from '@/api/ai'

interface BulletRewriteState {
    loading: boolean
    error: string | null
    data: BulletRewriteResponse | null
}

const createDefaultState = (): BulletRewriteState => ({
    loading: false,
    error: null,
    data: null,
})

export const useBulletRewrite = () => {
    const [state, setState] = useState<BulletRewriteState>(createDefaultState)
    const requestIdRef = useRef(0)

    const runRewrite = async (input: BulletRewriteRequest): Promise<BulletRewriteResponse | null> => {
        if (state.loading) {
            return state.data
        }

        const nextRequestId = requestIdRef.current + 1
        requestIdRef.current = nextRequestId

        setState((prev) => ({ ...prev, loading: true, error: null }))

        try {
            const output = await aiApi.rewriteBullet({
                ...input,
                content: input.content.trim(),
                jdText: input.jdText?.trim(),
                targetTitle: input.targetTitle?.trim(),
                companyName: input.companyName?.trim(),
            })

            if (requestIdRef.current !== nextRequestId) {
                return null
            }

            setState({
                loading: false,
                error: null,
                data: output,
            })
            return output
        } catch (error) {
            if (requestIdRef.current !== nextRequestId) {
                return null
            }
            const message = error instanceof Error ? error.message : 'Bullet 重写失败'
            setState((prev) => ({
                ...prev,
                loading: false,
                error: message,
            }))
            return null
        }
    }

    const resetRewrite = () => {
        requestIdRef.current += 1
        setState(createDefaultState())
    }

    return {
        ...state,
        runRewrite,
        resetRewrite,
    }
}
