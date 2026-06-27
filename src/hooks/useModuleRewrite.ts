import { useCallback } from 'react'
import { aiApi } from '@/api'
import type { ModuleRewriteResponse } from '@/api/ai'
import { useAIRequest } from './useAIRequest'

type ModuleRewriteInput = {
    resumeId: string
    moduleType: string
    moduleInstanceId?: string
    content: Record<string, unknown>
    jdText?: string
    targetTitle?: string
    companyName?: string
}

export const useModuleRewrite = () => {
    const req = useAIRequest<[ModuleRewriteInput], ModuleRewriteResponse>({
        defaultError: '整模块改写失败',
        validate: (input) => {
            const items = (input.content?.items as unknown[]) ?? []
            if (!Array.isArray(items) || items.length === 0) return '该模块没有可改写的条目'
            return null
        },
        run: async (input) => {
            return aiApi.rewriteModule({
                resumeId: input.resumeId,
                moduleType: input.moduleType,
                moduleInstanceId: input.moduleInstanceId,
                content: input.content,
                jdText: input.jdText?.trim(),
                targetTitle: input.targetTitle?.trim(),
                companyName: input.companyName?.trim(),
            })
        },
    })

    const runRewrite = useCallback((input: ModuleRewriteInput) => req.execute(input), [req.execute])

    return {
        loading: req.loading,
        error: req.error,
        result: req.result,
        runRewrite,
        reset: req.reset,
    }
}
