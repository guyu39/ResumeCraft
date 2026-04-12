/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_AI_MODE?: 'mock' | 'openai-compatible'
    readonly VITE_AI_BASE_URL?: string
    readonly VITE_AI_MODEL?: string
    readonly VITE_AI_EVALUATE_MODEL?: string
    readonly VITE_AI_API_KEY?: string
    readonly VITE_AI_TIMEOUT_MS?: string
    readonly VITE_AI_EVALUATE_TIMEOUT_MS?: string
    readonly VITE_DOUBAO_BASE_URL?: string
    readonly VITE_DOUBAO_MODEL?: string
    readonly VITE_DOUBAO_EVALUATE_MODEL?: string
    readonly VITE_DOUBAO_API_KEY?: string
    readonly VITE_DOUBAO_EVALUATE_TIMEOUT_MS?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
