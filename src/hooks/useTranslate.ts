// ============================================================
// useTranslate — 简历翻译 Hook
// ============================================================

import { useState, useCallback } from 'react'
import { aiApi, type TranslateRequest, type TranslateResponse } from '../api/ai'

export function useTranslate() {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<TranslateResponse | null>(null)

    const translate = useCallback(async (req: TranslateRequest) => {
        setLoading(true)
        setError(null)
        setResult(null)
        try {
            const resp = await aiApi.translate(req)
            setResult(resp)
            return resp
        } catch (err) {
            const msg = err instanceof Error ? err.message : '翻译失败，请重试'
            setError(msg)
            return null
        } finally {
            setLoading(false)
        }
    }, [])

    const reset = useCallback(() => {
        setLoading(false)
        setError(null)
        setResult(null)
    }, [])

    return { translate, reset, loading, error, result }
}
