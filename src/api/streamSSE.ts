// ============================================================
// streamSSE — 统一的 SSE 流式请求工具
// 取代此前 5 处 AI 流式接口各自复制的 XHR + 行缓冲 + event:done 解析逻辑。
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
 * - signal.abort() → xhr.abort() 并 reject(AbortError)
 * - 超过 timeoutMs 无完成 → reject 超时错误
 */
export function streamSSE<TEvent = unknown, TResult = void>(
  opts: StreamSSEOptions<TEvent, TResult>,
): Promise<TResult> {
  const { url, body, onEvent, parseDone, signal, errorLabel = '请求失败', timeoutMs = 120000 } = opts

  return new Promise<TResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    const token = localStorage.getItem('accessToken')
    if (!token) {
      reject(new Error('请登录使用'))
      return
    }

    const xhr = new XMLHttpRequest()
    xhr.open('POST', url, true)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    // 浏览器原生超时：到点触发 ontimeout（即便流中途卡死也能解除等待）
    xhr.timeout = timeoutMs

    const onAbort = () => {
      try { xhr.abort() } catch { /* ignore */ }
      reject(new DOMException('Aborted', 'AbortError'))
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true })
    const cleanup = () => { if (signal) signal.removeEventListener('abort', onAbort) }

    let lastPos = 0
    let buffer = ''
    // 边收边解析 done：解析阶段标记下一条 data 行为最终结果，避免 onload 重切全文
    let doneResult: TResult | undefined
    let hasDone = false
    let expectDoneData = false

    const handleLine = (line: string) => {
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
        } catch { /* 解析失败，留待 onload 兜底报错 */ }
        return
      }
      try {
        onEvent(JSON.parse(content) as TEvent)
      } catch {
        // 非 JSON 数据行，忽略
      }
    }

    xhr.onprogress = () => {
      if (xhr.status >= 400) return
      const text = xhr.responseText
      buffer += text.slice(lastPos)
      lastPos = text.length

      const lines = buffer.split('\n')
      // 保留最后一段未以 \n 结束的内容，等下次分片拼接，避免半截 JSON 被丢弃
      buffer = lines.pop() ?? ''
      for (const line of lines) handleLine(line)
    }

    xhr.onload = () => {
      cleanup()
      if (xhr.status >= 400) {
        let msg = `${errorLabel} (${xhr.status})`
        try {
          const b = JSON.parse(xhr.responseText)
          msg = b?.error?.message || b?.message || msg
        } catch { /* keep default */ }
        reject(new Error(msg))
        return
      }
      // 处理最后一段未以 \n 结束的缓冲行
      if (buffer) handleLine(buffer)
      if (!parseDone) {
        resolve(undefined as TResult)
        return
      }
      if (hasDone) {
        resolve(doneResult as TResult)
        return
      }
      reject(new Error('未收到结果'))
    }

    xhr.onerror = () => { cleanup(); reject(new Error('网络错误')) }
    xhr.ontimeout = () => { cleanup(); reject(new Error(`${errorLabel}：请求超时，请重试`)) }

    xhr.send(JSON.stringify(body))
  })
}
