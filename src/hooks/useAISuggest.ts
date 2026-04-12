import { useMemo, useRef, useState } from 'react'
import { createAIProvider, resolveAIConfig, toAIConfigOverride, readAIUserConfig, validateAIConfig } from '@/ai'
import type { RichTextSuggestInput, RichTextSuggestOutput } from '@/ai'

const AI_SUGGEST_CACHE_KEY = 'resumecraft_ai_suggest_cache_v1'

interface AISuggestCacheRecord {
    data: RichTextSuggestOutput
    cachedAt: number
}

type AISuggestCacheMap = Record<string, AISuggestCacheRecord>

interface AISuggestState {
    loading: boolean
    error: string | null
    data: RichTextSuggestOutput | null
}

const createDefaultState = (): AISuggestState => ({
    loading: false,
    error: null,
    data: null,
})

const readSuggestCacheMap = (): AISuggestCacheMap => {
    try {
        const raw = localStorage.getItem(AI_SUGGEST_CACHE_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw) as AISuggestCacheMap
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

const writeSuggestCacheMap = (map: AISuggestCacheMap): void => {
    localStorage.setItem(AI_SUGGEST_CACHE_KEY, JSON.stringify(map))
}

const readSuggestCache = (key: string): AISuggestCacheRecord | null => {
    const map = readSuggestCacheMap()
    return map[key] ?? null
}

const writeSuggestCache = (key: string, data: RichTextSuggestOutput): void => {
    const map = readSuggestCacheMap()
    map[key] = {
        data,
        cachedAt: Date.now(),
    }
    writeSuggestCacheMap(map)
}

const hashText = (text: string): string => {
    let hash = 0
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i)
        hash |= 0
    }
    return `${hash >>> 0}`
}

const buildSuggestInputKey = (input: RichTextSuggestInput): string => {
    const source = JSON.stringify({
        locale: input.locale,
        moduleType: input.moduleType ?? '',
        targetPosition: input.targetPosition ?? '',
        tone: input.tone ?? '',
        selectedText: input.selectedText ?? '',
        fullText: input.fullText ?? '',
    })
    return `suggest_${hashText(source)}`
}

export const useAISuggest = () => {
    const [state, setState] = useState<AISuggestState>(createDefaultState)
    const requestIdRef = useRef(0)
    const lastTriggerAtRef = useRef(0)

    const configuredMode = useMemo(() => {
        const userConfig = readAIUserConfig()
        return userConfig?.mode ?? 'not-configured'
    }, [state.loading, state.error, state.data])

    const runSuggest = async (input: RichTextSuggestInput, options?: { force?: boolean }): Promise<RichTextSuggestOutput | null> => {
        const force = Boolean(options?.force)
        const suggestInputKey = buildSuggestInputKey(input)

        if (!force) {
            const cached = readSuggestCache(suggestInputKey)
            if (cached) {
                setState({ loading: false, error: null, data: cached.data })
                return cached.data
            }
        }

        const now = Date.now()
        if (!force && now - lastTriggerAtRef.current < 800) {
            return state.data
        }
        lastTriggerAtRef.current = now

        const nextRequestId = requestIdRef.current + 1
        requestIdRef.current = nextRequestId

        const userConfig = readAIUserConfig()
        if (!userConfig) {
            setState({ loading: false, error: '未接入AI，请先在设置中完成配置', data: null })
            return null
        }

        const config = resolveAIConfig(toAIConfigOverride(userConfig))
        const errors = validateAIConfig(config)
        if (errors.length > 0) {
            setState({ loading: false, error: `AI 配置不完整：${errors.join('；')}`, data: null })
            return null
        }

        const provider = createAIProvider(toAIConfigOverride(userConfig))

        setState((prev) => ({ ...prev, loading: true, error: null }))

        try {
            const output = await provider.suggestForRichText(input)
            if (requestIdRef.current !== nextRequestId) {
                return null
            }
            writeSuggestCache(suggestInputKey, output)
            setState({ loading: false, error: null, data: output })
            return output
        } catch (error) {
            if (requestIdRef.current !== nextRequestId) {
                return null
            }
            const message = error instanceof Error ? error.message : 'AI 建议生成失败'
            setState((prev) => ({
                ...prev,
                loading: false,
                error: message,
            }))
            return null
        }
    }

    const resetSuggest = () => {
        requestIdRef.current += 1
        setState(createDefaultState())
    }

    return {
        ...state,
        runSuggest,
        resetSuggest,
        mode: configuredMode,
    }
}
