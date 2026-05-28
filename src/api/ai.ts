// ============================================================
// AI API
// ============================================================

import { apiClient } from './client'

export interface AIConfigRequest {
    provider: string
    model: string
    apiKey: string
    baseUrl?: string
    enabled?: boolean
    isGlobal?: boolean
}

export interface AIConfigResponse {
    id: string
    provider: string
    baseUrl: string
    defaultModel: string
    enabled: boolean
    isGlobal: boolean
    createdAt: number
    updatedAt: number
}

export interface EvaluateRequest {
    resumeId: string
    content: Record<string, unknown>
}

export interface EvaluateResponse {
    overallScore: number
    level: string
    summary: string
    dimensions: Array<{
        key: string
        label: string
        score: number
        comment: string
    }>
    issues: Array<{
        id: string
        severity: string
        title: string
        description: string
        suggestion: string
    }>
    actionItems: string[]
    reasoningSteps?: string[]
    rawText?: string
    model: string
    conversationId: string
}

export interface StreamPartialResult {
    raw?: string
    overallScore?: number
    level?: string
    summary?: string
    dimensions?: Array<{
        key: string
        label: string
        score: number
        comment: string
    }>
    issues?: Array<{
        id: string
        severity: string
        title: string
        description: string
        suggestion: string
    }>
    actionItems?: string[]
    done?: boolean
    finish?: boolean
    model?: string
}

export interface JDKeywordMatch {
    keyword: string
    required: boolean
    matched: boolean
    evidence: string
}

export interface JDGap {
    severity: string
    requirement: string
    currentEvidence: string
    suggestion: string
}

export interface JDResumeSuggestion {
    moduleType: string
    title: string
    suggestion: string
}

export interface JDMatchRequest {
    resumeId: string
    content: Record<string, unknown>
    jdText: string
    targetTitle?: string
    companyName?: string
}

export interface JDMatchResponse {
    matchScore: number
    level: string
    summary: string
    keywordMatches: JDKeywordMatch[]
    strengths: string[]
    gaps: JDGap[]
    resumeSuggestions: JDResumeSuggestion[]
    actionItems: string[]
    targetTitle?: string
    companyName?: string
    jdText?: string
    rawText?: string
    model: string
    conversationId: string
}

export interface JDMatchStreamPartialResult {
    matchScore?: number
    level?: string
    summary?: string
    keywordMatches?: JDKeywordMatch[]
    strengths?: string[]
    gaps?: JDGap[]
    resumeSuggestions?: JDResumeSuggestion[]
    actionItems?: string[]
    finish?: boolean
    model?: string
}

export type JDScoreRequest = JDMatchRequest

export interface JDSkillRequirement {
    name: string
    required: boolean
    proficiency: string
    context: string
}

export interface JDExperienceRequirement {
    field: string
    minYears: number
    required: boolean
    context: string
}

export interface JDEducationRequirement {
    level: string
    majors: string[]
    required: boolean
}

export interface JDParsedResult {
    jobTitle: string
    company: string
    seniorityLevel: string
    employmentType: string
    hardSkills: JDSkillRequirement[]
    softSkills: JDSkillRequirement[]
    tools: JDSkillRequirement[]
    domains: JDSkillRequirement[]
    experienceRequirements: JDExperienceRequirement[]
    educationRequirement?: JDEducationRequirement
    certifications: string[]
    languages: string[]
    keyPhrases: string[]
    categories: string[]
}

export interface JDFormatCheckItem {
    key: string
    passed: boolean
    description: string
    suggestion?: string
}

export interface JDScoreResponse {
    overallScore: number
    level: string
    summary: string
    jdParsed: JDParsedResult
    breakdown: {
        ats: { score: number; checks: JDFormatCheckItem[] }
        keywordMatch: {
            score: number
            coverage: number
            requiredMatched: number
            requiredTotal: number
            optionalMatched: number
            optionalTotal: number
            keywords: JDKeywordMatch[]
            missing: string[]
        }
        seniorityFit: {
            score: number
            jdSeniority: string
            resumeYears: number
            levelMatch: string
        }
    }
    improvements: Array<{
        category: string
        potentialGain: number
        action: string
        priority: string
    }>
    targetTitle?: string
    companyName?: string
    jdText?: string
    rawText?: string
    model: string
    conversationId: string
}

