import type { AIConfig, AIProviderMode } from './types'

const readMode = (): AIProviderMode => {
    const value = import.meta.env.VITE_AI_MODE
    if (value === 'openai-compatible') {
        return 'openai-compatible'
    }
    if (import.meta.env.VITE_DOUBAO_API_KEY) {
        return 'openai-compatible'
    }
    return 'mock'
}

export const getAIConfigFromEnv = (): AIConfig => {
    const baseUrl = import.meta.env.VITE_AI_BASE_URL
        ?? import.meta.env.VITE_DOUBAO_BASE_URL
        ?? 'https://ark.cn-beijing.volces.com/api/v3'
    const model = import.meta.env.VITE_AI_MODEL ?? import.meta.env.VITE_DOUBAO_MODEL
    const evaluateModel = import.meta.env.VITE_AI_EVALUATE_MODEL ?? import.meta.env.VITE_DOUBAO_EVALUATE_MODEL
    const apiKey = import.meta.env.VITE_AI_API_KEY ?? import.meta.env.VITE_DOUBAO_API_KEY
    const evaluateTimeoutRaw = import.meta.env.VITE_AI_EVALUATE_TIMEOUT_MS ?? import.meta.env.VITE_DOUBAO_EVALUATE_TIMEOUT_MS

    return {
        mode: readMode(),
        baseUrl,
        model,
        evaluateModel,
        apiKey,
        timeoutMs: Number(import.meta.env.VITE_AI_TIMEOUT_MS ?? 20000),
        evaluateTimeoutMs: Number(evaluateTimeoutRaw ?? 90000),
    }
}

export const validateAIConfig = (config: AIConfig): string[] => {
    const errors: string[] = []

    if (config.mode === 'openai-compatible') {
        if (!config.baseUrl) {
            errors.push('VITE_AI_BASE_URL 未配置')
        }
        if (!config.model) {
            errors.push('VITE_AI_MODEL 未配置')
        }
        if (!config.apiKey) {
            errors.push('VITE_AI_API_KEY 未配置')
        }
    }

    if (!Number.isFinite(config.timeoutMs) || (config.timeoutMs ?? 0) <= 0) {
        errors.push('VITE_AI_TIMEOUT_MS 必须是正数')
    }

    if (config.evaluateTimeoutMs !== undefined && (!Number.isFinite(config.evaluateTimeoutMs) || config.evaluateTimeoutMs <= 0)) {
        errors.push('VITE_AI_EVALUATE_TIMEOUT_MS 必须是正数')
    }

    return errors
}
