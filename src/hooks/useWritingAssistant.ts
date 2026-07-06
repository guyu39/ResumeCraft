import { useCallback, useEffect, useRef, useState } from 'react'
import { aiApi } from '@/api'
import type { WritingDiagnosis } from '@/api/ai'

const STORAGE_KEY = 'resumecraft_writing_assistant_enabled'
const CHANGE_EVENT = 'resumecraft:writing-assistant-change'
const DEBOUNCE_MS = 1500
const MIN_CONTENT_LENGTH = 5
const REPEAT_COOLDOWN_MS = 10000 // 同内容 10s 内不重复请求

interface WritingAssistantState {
    loading: boolean
    diagnoses: WritingDiagnosis[]
    dismissed: Set<string>
}

const readEnabled = (): boolean => {
    try {
        return localStorage.getItem(STORAGE_KEY) !== 'false'
    } catch {
        return true
    }
}

/** 读取实时写作建议开关（供设置面板等外部使用） */
export function getWritingAssistantEnabled(): boolean {
    return readEnabled()
}

/** 设置实时写作建议开关：写 localStorage 并广播事件，让所有 useWritingAssistant 实例同步 */
export function setWritingAssistantEnabled(next: boolean): void {
    try {
        localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
        /* ignore */
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { enabled: next } }))
}

interface DiagnoseContext {
    resumeId?: string
    moduleType?: string
    moduleInstanceId?: string
    fieldKey?: string
}

/**
 * 实时写作助手：编辑停顿后对当前要点做快速诊断。
 * - 防抖 + 同内容去重 + 竞态守卫，控制请求成本
 * - 开关状态持久化到 localStorage，跨组件同步（设置面板切换后实时生效）
 */
export const useWritingAssistant = () => {
    const [state, setState] = useState<WritingAssistantState>({
        loading: false,
        diagnoses: [],
        dismissed: new Set(),
    })
    const [enabled, setEnabledState] = useState<boolean>(readEnabled)

    const requestIdRef = useRef(0)
    const debounceRef = useRef<number | null>(null)
    const lastContentRef = useRef<string>('')
    const lastRequestAtRef = useRef<number>(0)

    // 监听设置面板等外部对开关的修改，实时同步本实例状态
    useEffect(() => {
        const sync = () => {
            const next = readEnabled()
            setEnabledState((prev) => (prev !== next ? next : prev))
            if (!next) {
                requestIdRef.current += 1
                if (debounceRef.current) window.clearTimeout(debounceRef.current)
                setState({ loading: false, diagnoses: [], dismissed: new Set() })
            }
        }
        window.addEventListener(CHANGE_EVENT, sync)
        window.addEventListener('storage', sync)
        return () => {
            window.removeEventListener(CHANGE_EVENT, sync)
            window.removeEventListener('storage', sync)
        }
    }, [])

    const setEnabled = useCallback((next: boolean) => {
        setWritingAssistantEnabled(next)
    }, [])

    const runDiagnose = useCallback(async (content: string, ctx: DiagnoseContext) => {
        const trimmed = content.trim()
        if (trimmed.length < MIN_CONTENT_LENGTH) {
            setState((prev) => ({ ...prev, diagnoses: [] }))
            return
        }
        // 同内容去重 + 冷却时间
        const now = Date.now()
        if (trimmed === lastContentRef.current && now - lastRequestAtRef.current < REPEAT_COOLDOWN_MS) {
            return
        }
        lastContentRef.current = trimmed
        lastRequestAtRef.current = now

        const nextRequestId = requestIdRef.current + 1
        requestIdRef.current = nextRequestId
        setState((prev) => ({ ...prev, loading: true }))

        try {
            const output = await aiApi.writingDiagnose({
                resumeId: ctx.resumeId,
                moduleType: ctx.moduleType,
                moduleInstanceId: ctx.moduleInstanceId,
                fieldKey: ctx.fieldKey,
                content: trimmed,
            })
            if (requestIdRef.current !== nextRequestId) return
            setState({ loading: false, diagnoses: output.diagnoses, dismissed: new Set() })
        } catch {
            if (requestIdRef.current !== nextRequestId) return
            // 写作助手为辅助功能，失败静默（不打断用户编辑）
            setState((prev) => ({ ...prev, loading: false }))
        }
    }, [])

    // 防抖触发：编辑停顿 DEBOUNCE_MS 后诊断
    const trigger = useCallback((content: string, ctx: DiagnoseContext) => {
        if (!enabled) return
        if (debounceRef.current) window.clearTimeout(debounceRef.current)
        debounceRef.current = window.setTimeout(() => {
            void runDiagnose(content, ctx)
        }, DEBOUNCE_MS)
    }, [enabled, runDiagnose])

    const dismiss = useCallback((code: string) => {
        setState((prev) => {
            const dismissed = new Set(prev.dismissed)
            dismissed.add(code)
            return { ...prev, dismissed }
        })
    }, [])

    const clear = useCallback(() => {
        requestIdRef.current += 1
        if (debounceRef.current) window.clearTimeout(debounceRef.current)
        lastContentRef.current = ''
        setState({ loading: false, diagnoses: [], dismissed: new Set() })
    }, [])

    const visibleDiagnoses = state.diagnoses.filter((d) => !state.dismissed.has(d.code))

    return {
        enabled,
        setEnabled,
        loading: state.loading,
        diagnoses: visibleDiagnoses,
        trigger,
        dismiss,
        clear,
    }
}