export interface CoverLetterRequest {
    resumeId: string
    content: Record<string, unknown>
    jdText?: string
    jobTitle: string
    companyName?: string
    tone?: string
    language?: string
}

export interface CoverLetterResponse {
    title: string
    coverLetter: string
    highlightsUsed: string[]
    tips: string[]
    jobTitle?: string
    companyName?: string
    jdText?: string
    rawText?: string
    model: string
    conversationId: string
}

export interface SuggestRequest {
    resumeId: string
    moduleType: string
    moduleInstanceId: string
    fieldKey: string
    content: string
    contentHash?: string
}

export interface SuggestResponse {
    suggestions: Array<{ content: string; reason: string }>
    rawText?: string
    model: string
    conversationId: string
    fromCache?: boolean
}

export interface ConversationItem {
    id: string
    resumeId: string | null
    type: 'evaluate' | 'suggest' | 'jd_match' | 'cover_letter'
    title: string
    createdAt: number
    updatedAt: number
    context?: {
        overallScore?: number
        level?: string
        moduleType?: string
        fieldKey?: string
    }
}

export interface ConversationListResponse {
    items: ConversationItem[]
    pagination: {
        page: number
        pageSize: number
        total: number
        totalPages: number
    }
}

export interface ConversationDetail {
    id: string
    resumeId: string | null
    type: 'evaluate' | 'suggest' | 'jd_match' | 'cover_letter'
    title: string
    createdAt: number
    updatedAt: number
    context?: Record<string, unknown>
    messages: Array<{
        id: string
        role: 'user' | 'assistant'
        content: string
        model?: string
        createdAt: number
    }>
}

