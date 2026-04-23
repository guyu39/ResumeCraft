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
    const apiKey = import.meta.env.VITE_AI_API_KEY ?? import.meta.env.VITE_DOUBAO_API_KEY

    return {
        mode: readMode(),
        baseUrl,
        model,
        apiKey,
    }
}

export const validateAIConfig = (config: AIConfig, providerPreset?: string): string[] => {
    const errors: string[] = []

    if (config.mode === 'openai-compatible') {
        if (!config.baseUrl) {
            if (providerPreset === 'custom') {
                errors.push('请填写 Base URL')
            }
            // else: baseUrl will be filled from preset, no error
        }
        if (!config.model) {
            errors.push('请填写模型名称')
        }
        if (!config.apiKey) {
            errors.push('请填写 API Key')
        }
    }

    return errors
}
