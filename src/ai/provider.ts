import { getAIConfigFromEnv, validateAIConfig } from './config'
import { createMockProvider } from './mockProvider'
import { createOpenAICompatibleProvider } from './openaiCompatibleProvider'
import type { AIConfig, AIProvider } from './types'

export const resolveAIConfig = (overrideConfig?: Partial<AIConfig>): AIConfig => {
    const envConfig = getAIConfigFromEnv()
    return {
        ...envConfig,
        ...overrideConfig,
    }
}

export const assertProviderConfig = (config: AIConfig): void => {
    const errors = validateAIConfig(config)
    if (errors.length > 0) {
        throw new Error(`AI 配置错误: ${errors.join('；')}`)
    }
}

export const createAIProvider = (overrideConfig?: Partial<AIConfig>): AIProvider => {
    const config = resolveAIConfig(overrideConfig)

    if (config.mode === 'mock') {
        return createMockProvider()
    }

    assertProviderConfig(config)
    return createOpenAICompatibleProvider(config)
}
