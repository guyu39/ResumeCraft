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
      throw new ApiError(json.code, json.message, res.status)
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
          throw new ApiError(json.code, json.message, res.status)
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