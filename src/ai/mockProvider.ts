import type { AIProvider, ResumeEvaluateInput, ResumeEvaluateOptions, ResumeEvaluateOutput, RichTextSuggestInput, RichTextSuggestOutput } from './types'

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

const nextId = (prefix: string, index: number): string => `${prefix}-${Date.now()}-${index}`

const normalizeText = (input: RichTextSuggestInput): string => {
    return (input.selectedText && input.selectedText.trim()) || input.fullText || ''
}

export const createMockProvider = (): AIProvider => {
    return {
        mode: 'mock',
        async suggestForRichText(input: RichTextSuggestInput): Promise<RichTextSuggestOutput> {
            const source = normalizeText(input)
            await sleep(900)

            return {
                model: 'mock-v1',
                suggestions: [
                    {
                        id: nextId('suggest', 1),
                        title: '强调结果导向',
                        reason: '补足量化结果，能提升说服力。',
                        rewrite: source
                            ? `负责${source}，通过流程优化与协作机制升级，将关键指标稳定提升，并形成可复用方法论。`
                            : '负责核心业务模块，通过流程优化将关键指标显著提升。',
                    },
                    {
                        id: nextId('suggest', 2),
                        title: '增强行动动词',
                        reason: '以动作开头可提升句子力量感。',
                        rewrite: source
                            ? `主导${source}相关方案设计与落地，推动跨团队协同并确保阶段目标按期达成。`
                            : '主导方案设计与落地，推动跨团队协同确保目标达成。',
                    },
                    {
                        id: nextId('suggest', 3),
                        title: '压缩冗余表达',
                        reason: '更简洁的句式便于招聘者快速扫描。',
                        rewrite: source
                            ? `围绕${source}持续迭代，聚焦问题定位、方案执行与结果复盘，提升整体交付效率。`
                            : '持续迭代执行方案并复盘，显著提升交付效率。',
                    },
                ],
            }
        },
        async evaluateResume(input: ResumeEvaluateInput, _options?: ResumeEvaluateOptions): Promise<ResumeEvaluateOutput> {
            await sleep(1100)

            const moduleTypes = input.resume.modules.map((item) => item.type)
            const hasSummary = moduleTypes.includes('summary')
            const hasProject = moduleTypes.includes('project')

            return {
                overallScore: 82,
                level: 'B+',
                summary: '整体结构完整，建议进一步增强项目结果量化与技能证据链。',
                dimensions: [
                    { key: 'structure', label: '结构完整性', score: 88, comment: '模块覆盖较全，信息分区清晰。' },
                    { key: 'impact', label: '成果说服力', score: 76, comment: '部分经历缺少可验证的结果指标。' },
                    { key: 'matching', label: '岗位匹配度', score: 81, comment: '技能与目标岗位基础匹配。' },
                ],
                issues: [
                    {
                        id: nextId('issue', 1),
                        moduleType: hasProject ? 'project' : 'work',
                        severity: 'high',
                        title: '缺少量化成果',
                        description: '关键经历描述偏职责陈述，缺少结果指标。',
                        suggestion: '每条经历补充 1-2 个可量化结果，如效率提升、成本下降、转化提升。',
                    },
                    {
                        id: nextId('issue', 2),
                        moduleType: hasSummary ? 'summary' : 'skills',
                        severity: 'medium',
                        title: '个人优势表述偏泛化',
                        description: '自我评价中有较多抽象词，证据不足。',
                        suggestion: '将抽象词替换为“能力 + 场景 + 结果”的三段式表达。',
                    },
                ],
                actionItems: [
                    '为最近两段工作或项目经历补充量化结果。',
                    '将技能模块与项目证据关联，形成能力闭环。',
                    '简化过长句子，控制每条要点在 1 行到 1.5 行。',
                ],
                model: 'mock-v1',
            }
        },
    }
}