export const aiApi = {
    getConfig: () =>
        apiClient.get<AIConfigResponse>('/ai/config', { auth: true }),

    saveConfig: (data: AIConfigRequest) =>
        apiClient.post<{ saved: boolean }>('/ai/config', data, { auth: true }),

    evaluate: (data: EvaluateRequest) =>
        apiClient.post<EvaluateResponse>('/ai/evaluate', data, { auth: true }),

    evaluateStream: (
        data: EvaluateRequest,
        onUpdate: (partial: StreamPartialResult) => void
    ): Promise<EvaluateResponse> => {
        return new Promise((resolve, reject) => {
            const token = localStorage.getItem('accessToken')
            if (!token) {
                reject(new Error('请登录使用'))
                return
            }

            const xhr = new XMLHttpRequest()
            xhr.open('POST', '/api/ai/evaluate/stream', true)
            xhr.setRequestHeader('Content-Type', 'application/json')
            xhr.setRequestHeader('Authorization', `Bearer ${token}`)

            let lastPos = 0

            xhr.onprogress = () => {
                const text = xhr.responseText
                const newText = text.slice(lastPos)
                lastPos = text.length

                const lines = newText.split('\n')
                for (const line of lines) {
                    if (line.startsWith('event:')) continue
                    if (!line.startsWith('data: ')) continue
                    const content = line.slice(6).trim()
                    if (!content) continue

                    try {
                        const evt = JSON.parse(content) as {
                            type?: string
                            model?: string
                            summary?: string
                            overallScore?: number
                            level?: string
                            dimensions?: StreamPartialResult['dimensions']
                            issues?: StreamPartialResult['issues']
                            actionItems?: string[]
                        }

                        switch (evt.type) {
                            case 'model':
                                if (evt.model) onUpdate({ model: evt.model } as StreamPartialResult)
                                break
                            case 'summary':
                                if (evt.summary !== undefined) onUpdate({ summary: evt.summary } as StreamPartialResult)
                                break
                            case 'overall_score':
                                onUpdate({
                                    overallScore: evt.overallScore,
                                    level: evt.level ?? null,
                                } as StreamPartialResult)
                                break
                            case 'dimension_score':
                                if (evt.dimensions?.length) onUpdate({ dimensions: evt.dimensions } as StreamPartialResult)
                                break
                            case 'issue_item':
                                if (evt.issues?.length) onUpdate({ issues: evt.issues } as StreamPartialResult)
                                break
                            case 'action_item':
                                if (evt.actionItems?.length) onUpdate({ actionItems: evt.actionItems } as StreamPartialResult)
                                break
                            case 'finish':
                                onUpdate({ finish: true } as StreamPartialResult)
                                break
                        }
                    } catch {
                        // JSON 解析失败，忽略
                    }
                }
            }

            xhr.onload = () => {
                // 解析最终结果（event: done 行）
                const lines = xhr.responseText.split('\n')
                for (const line of lines) {
                    if (!line.startsWith('event: done')) continue
                    const dataLine = lines[lines.indexOf(line) + 1]
                    if (dataLine && dataLine.startsWith('data: ')) {
                        try {
                            const result = JSON.parse(dataLine.slice(6)) as EvaluateResponse
                            resolve(result)
                            return
                        } catch {
                            // ignore
                        }
                    }
                }
                if (xhr.status >= 200 && xhr.status < 300) {
                    reject(new Error('未收到评估结果'))
                } else {
                    reject(new Error(`请求失败: ${xhr.status}`))
                }
            }

            xhr.onerror = () => {
                reject(new Error('网络错误'))
            }

            xhr.send(JSON.stringify(data))
        })
    },

    jdMatchStream: (
        data: JDMatchRequest,
        onUpdate: (partial: JDMatchStreamPartialResult) => void
    ): Promise<JDMatchResponse> => {
        return new Promise((resolve, reject) => {
            const token = localStorage.getItem('accessToken')
            if (!token) {
                reject(new Error('请登录使用'))
                return
            }

            const xhr = new XMLHttpRequest()
            xhr.open('POST', '/api/ai/jd-match/stream', true)
            xhr.setRequestHeader('Content-Type', 'application/json')
            xhr.setRequestHeader('Authorization', `Bearer ${token}`)

            let lastPos = 0

            xhr.onprogress = () => {
                const text = xhr.responseText
                const newText = text.slice(lastPos)
                lastPos = text.length

                const lines = newText.split('\n')
                for (const line of lines) {
                    if (line.startsWith('event:')) continue
                    if (!line.startsWith('data: ')) continue
                    const content = line.slice(6).trim()
                    if (!content) continue

                    try {
                        const evt = JSON.parse(content) as JDMatchStreamPartialResult & { type?: string }
                        switch (evt.type) {
                            case 'model':
                                if (evt.model) onUpdate({ model: evt.model })
                                break
                            case 'summary':
                                if (evt.summary !== undefined) onUpdate({ summary: evt.summary })
                                break
                            case 'match_score':
                                onUpdate({ matchScore: evt.matchScore, level: evt.level })
                                break
                            case 'keyword_match':
                                if (evt.keywordMatches?.length) onUpdate({ keywordMatches: evt.keywordMatches })
                                break
                            case 'strength_item':
                                if (evt.strengths?.length) onUpdate({ strengths: evt.strengths })
                                break
                            case 'gap_item':
                                if (evt.gaps?.length) onUpdate({ gaps: evt.gaps })
                                break
                            case 'resume_suggestion':
                                if (evt.resumeSuggestions?.length) onUpdate({ resumeSuggestions: evt.resumeSuggestions })
                                break
                            case 'action_item':
                                if (evt.actionItems?.length) onUpdate({ actionItems: evt.actionItems })
                                break
                            case 'finish':
                                onUpdate({ finish: true })
                                break
                        }
                    } catch {
                        // 忽略非 JSON 的 SSE 数据行
                    }
                }
            }

            xhr.onload = () => {
                const lines = xhr.responseText.split('\n')
                for (let i = 0; i < lines.length; i += 1) {
                    if (!lines[i].startsWith('event: done')) continue
                    const dataLine = lines[i + 1]
                    if (dataLine && dataLine.startsWith('data: ')) {
                        try {
                            resolve(JSON.parse(dataLine.slice(6)) as JDMatchResponse)
                            return
                        } catch {
                            // ignore
                        }
                    }
                }
                if (xhr.status >= 200 && xhr.status < 300) {
                    reject(new Error('未收到 JD 匹配结果'))
                } else {
                    reject(new Error(`请求失败: ${xhr.status}`))
                }
            }

            xhr.onerror = () => reject(new Error('网络错误'))
            xhr.send(JSON.stringify(data))
        })
    },

    score: (data: JDScoreRequest) =>
        apiClient.post<JDScoreResponse>('/ai/score', data, { auth: true }),

    generateCoverLetter: (data: CoverLetterRequest) =>
        apiClient.post<CoverLetterResponse>('/ai/cover-letter', data, { auth: true }),

    suggest: (data: SuggestRequest) =>
        apiClient.post<SuggestResponse>('/ai/suggest', data, { auth: true }),

    getConversations: (params?: { type?: string; resumeId?: string; page?: number; pageSize?: number }) => {
        const searchParams = new URLSearchParams()
        if (params?.type) searchParams.set('type', params.type)
        if (params?.resumeId) searchParams.set('resumeId', params.resumeId)
        if (params?.page) searchParams.set('page', String(params.page))
        if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize))
        const query = searchParams.toString()
        return apiClient.get<ConversationListResponse>(`/ai/conversations${query ? `?${query}` : ''}`, { auth: true })
    },

    getConversation: (id: string) =>
        apiClient.get<ConversationDetail>(`/ai/conversations/${id}`, { auth: true }),

    deleteConversation: (id: string) =>
        apiClient.delete<{ deleted: boolean }>(`/ai/conversations/${id}`, { auth: true }),

    getSuggestRecords: (params?: { resumeId?: string; moduleType?: string; moduleInstanceId?: string; fieldKey?: string; limit?: number }) => {
        const searchParams = new URLSearchParams()
        if (params?.resumeId) searchParams.set('resumeId', params.resumeId)
        if (params?.moduleType) searchParams.set('moduleType', params.moduleType)
        if (params?.moduleInstanceId) searchParams.set('moduleInstanceId', params.moduleInstanceId)
        if (params?.fieldKey) searchParams.set('fieldKey', params.fieldKey)
        if (params?.limit) searchParams.set('limit', String(params.limit))
        const query = searchParams.toString()
        return apiClient.get<SuggestRecordListResponse>(`/ai/suggest-records${query ? `?${query}` : ''}`, { auth: true })
    },

    saveSuggestRecord: (data: {
        resumeId: string
        conversationId: string
        moduleType: string
        moduleInstanceId: string
        fieldKey: string
        originalContent: string
        optimizedContent: string
        suggestions: Array<{ content: string; reason: string }>
    }) => apiClient.post<{ saved: boolean }>('/ai/suggest-records', data, { auth: true }),

    // 简历解析配置
    getParserConfig: () =>
        apiClient.get<ParserConfigResponse>('/ai/parser-config', { auth: true }),

    saveParserConfig: (data: ParserConfigRequest) =>
        apiClient.post<{ saved: boolean }>('/ai/parser-config', data, { auth: true }),
}

export interface ParserConfigRequest {
    provider: string
    model: string
    apiKey: string
    baseUrl?: string
}

export interface ParserConfigResponse {
    id: string
    provider: string
    baseUrl: string
    model: string
    enabled: boolean
}

export interface SuggestRecord {
    id: string
    userId: string
    resumeId?: string
    conversationId?: string
    moduleType: string
    fieldKey: string
    originalContent: string
    optimizedContent?: string
    createdAt: number
}

export interface SuggestRecordListResponse {
    items: SuggestRecord[]
}
