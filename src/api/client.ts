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