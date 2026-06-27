// ============================================================
// useAIRequest — 非流式 AI 请求的公共三件套（loading/error/result + 竞态守卫 + 可选缓存）
// 取代 useJDScore / useCoverLetter 等里逐份复制的样板。
// ============================================================

import { useCallback, useRef, useState } from 'react'

interface AIRequestState<TRes> {
  loading: boolean
  error: string | null
  result: TRes | null
  lastAt: number | null
}

const initialState = <TRes>(): AIRequestState<TRes> => ({
  loading: false,
  error: null,
  result: null,
  lastAt: null,
})

export interface UseAIRequestOptions<TArgs extends unknown[], TRes> {
  /** 实际发起请求的函数 */
  run: (...args: TArgs) => Promise<TRes>
  /** 发起前的校验，返回字符串表示错误信息（阻止请求），返回 null/undefined 表示通过 */
  validate?: (...args: TArgs) => string | null | undefined
  /** 缓存键：相同 key 命中缓存直接返回，避免重复烧 token。返回 null 表示不缓存本次 */
  cacheKey?: (...args: TArgs) => string | null
  /** 默认错误信息 */
  defaultError?: string
}

/**
 * 通用非流式 AI 请求 hook。
 * - 自动管理 loading/error/result
 * - requestIdRef 竞态守卫：仅最后一次调用的结果会写入 state
 * - 可选 cacheKey：相同输入命中内存缓存（按 hook 实例隔离）
 */
export function useAIRequest<TArgs extends unknown[], TRes>(
  opts: UseAIRequestOptions<TArgs, TRes>,
) {
  const { run, validate, cacheKey, defaultError = 'AI 请求失败' } = opts
  const [state, setState] = useState<AIRequestState<TRes>>(initialState<TRes>)
  const requestIdRef = useRef(0)
  const cacheRef = useRef<Map<string, TRes>>(new Map())

  const execute = useCallback(
    async (...args: TArgs): Promise<TRes | null> => {
      if (state.loading) return state.result

      const validationError = validate?.(...args)
      if (validationError) {
        setState((prev) => ({ ...prev, error: validationError }))
        return null
      }

      const key = cacheKey?.(...args) ?? null
      if (key && cacheRef.current.has(key)) {
        const cached = cacheRef.current.get(key)!
        setState({ loading: false, error: null, result: cached, lastAt: Date.now() })
        return cached
      }

      const reqId = requestIdRef.current + 1
      requestIdRef.current = reqId
      setState((prev) => ({ ...prev, loading: true, error: null }))

      try {
        const res = await run(...args)
        if (requestIdRef.current !== reqId) return null
        if (key) cacheRef.current.set(key, res)
        setState({ loading: false, error: null, result: res, lastAt: Date.now() })
        return res
      } catch (err) {
        if (requestIdRef.current !== reqId) return null
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : defaultError,
        }))
        return null
      }
    },
    [state.loading, state.result, run, validate, cacheKey, defaultError],
  )

  const reset = useCallback(() => {
    requestIdRef.current += 1
    setState(initialState<TRes>())
  }, [])

  /** 直接写入结果（用于历史恢复） */
  const setResult = useCallback((result: TRes | null) => {
    setState((prev) => ({ ...prev, result, error: null }))
  }, [])

  return {
    ...state,
    hasResult: Boolean(state.result),
    execute,
    reset,
    setResult,
  }
}
