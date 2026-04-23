import type { ModuleType, Resume, ResumeLocale } from '@/types/resume'

export type AIProviderMode = 'mock' | 'openai-compatible'

export interface RichTextSuggestInput {
    locale: ResumeLocale
    fullText: string
    selectedText?: string
    moduleType?: ModuleType
    targetPosition?: string
    moduleInstanceId?: string
    tone?: 'professional' | 'concise' | 'achievement-focused'
}

export interface RichTextSuggestionItem {
    id: string
    title: string
    reason: string
    rewrite: string
}

export interface RichTextSuggestOutput {
    suggestions: RichTextSuggestionItem[]
    model?: string
    rawText?: string
    conversationId?: string
}

export interface ResumeEvaluateInput {
    locale: ResumeLocale
    resume: Resume
}

export interface ResumeEvaluateOptions {
    onMessage?: (chunk: string) => void
}

export interface ResumeEvaluationDimension {
    key: string
    label: string
    score: number
    comment: string
}

export interface ResumeEvaluationIssue {
    id: string
    moduleType?: ModuleType
    severity: 'high' | 'medium' | 'low'
    title: string
    description: string
    suggestion: string
}

export interface ResumeEvaluateOutput {
    overallScore: number
    level: string
    summary: string
    dimensions: ResumeEvaluationDimension[]
    issues: ResumeEvaluationIssue[]
    actionItems: string[]
    reasoningSteps?: string[]
    model?: string
    rawText?: string
    conversationId?: string
}

export interface AIProvider {
    readonly mode: AIProviderMode
    suggestForRichText: (input: RichTextSuggestInput) => Promise<RichTextSuggestOutput>
    evaluateResume: (input: ResumeEvaluateInput, options?: ResumeEvaluateOptions) => Promise<ResumeEvaluateOutput>
}

export interface AIConfig {
    mode: AIProviderMode
    baseUrl?: string
    model?: string
    apiKey?: string
}

export interface AIProviderError extends Error {
    code: 'CONFIG_ERROR' | 'NETWORK_ERROR' | 'TIMEOUT' | 'RATE_LIMIT' | 'PARSE_ERROR' | 'UNKNOWN'
    status?: number
}
