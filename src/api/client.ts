// ============================================================
// API 客户端 - 封装 fetch 和统一错误处理
// ============================================================

import type { ApiResponse } from './types'

const API_BASE = '/api'

class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// 状态码兜底文案（后端/代理未给出可读 message 时使用）
function fallbackByStatus(status: number): string {
  if (status === 0 || status === 502 || status === 503 || status === 504) return '服务暂时不可用，请确认后端已启动后重试'
  if (status === 401) return '登录状态已失效，请重新登录'
  if (status === 403) return '没有权限执行此操作'
  if (status === 404) return '请求的资源不存在'
  if (status >= 500) return '服务异常，请稍后重试'
  return '请求失败，请稍后重试'
}

// 解析错误信息：兼容后端标准结构 { message } 与 vite 代理错误结构 { error: { message } }，
// 二者皆空时回退到状态码文案，避免提示出现空白。
function resolveErrorMessage(json: unknown, status: number): string {
  const obj = (json ?? {}) as { message?: string; error?: { message?: string } }
  const msg = obj.message?.trim() || obj.error?.message?.trim()
  return msg || fallbackByStatus(status)
}

function getToken(): string | null {
  return localStorage.getItem('accessToken')
}

function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('accessToken', accessToken)
  localStorage.setItem('refreshToken', refreshToken)
}

function clearTokens() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
}

// 并发 401 时共享同一次刷新，避免多个请求各自刷新导致 refresh token 互相失效
let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) return null

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        const refreshJson = await refreshRes.json()
        if (refreshJson.code === 'OK') {
          const { accessToken, refreshToken: newRefresh } = refreshJson.data.tokens
          setTokens(accessToken, newRefresh)
          return accessToken as string
        }
        return null
      } catch {
        return null
      } finally {
        // 无论成功失败都释放，下次 401 可重新发起
        refreshPromise = null
      }
    })()
  }

  return refreshPromise
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: { auth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (options.auth !== false && getToken()) {
    headers['Authorization'] = `Bearer ${getToken()}`
  }

  const doRequest = async (): Promise<T> => {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    let json: ApiResponse<T>
    try {
      json = await res.json()
    } catch {
      // 后端 / 代理返回了非 JSON 响应（如 token 无效时 nginx 的 HTML 错误页）
      throw new ApiError('PARSE_ERROR', res.statusText || `请求失败: ${res.status}`, res.status)
    }

    if (json.code !== 'OK') {
      throw new ApiError(json.code, resolveErrorMessage(json, res.status), res.status)
    }

    return json.data as T
  }

  try {
    return await doRequest()
  } catch (err) {
    // 401 且是认证请求，尝试刷新 token 后重试一次
    if (err instanceof ApiError && err.status === 401 && options.auth !== false) {
      const accessToken = await refreshAccessToken()
      if (accessToken) {
        // 重试：带上新 token
        headers['Authorization'] = `Bearer ${accessToken}`
        const res = await fetch(`${API_BASE}${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        })
        const json: ApiResponse<T> = await res.json()
        if (json.code !== 'OK') {
          throw new ApiError(json.code, resolveErrorMessage(json, res.status), res.status)
        }
        return json.data as T
      }
    }
    throw err
  }
}

// 导出供外部使用
export const apiClient = {
  get: <T>(path: string, options?: { auth?: boolean }) =>
    request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: { auth?: boolean }) =>
    request<T>('POST', path, body, options),
  put: <T>(path: string, body?: unknown, options?: { auth?: boolean }) =>
    request<T>('PUT', path, body, options),
  delete: <T>(path: string, options?: { auth?: boolean }) =>
    request<T>('DELETE', path, undefined, options),
}

export { ApiError, getToken, setTokens, clearTokens }