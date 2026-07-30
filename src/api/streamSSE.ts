// ============================================================

import { authenticatedFetch } from './authenticatedFetch'
// streamSSE — 统一的 SSE 流式请求工具
// 使用 Fetch Stream 复用统一鉴权，并集中处理行缓冲与 event:done。
// 提供：跨分片行缓冲、可选 AbortSignal 取消、统一的 done/错误处理。
// ============================================================

export interface StreamSSEOptions<TEvent, TResult> {
  url: string
  body: unknown
  /** 每条 `data:` 行解析出的事件回调 */
  onEvent: (evt: TEvent) => void
  /** 从最终 `event: done` 的数据行解析结果；不提供时 resolve(undefined) */
  parseDone?: (raw: string) => TResult
  /** 取消信号：abort 时主动关闭底层连接，停止烧 token */
  signal?: AbortSignal
  /** 默认错误信息前缀（如「生成失败」） */
  errorLabel?: string
  /** 超时毫秒数，默认 120s。模型挂起时给用户明确的超时反馈，而非无限等待 */
  timeoutMs?: number
}

/**
 * 发起一个 SSE 流式 POST 请求。
 * - 按 `\n` 切分，保留未结束的尾行到下次（跨网络分片安全）
 * - `data: {json}` → onEvent
 * - `event: done` 的下一行 `data:` → parseDone → resolve（边收边记录，不在 onload 重扫全文）
 * - signal.abort() → 中断 fetch/reader 并 reject(AbortError)
 * - 超过 timeoutMs 无完成 → reject 超时错误
 */
export async function streamSSE<TEvent = unknown, TResult = void>(
  opts: StreamSSEOptions<TEvent, TResult>,
): Promise<TResult> {
  const { url, body, onEvent, parseDone, signal, errorLabel = '请求失败', timeoutMs = 120000 } = opts
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const controller = new AbortController()
  let timedOut = false
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  const timer = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  try {
    const response = await authenticatedFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      let message = `${errorLabel} (${response.status})`
      try {
        const errorBody = await response.json() as { message?: string; error?: { message?: string } }
        message = errorBody.error?.message || errorBody.message || message
      } catch { /* keep default */ }
      throw new Error(message)
    }
    if (!response.body) throw new Error(`${errorLabel}：浏览器不支持流式响应`)

    reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let doneResult: TResult | undefined
    let hasDone = false
    let expectDoneData = false

    const handleLine = (rawLine: string) => {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
      if (line.startsWith('event: done')) {
        expectDoneData = true
        return
      }
      if (line.startsWith('event:')) {
        expectDoneData = false
        return
      }
      if (!line.startsWith('data: ')) return
      const content = line.slice(6).trim()
      if (!content) return

      if (expectDoneData && parseDone) {
        expectDoneData = false
        try {
          doneResult = parseDone(content)
          hasDone = true
        } catch { /* 解析失败，结束后统一提示 */ }
        return
      }
      try {
        onEvent(JSON.parse(content) as TEvent)
      } catch {
        // 非 JSON 数据行不属于业务事件。
      }
    }

    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) handleLine(line)
    }
    buffer += decoder.decode()
    if (buffer) handleLine(buffer)

    if (!parseDone) return undefined as TResult
    if (hasDone) return doneResult as TResult
    throw new Error('未收到结果')
  } catch (error) {
    if (timedOut) throw new Error(`${errorLabel}：请求超时，请重试`)
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (error instanceof TypeError) throw new Error('网络错误')
    throw error
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
    reader?.releaseLock()
  }
}
