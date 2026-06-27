import { useCallback } from 'react'
import { aiApi } from '@/api'
import type { JDScoreResponse } from '@/api/ai'
import type { Resume } from '@/types/resume'
import { useAIRequest } from './useAIRequest'
import { buildAICacheKey } from './aiCacheKey'

export const useJDScore = () => {
    const req = useAIRequest<
        [Resume, { jdText: string; targetTitle?: string; companyName?: string }, (string | null)?],
        JDScoreResponse
    >({
        defaultError: 'JD 深度评分失败',
        validate: (_resume, form) => {
            const jdText = form.jdText.trim()
            if (!jdText) return '请先粘贴岗位 JD'
            if (jdText.length > 20000) return 'JD 内容过长，请精简到 20000 字以内'
            return null
        },
        // 相同简历版本 + 相同 JD/参数 命中缓存，避免重复烧 token
        cacheKey: (resume, form, snapshotVersionId) =>
            buildAICacheKey({
                resumeId: resume.id,
                resumeUpdatedAt: resume.updatedAt,
                snapshotVersionId,
                text: form.jdText.trim(),
                extra: { title: form.targetTitle?.trim(), company: form.companyName?.trim() },
            }),
        run: async (resume, form, snapshotVersionId) => {
            const jdText = form.jdText.trim()
            const output = await aiApi.score({
                resumeId: resume.id,
                snapshotVersionId: snapshotVersionId ?? undefined,
                content: resume as unknown as Record<string, unknown>,
                jdText,
                targetTitle: form.targetTitle?.trim(),
                companyName: form.companyName?.trim(),
            })
            return {
                ...output,
                jdText: output.jdText || jdText,
                targetTitle: output.targetTitle || form.targetTitle?.trim(),
                companyName: output.companyName || form.companyName?.trim(),
            }
        },
    })

    const runScore = useCallback(
        (resume: Resume, form: { jdText: string; targetTitle?: string; companyName?: string }, snapshotVersionId?: string | null) =>
            req.execute(resume, form, snapshotVersionId),
        [req.execute],
    )

    return {
        loading: req.loading,
        error: req.error,
        result: req.result,
        lastScoredAt: req.lastAt,
        hasResult: req.hasResult,
        runScore,
        resetScore: req.reset,
    }
}
