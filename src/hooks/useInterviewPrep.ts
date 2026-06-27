import { useState, useCallback, useRef, useEffect } from 'react'
import { aiApi, type InterviewQuestion, type InterviewAnswer, type InterviewEvaluation, type InterviewGenerateRequest, type InterviewEvaluateRequest, type AnalyzeTranscriptRequest } from '@/api/ai'

type InterviewRound = 'technical' | 'hr'
type InterviewMode = 'simulate' | 'transcript'
type Status = 'idle' | 'generating' | 'analyzing' | 'answering' | 'evaluating' | 'evaluated'

export function useInterviewPrep() {
    const [mode, setMode] = useState<InterviewMode>('simulate')
    const [interviewRound, setInterviewRound] = useState<InterviewRound>('technical')

    const [questions, setQuestions] = useState<InterviewQuestion[]>([])
    const [generating, setGenerating] = useState(false)
    const [generateError, setGenerateError] = useState<string | null>(null)

    const [transcriptText, setTranscriptText] = useState('')
    const [transcriptSource, setTranscriptSource] = useState('manual')
    const [analyzing, setAnalyzing] = useState(false)
    const [analyzeError, setAnalyzeError] = useState<string | null>(null)

    const [answers, setAnswers] = useState<Map<string, InterviewAnswer>>(new Map())
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)

    const [evaluation, setEvaluation] = useState<InterviewEvaluation | null>(null)
    const [evaluating, setEvaluating] = useState(false)
    const [evaluateError, setEvaluateError] = useState<string | null>(null)

    const [sessionId, setSessionId] = useState<string | null>(null)
    const [status, setStatus] = useState<Status>('idle')

    // 取消正在进行的流式请求：重新发起或卸载时 abort，避免旧流的回调污染新状态、空烧 token
    const abortRef = useRef<AbortController | null>(null)
    const abortInflight = useCallback(() => {
        if (abortRef.current) {
            abortRef.current.abort()
            abortRef.current = null
        }
    }, [])
    useEffect(() => () => abortInflight(), [abortInflight])

    const isAbortError = (err: unknown) => err instanceof DOMException && err.name === 'AbortError'

    const generateQuestions = useCallback(async (
        resumeId: string,
        content: Record<string, unknown>,
        jdText: string,
        targetTitle: string,
        companyName: string,
        focusAreas: string[],
        questionCount: number,
        snapshotVersionId?: string,
    ) => {
        abortInflight()
        const controller = new AbortController()
        abortRef.current = controller

        setGenerating(true)
        setGenerateError(null)
        setQuestions([])
        setAnswers(new Map())
        setEvaluation(null)
        setStatus('generating')

        try {
            const req: InterviewGenerateRequest = {
                resumeId,
                content,
                jdText,
                targetTitle,
                companyName,
                focusAreas,
                questionCount,
                interviewRound,
                snapshotVersionId,
            }

            const sid = await aiApi.interviewGenerate(req, (evt) => {
                if (controller.signal.aborted) return
                if (evt.type === 'question' && evt.question) {
                    setQuestions(prev => [...prev, evt.question!])
                }
            }, controller.signal)

            setSessionId(sid)
            setStatus('answering')
            return sid
        } catch (err) {
            if (isAbortError(err)) return ''
            setGenerateError(err instanceof Error ? err.message : '生成面试题失败')
            setStatus('idle')
            return ''
        } finally {
            if (abortRef.current === controller) abortRef.current = null
            setGenerating(false)
        }
    }, [interviewRound, abortInflight])

    const analyzeTranscript = useCallback(async (
        resumeId: string,
        content: Record<string, unknown>,
        jdText: string,
        targetTitle: string,
        companyName: string,
        snapshotVersionId?: string,
    ) => {
        if (!transcriptText.trim()) return ''

        abortInflight()
        const controller = new AbortController()
        abortRef.current = controller

        setAnalyzing(true)
        setAnalyzeError(null)
        setQuestions([])
        setAnswers(new Map())
        setEvaluation(null)
        setStatus('analyzing')

        try {
            const req: AnalyzeTranscriptRequest = {
                resumeId,
                content,
                jdText,
                targetTitle,
                companyName,
                transcriptText,
                transcriptSource,
                interviewRound,
                snapshotVersionId,
            }

            // 累积构建 evaluation 对象（dimension/round/overall/improvement 事件汇总）
            const dimensionScores: InterviewEvaluation['dimensionScores'] = {}
            const roundScores: InterviewEvaluation['roundScores'] = {}
            const roundReasons: Record<string, string> = {}
            const questionEvaluations: InterviewEvaluation['questionEvaluations'] = []
            const improvementSuggestions: InterviewEvaluation['improvementSuggestions'] = []
            let overallScore = 0
            let overallLevel = ''
            let overallSummary = ''

            // 直接用 TranscriptAnalyzeEvent 判别联合，TS 在各分支收窄字段类型，
            // 不再走 Record<string,unknown> 强转（之前因此漏掉了 questionText/answerText 字段名错配）
            const sid = await aiApi.interviewAnalyzeTranscript(req, (evt) => {
                if (controller.signal.aborted) return

                if (evt.type === 'qa_extracted') {
                    const idx = evt.index ?? 0
                    setQuestions(prev => [...prev, {
                        id: `qa_${idx}`,
                        category: 'technical',
                        difficulty: 'medium',
                        question: evt.questionText ?? '',
                        evaluationCriteria: { keyPoints: [], bonusPoints: [], redFlags: [] },
                    }])
                    setAnswers(prev => {
                        const next = new Map(prev)
                        next.set(`qa_${idx}`, {
                            questionId: `qa_${idx}`,
                            answer: evt.answerText ?? '',
                            skipped: false,
                            answeredAt: new Date().toISOString(),
                            fromTranscript: true,
                            originalText: evt.answerText ?? '',
                        })
                        return next
                    })
                } else if (evt.type === 'qa_eval') {
                    questionEvaluations.push({
                        questionId: `qa_${evt.index ?? 0}`,
                        score: evt.score ?? 0,
                        briefFeedback: evt.briefFeedback ?? '',
                        keyPointsHit: evt.keyPointsHit ?? [],
                        missedPoints: evt.missedPoints ?? [],
                        redFlagsFound: [],
                    })
                } else if (evt.type === 'dimension_score') {
                    if (evt.dimension) {
                        dimensionScores[evt.dimension] = {
                            score: evt.score ?? 0,
                            level: evt.level ?? '',
                            feedback: evt.feedback ?? '',
                        }
                    }
                } else if (evt.type === 'round_score') {
                    if (evt.round) {
                        roundScores[evt.round] = evt.score ?? 0
                        if (evt.reason) roundReasons[evt.round] = evt.reason
                    }
                } else if (evt.type === 'overall') {
                    overallScore = evt.score ?? 0
                    overallLevel = evt.level ?? ''
                    overallSummary = evt.summary ?? ''
                    if (evt.roundScores) {
                        for (const [k, v] of Object.entries(evt.roundScores)) roundScores[k] = v
                    }
                } else if (evt.type === 'improvement') {
                    improvementSuggestions.push({
                        priority: (evt.priority as 'high' | 'medium' | 'low') ?? 'medium',
                        area: evt.area ?? '',
                        suggestion: evt.suggestion ?? '',
                        estimatedGain: evt.estimatedGain ?? 0,
                        targetRound: evt.targetRound ?? '',
                    })
                } else if (evt.type === 'finish') {
                    // 流结束时，把累积数据组装为 evaluation 并写入 state
                    setEvaluation({
                        summary: overallSummary
                            || (overallLevel ? `综合评分 ${overallScore}（${overallLevel}）` : `综合评分 ${overallScore}`),
                        overallScore,
                        overallLevel,
                        dimensionScores,
                        roundScores,
                        roundReasons,
                        questionEvaluations,
                        improvementSuggestions,
                        model: '',
                        evaluatedAt: new Date().toISOString(),
                    })
                    setStatus('evaluated')
                }
            }, controller.signal)

            setSessionId(sid)
            return sid
        } catch (err) {
            if (isAbortError(err)) return ''
            setAnalyzeError(err instanceof Error ? err.message : '分析录音失败')
            setStatus('idle')
            return ''
        } finally {
            if (abortRef.current === controller) abortRef.current = null
            setAnalyzing(false)
        }
    }, [interviewRound, transcriptText, transcriptSource, abortInflight])

    const setAnswer = useCallback((questionId: string, answer: string) => {
        setAnswers(prev => {
            const next = new Map(prev)
            next.set(questionId, {
                questionId,
                answer,
                skipped: false,
                answeredAt: new Date().toISOString(),
            })
            return next
        })
    }, [])

    const skipQuestion = useCallback((questionId: string) => {
        setAnswers(prev => {
            const next = new Map(prev)
            next.set(questionId, {
                questionId,
                answer: '',
                skipped: true,
                answeredAt: new Date().toISOString(),
            })
            return next
        })
    }, [])

    const nextQuestion = useCallback(() => {
        setCurrentQuestionIndex(prev => Math.min(prev + 1, questions.length - 1))
    }, [questions.length])

    const prevQuestion = useCallback(() => {
        setCurrentQuestionIndex(prev => Math.max(prev - 1, 0))
    }, [])

    const submitForEvaluation = useCallback(async () => {
        if (!sessionId) return

        abortInflight()
        const controller = new AbortController()
        abortRef.current = controller

        setEvaluating(true)
        setEvaluateError(null)
        setEvaluation(null)
        setStatus('evaluating')

        try {
            const answerList = Array.from(answers.values())
            const req: InterviewEvaluateRequest = {
                sessionId,
                answers: answerList,
                interviewRound,
            }

            let evalData: InterviewEvaluation = {
                summary: '',
                dimensionScores: {},
                roundScores: {},
                questionEvaluations: [],
                improvementSuggestions: [],
                model: '',
                evaluatedAt: new Date().toISOString(),
            }

            await aiApi.interviewEvaluate(req, (evt) => {
                if (controller.signal.aborted) return
                if (evt.type === 'dimension_score') {
                    const ds = evt as { type: 'dimension_score'; dimension: string; score: number; level: string; feedback: string }
                    evalData = { ...evalData, dimensionScores: { ...evalData.dimensionScores, [ds.dimension]: { score: ds.score, level: ds.level, feedback: ds.feedback } } }
                    setEvaluation({ ...evalData })
                }
                if (evt.type === 'round_score') {
                    const rs = evt as { type: 'round_score'; round: string; score: number }
                    evalData = { ...evalData, roundScores: { ...evalData.roundScores, [rs.round]: rs.score } }
                    setEvaluation({ ...evalData })
                }
                if (evt.type === 'overall') {
                    const ov = evt as { type: 'overall'; score: number; level: string; roundScores: Record<string, number> }
                    evalData = { ...evalData, overallScore: ov.score, overallLevel: ov.level, roundScores: ov.roundScores || evalData.roundScores, summary: `综合评分 ${ov.score} 分（${ov.level}）` }
                    setEvaluation({ ...evalData })
                }
                if (evt.type === 'question_eval') {
                    const qe = evt as { type: 'question_eval'; questionId: string; score: number; briefFeedback: string; keyPointsHit: string[]; missedPoints: string[]; redFlagsFound: string[] }
                    evalData = { ...evalData, questionEvaluations: [...evalData.questionEvaluations, { questionId: qe.questionId, score: qe.score, keyPointsHit: qe.keyPointsHit, missedPoints: qe.missedPoints, redFlagsFound: qe.redFlagsFound, briefFeedback: qe.briefFeedback }] }
                    setEvaluation({ ...evalData })
                }
                if (evt.type === 'improvement') {
                    const imp = evt as { type: 'improvement'; priority: string; area: string; suggestion: string; estimatedGain: number; targetRound: string }
                    evalData = { ...evalData, improvementSuggestions: [...evalData.improvementSuggestions, { priority: imp.priority as 'high' | 'medium' | 'low', area: imp.area, suggestion: imp.suggestion, estimatedGain: imp.estimatedGain, targetRound: imp.targetRound }] }
                    setEvaluation({ ...evalData })
                }
            }, controller.signal)

            setStatus('evaluated')
        } catch (err) {
            if (isAbortError(err)) return
            setEvaluateError(err instanceof Error ? err.message : '评估失败')
            setStatus('answering')
        } finally {
            if (abortRef.current === controller) abortRef.current = null
            setEvaluating(false)
        }
    }, [sessionId, answers, interviewRound, abortInflight])

    const reset = useCallback(() => {
        setQuestions([])
        setAnswers(new Map())
        setEvaluation(null)
        setSessionId(null)
        setGenerateError(null)
        setAnalyzeError(null)
        setEvaluateError(null)
        setCurrentQuestionIndex(0)
        setStatus('idle')
    }, [])

    // 加载历史面试会话到当前面板（用于"历史"抽屉点击恢复）
    const loadSession = useCallback((session: {
        id: string
        mode: string
        interviewRound: string
        questions: InterviewQuestion[]
        answers: InterviewAnswer[]
        evaluation?: InterviewEvaluation
        transcriptText?: string
        status: string
    }) => {
        setSessionId(session.id)
        if (session.mode === 'transcript' || session.mode === 'simulate') {
            setMode(session.mode)
        }
        // 兼容历史记录里的 technical_1/technical_2，统一映射为 technical
        if (session.interviewRound === 'hr') {
            setInterviewRound('hr')
        } else if (session.interviewRound === 'technical' || session.interviewRound === 'technical_1' || session.interviewRound === 'technical_2') {
            setInterviewRound('technical')
        }
        setQuestions(session.questions || [])
        const answerMap = new Map<string, InterviewAnswer>()
        for (const a of session.answers || []) {
            answerMap.set(a.questionId, a)
        }
        setAnswers(answerMap)
        setEvaluation(session.evaluation || null)
        setTranscriptText(session.transcriptText || '')
        setCurrentQuestionIndex(0)
        setGenerateError(null)
        setAnalyzeError(null)
        setEvaluateError(null)
        // 状态恢复：有 evaluation 即视为已评估，否则按数据库 status
        if (session.evaluation) {
            setStatus('evaluated')
        } else if (session.status === 'answering' || session.status === 'evaluated' || session.status === 'generating' || session.status === 'idle') {
            setStatus(session.status as Status)
        } else {
            setStatus('answering')
        }
    }, [])

    return {
        mode, setMode,
        interviewRound, setInterviewRound,
        questions, generating, generateError, generateQuestions,
        transcriptText, setTranscriptText, transcriptSource, setTranscriptSource,
        analyzing, analyzeError, analyzeTranscript,
        answers, currentQuestionIndex, setAnswer, skipQuestion, nextQuestion, prevQuestion,
        evaluation, evaluating, evaluateError, submitForEvaluation,
        sessionId, status, reset, loadSession,
    }
}
