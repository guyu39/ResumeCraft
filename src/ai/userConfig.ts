import type { AIConfig, AIProviderMode } from './types'

const AI_USER_CONFIG_KEY = 'resumecraft_ai_user_config_v1'

export type AIProviderPreset = 'doubao' | 'kimi' | 'minimax' | 'deepseek' | 'custom'

export interface AIProviderPresetConfig {
    id: AIProviderPreset
    label: string
    baseUrl: string
    modelPlaceholder: string
    evaluateModelPlaceholder?: string
}

export const AI_PROVIDER_PRESETS: AIProviderPresetConfig[] = [
    {
        id: 'doubao',
        label: '豆包（方舟）',
        baseUrl: '/api/ark',
        modelPlaceholder: 'doubao-seed-2-0-pro-260215',
        evaluateModelPlaceholder: 'doubao-seed-2-0-pro-260215',
    },
    {
        id: 'kimi',
        label: 'Kimi（Moonshot）',
        baseUrl: 'https://api.moonshot.cn/v1',
        modelPlaceholder: 'moonshot-v1-8k',
        evaluateModelPlaceholder: 'moonshot-v1-32k',
    },
    {
        id: 'minimax',
        label: 'MiniMax',
        baseUrl: 'https://api.minimax.chat/v1',
        modelPlaceholder: 'MiniMax-Text-01',
        evaluateModelPlaceholder: 'MiniMax-Text-01',
    },
    {
        id: 'deepseek',
        label: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1',
        modelPlaceholder: 'deepseek-chat',
        evaluateModelPlaceholder: 'deepseek-reasoner',
    },
    {
        id: 'custom',
        label: '自定义 OpenAI-Compatible',
        baseUrl: '',
        modelPlaceholder: 'your-model-name',
        evaluateModelPlaceholder: 'your-evaluate-model-name',
    },
]

const DEFAULT_PROVIDER_PRESET: AIProviderPreset = 'doubao'

const resolvePreset = (preset: AIProviderPreset): AIProviderPresetConfig => {
    return AI_PROVIDER_PRESETS.find((item) => item.id === preset) ?? AI_PROVIDER_PRESETS[0]
}

export interface AIUserConfig {
    providerPreset: AIProviderPreset
    mode: AIProviderMode
    baseUrl?: string
    model?: string
    evaluateModel?: string
    apiKey?: string
    timeoutMs?: number
    evaluateTimeoutMs?: number
}

const toNumber = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value
    }
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : undefined
    }
    return undefined
}

const normalizeMode = (value: unknown): AIProviderMode => {
    return value === 'openai-compatible' ? 'openai-compatible' : 'openai-compatible'
}

const normalizePreset = (value: unknown): AIProviderPreset => {
    if (typeof value !== 'string') return DEFAULT_PROVIDER_PRESET
    return AI_PROVIDER_PRESETS.some((item) => item.id === value)
        ? (value as AIProviderPreset)
        : DEFAULT_PROVIDER_PRESET
}

const normalizeText = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    return trimmed || undefined
}

export const readAIUserConfig = (): AIUserConfig | null => {
    try {
        const raw = localStorage.getItem(AI_USER_CONFIG_KEY)
        if (!raw) return null

        const parsed = JSON.parse(raw) as Partial<AIUserConfig>
        const providerPreset = normalizePreset(parsed.providerPreset)
        const preset = resolvePreset(providerPreset)
        return {
            providerPreset,
            mode: normalizeMode(parsed.mode),
            baseUrl: normalizeText(parsed.baseUrl) ?? preset.baseUrl,
            model: normalizeText(parsed.model),
            evaluateModel: normalizeText(parsed.evaluateModel),
            apiKey: normalizeText(parsed.apiKey),
            timeoutMs: toNumber(parsed.timeoutMs),
            evaluateTimeoutMs: toNumber(parsed.evaluateTimeoutMs),
        }
    } catch {
        return null
    }
}

export const saveAIUserConfig = (config: AIUserConfig): void => {
    const providerPreset = normalizePreset(config.providerPreset)
    const preset = resolvePreset(providerPreset)
    const normalized: AIUserConfig = {
        providerPreset,
        mode: normalizeMode(config.mode),
        baseUrl: normalizeText(config.baseUrl) ?? preset.baseUrl,
        model: normalizeText(config.model),
        evaluateModel: normalizeText(config.evaluateModel),
        apiKey: normalizeText(config.apiKey),
        timeoutMs: toNumber(config.timeoutMs),
        evaluateTimeoutMs: toNumber(config.evaluateTimeoutMs),
    }
    localStorage.setItem(AI_USER_CONFIG_KEY, JSON.stringify(normalized))
}

export const clearAIUserConfig = (): void => {
    localStorage.removeItem(AI_USER_CONFIG_KEY)
}

export const toAIConfigOverride = (config: AIUserConfig): Partial<AIConfig> => {
    return {
        mode: 'openai-compatible',
        baseUrl: config.baseUrl,
        model: config.model,
        evaluateModel: config.evaluateModel,
        apiKey: config.apiKey,
        timeoutMs: config.timeoutMs,
        evaluateTimeoutMs: config.evaluateTimeoutMs,
    }
}

export const getProviderPresetById = (preset: AIProviderPreset): AIProviderPresetConfig => {
    return resolvePreset(preset)
}
