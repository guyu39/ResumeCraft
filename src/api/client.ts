// ============================================================
// API 客户端 - 封装 fetch 和统一错误处理
// ============================================================

import type { ApiResponse } from './types'
import { authenticatedFetch } from './authenticatedFetch'
import {
  clearTokens,
  getAccessToken,
  setTokens,
} from './authSession'

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
  if (status === 0 || status === 502 || status === 503 || status === 504) return '服务暂时不可用，请稍后重试'
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
  return getAccessToken()
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: { auth?: boolean } = {}
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }
  const res = options.auth === false
    ? await fetch(`${API_BASE}${path}`, init)
    : await authenticatedFetch(`${API_BASE}${path}`, init)

  let json: ApiResponse<T>
  try {
    json = await res.json()
  } catch {
    throw new ApiError('PARSE_ERROR', res.statusText || `请求失败: ${res.status}`, res.status)
  }

  if (json.code !== 'OK') {
    throw new ApiError(json.code, resolveErrorMessage(json, res.status), res.status)
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
