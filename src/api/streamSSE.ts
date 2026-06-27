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
}

/**
 * 发起一个 SSE 流式 POST 请求。
 * - 按 `\n` 切分，保留未结束的尾行到下次（跨网络分片安全）
 * - `data: {json}` → onEvent
 * - `event: done` 的下一行 `data:` → parseDone → resolve
 * - signal.abort() → xhr.abort() 并 reject(AbortError)
 */
export function streamSSE<TEvent = unknown, TResult = void>(
  opts: StreamSSEOptions<TEvent, TResult>,
): Promise<TResult> {
  const { url, body, onEvent, parseDone, signal, errorLabel = '请求失败' } = opts

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

    const onAbort = () => {
      try { xhr.abort() } catch { /* ignore */ }
      reject(new DOMException('Aborted', 'AbortError'))
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true })
    const cleanup = () => { if (signal) signal.removeEventListener('abort', onAbort) }

    let lastPos = 0
    let buffer = ''

    xhr.onprogress = () => {
      if (xhr.status >= 400) return
      const text = xhr.responseText
      buffer += text.slice(lastPos)
      lastPos = text.length

      const lines = buffer.split('\n')
      // 保留最后一段未以 \n 结束的内容，等下次分片拼接，避免半截 JSON 被丢弃
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('event:')) continue
        if (!line.startsWith('data: ')) continue
        const content = line.slice(6).trim()
        if (!content) continue
        try {
          onEvent(JSON.parse(content) as TEvent)
        } catch {
          // 非 JSON 数据行，忽略
        }
      }
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
      if (!parseDone) {
        resolve(undefined as TResult)
        return
      }
      // 找到 `event: done` 后紧跟的 data 行
      const lines = xhr.responseText.split('\n')
      for (let i = 0; i < lines.length; i += 1) {
        if (!lines[i].startsWith('event: done')) continue
        const dataLine = lines[i + 1]
        if (dataLine && dataLine.startsWith('data: ')) {
          try {
            resolve(parseDone(dataLine.slice(6)))
            return
          } catch { /* ignore */ }
        }
      }
      reject(new Error('未收到结果'))
    }

    xhr.onerror = () => { cleanup(); reject(new Error('网络错误')) }

    xhr.send(JSON.stringify(body))
  })
}
