import type { AIConfig, AIProviderMode } from './types'

const AI_USER_CONFIG_KEY = 'resumecraft_ai_user_config_v1'

export type AIProviderPreset =
    | 'doubao'      // 豆包（字节）
    | 'kimi'        // Kimi（Moonshot）
    | 'minimax'     // MiniMax
    | 'deepseek'    // DeepSeek
    | 'zhipu'       // 智谱AI
    | 'qwen'        // 阿里通义
    | 'wenxin'      // 百度文心
    | 'spark'       // 讯飞星火
    | 'siliconflow' // 硅基流动
    | 'openai'      // OpenAI
    | 'claude'      // Anthropic Claude
    | 'gemini'      // Google Gemini
    | 'custom'      // 自定义

export interface AIProviderPresetConfig {
    id: AIProviderPreset
    label: string
    baseUrl: string
    modelPlaceholder: string
}

export const AI_PROVIDER_PRESETS: AIProviderPresetConfig[] = [
    // 国内主流
    {
        id: 'doubao',
        label: '豆包（字节）',
        baseUrl: '/api/ark',
        modelPlaceholder: 'doubao-seed-2-0-pro-260215',
    },
    {
        id: 'kimi',
        label: 'Kimi（Moonshot）',
        baseUrl: 'https://api.moonshot.cn/v1',
        modelPlaceholder: 'moonshot-v1-8k',
    },
    {
        id: 'minimax',
        label: 'MiniMax',
        baseUrl: 'https://api.minimax.chat/v1',
        modelPlaceholder: 'MiniMax-Text-01',
    },
    {
        id: 'deepseek',
        label: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1',
        modelPlaceholder: 'deepseek-chat',
    },
    {
        id: 'zhipu',
        label: '智谱AI（GLM）',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        modelPlaceholder: 'glm-4-flash',
    },
    {
        id: 'qwen',
        label: '阿里通义（Qwen）',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        modelPlaceholder: 'qwen-plus',
    },
    {
        id: 'wenxin',
        label: '百度文心（Ernie）',
        baseUrl: 'https://qianfan.baidubce.com/v2',
        modelPlaceholder: 'ernie-4.0-8k-latest',
    },
    {
        id: 'spark',
        label: '讯飞星火（Spark）',
        baseUrl: 'https://spark-api.xf-yun.com/v4.0/chat',
        modelPlaceholder: 'Spark-4.0 Ultra',
    },
    {
        id: 'siliconflow',
        label: '硅基流动（SiliconFlow）',
        baseUrl: 'https://api.siliconflow.cn/v1',
        modelPlaceholder: 'Qwen/Qwen2.5-7B-Instruct',
    },
    // 国外主流
    {
        id: 'openai',
        label: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        modelPlaceholder: 'gpt-4o-mini',
    },
    {
        id: 'claude',
        label: 'Anthropic Claude',
        baseUrl: 'https://api.anthropic.com/v1',
        modelPlaceholder: 'claude-sonnet-4-20250514',
    },
    {
        id: 'gemini',
        label: 'Google Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        modelPlaceholder: 'gemini-2.0-flash',
    },
    // 自定义
    {
        id: 'custom',
        label: '自定义 OpenAI-Compatible',
        baseUrl: '',
        modelPlaceholder: 'your-model-name',
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
    apiKey?: string
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
            apiKey: normalizeText(parsed.apiKey),
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
        apiKey: normalizeText(config.apiKey),
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
        apiKey: config.apiKey,
    }
}

export const getProviderPresetById = (preset: AIProviderPreset): AIProviderPresetConfig => {
    return resolvePreset(preset)
}
