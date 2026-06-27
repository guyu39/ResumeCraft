import { useCallback } from 'react'
import { aiApi } from '@/api'
import type { CoverLetterResponse } from '@/api/ai'
import type { Resume } from '@/types/resume'
import { useAIRequest } from './useAIRequest'
import { buildAICacheKey } from './aiCacheKey'

type CoverLetterForm = { jdText?: string; jobTitle: string; companyName?: string; tone?: string; language?: string }

export const useCoverLetter = () => {
    const req = useAIRequest<[Resume, CoverLetterForm, (string | null)?], CoverLetterResponse>({
        defaultError: '生成求职信失败',
        validate: (_resume, form) => {
            if (!form.jobTitle.trim()) return '请填写目标岗位'
            if ((form.jdText?.length ?? 0) > 20000) return 'JD 内容过长，请精简到 20000 字以内'
            return null
        },
        cacheKey: (resume, form, snapshotVersionId) =>
            buildAICacheKey({
                resumeId: resume.id,
                resumeUpdatedAt: resume.updatedAt,
                snapshotVersionId,
                text: form.jdText?.trim() ?? '',
                extra: {
                    job: form.jobTitle.trim(),
                    company: form.companyName?.trim(),
                    tone: form.tone,
                    lang: form.language,
                },
            }),
        run: async (resume, form, snapshotVersionId) => {
            const jobTitle = form.jobTitle.trim()
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
            return {
                ...output,
                jdText: form.jdText?.trim(),
                jobTitle: output.jobTitle || jobTitle,
                companyName: output.companyName || form.companyName?.trim(),
            }
        },
    })

    const generateCoverLetter = useCallback(
        (resume: Resume, form: CoverLetterForm, snapshotVersionId?: string | null) =>
            req.execute(resume, form, snapshotVersionId),
        [req.execute],
    )

    return {
        loading: req.loading,
        error: req.error,
        result: req.result,
        lastGeneratedAt: req.lastAt,
        hasResult: req.hasResult,
        generateCoverLetter,
        resetCoverLetter: req.reset,
    }
}
