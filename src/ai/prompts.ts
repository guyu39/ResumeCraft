import type { ResumeLocale } from '@/types/resume'
import type { ResumeEvaluateInput, RichTextSuggestInput } from './types'

const localeLabel = (locale: ResumeLocale): string => (locale === 'en-US' ? 'English' : '简体中文')
const MAX_RICH_TEXT_SOURCE_CHARS = 2200

export const sanitizeAIText = (text: string): string => {
    return text
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/：/g, ':')
        .replace(/，/g, ',')
        .trim()
}

export const buildRichTextSuggestPrompt = (input: RichTextSuggestInput): string => {
    const rawSourceText = (input.selectedText && input.selectedText.trim()) || input.fullText
    const sourceText = rawSourceText.length > MAX_RICH_TEXT_SOURCE_CHARS
        ? `${rawSourceText.slice(0, MAX_RICH_TEXT_SOURCE_CHARS)}\n\n[已截断，原文过长]`
        : rawSourceText
    const language = localeLabel(input.locale)
    const moduleHint = input.moduleType ? `模块类型: ${input.moduleType}` : '模块类型: 未指定'
    const positionHint = input.targetPosition ? `目标位置: ${input.targetPosition}` : '目标位置: 未指定'
    const toneHint = input.tone ? `语气偏好: ${input.tone}` : '语气偏好: professional'

    return [
        '你是专业简历优化助手。',
        `请使用${language}输出。`,
        moduleHint,
        positionHint,
        toneHint,
        '请基于以下文本给出 3 条可直接替换的优化建议。',
        '输出必须是 JSON，不要输出 JSON 之外的任何字符。',
        'JSON Schema:',
        '{"suggestions":[{"id":"string","title":"string","reason":"string","rewrite":"string"}]}',
        '待优化文本如下：',
        sourceText,
    ].join('\n')
}

export const buildResumeEvaluatePrompt = (input: ResumeEvaluateInput): string => {
    const language = localeLabel(input.locale)
    const resumeJson = JSON.stringify(input.resume)

    return [
        '你是资深简历评估顾问。',
        `请使用${language}输出。`,
        '请给出总分、维度评分、问题清单、可执行改进项。',
        '必须严格输出为单个 JSON 对象，不要输出 markdown、解释、注释、代码块标记。',
        '禁止省略字段；即使内容为空，也必须输出空字符串或空数组。',
        '评分规则：overallScore 与 dimensions[*].score 必须是 0-100 的整数分，不得使用 0-20 或其他分制。',
        '维度评分必须严格输出 6 项，且 key 与 label 必须一一对应如下：',
        '[{"key":"structure","label":"结构完整性"},{"key":"content_relevance","label":"内容相关性"},{"key":"skill_experience","label":"技能与经验展示"},{"key":"language_format","label":"语言表达与格式"},{"key":"overall_impression","label":"整体印象"},{"key":"quantified_impact","label":"量化成果与影响力"}]',
        '字段长度与数量限制：summary <= 220 字；每个 dimensions.comment <= 120 字；issues 数量 2-4 条；每个 issues.description <= 120 字；actionItems 固定 3 条。',
        'issues.id 必须唯一，使用 issue-1、issue-2、issue-3 这样的格式。',
        'moduleType 必须是以下值之一：personal, education, work, project, skills, awards, summary, certificates, portfolio, languages, custom。',
        '评估范围仅限简历内容质量（信息完整性、岗位相关性、表达与量化成果）。不要评价页面结构、UI 配置或展示控制字段。',
        '禁止在 summary、issues、actionItems、reasoningSteps 中提及任何页面结构字段，例如：visible、layout、style、theme、position、order、columns。',
        '特殊约束：当“专业技能”模块为 visible=false 时，不得将其视为问题或扣分项。',
        '特殊约束：个人信息中的 targetPosition、workyears，教育经历中的 gpa、honors、schoolExperience 为空时，视为可选信息，不得单独作为问题项或扣分依据。',
        '输出键顺序必须严格如下：overallScore, level, summary, dimensions, issues, actionItems, reasoningSteps。',
        '严格模板如下（按此结构输出，不得增删顶层键）：',
        '{"overallScore":0,"level":"A","summary":"","dimensions":[{"key":"structure","label":"结构完整性","score":0,"comment":""},{"key":"content_relevance","label":"内容相关性","score":0,"comment":""},{"key":"skill_experience","label":"技能与经验展示","score":0,"comment":""},{"key":"language_format","label":"语言表达与格式","score":0,"comment":""},{"key":"overall_impression","label":"整体印象","score":0,"comment":""},{"key":"quantified_impact","label":"量化成果与影响力","score":0,"comment":""}],"issues":[{"id":"issue-1","moduleType":"work","severity":"high","title":"","description":"","suggestion":""}],"actionItems":["","",""],"reasoningSteps":[]}',
        '额外要求：issues 需覆盖高、中、低不同严重程度，reasoningSteps 需体现从整体到局部、从评分到问题再到改进建议的逻辑链条。',
        '简历 JSON：',
        resumeJson,
    ].join('\n')
}
