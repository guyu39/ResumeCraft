import type { ApiResponse, AuthPayload } from './types'

const API_BASE = '/api'
const ACCESS_TOKEN_KEY = 'accessToken'
const REFRESH_TOKEN_KEY = 'refreshToken'
const SESSION_END_REASON_KEY = 'resumecraft_auth_end_reason'
const REFRESH_LOCK_NAME = 'resumecraft-auth-refresh'
const CHANNEL_NAME = 'resumecraft-auth-session'
const EARLY_REFRESH_MS = 90_000
const TRANSIENT_RETRY_MS = 30_000

export const AUTH_SESSION_EVENT = 'resumecraft:auth-session'
export const BEFORE_SESSION_END_EVENT = 'resumecraft:before-session-end'

export type SessionEndReason = 'expired' | 'kicked' | 'logout'

export type AuthSessionEventDetail =
  | { type: 'tokens-updated' }
  | { type: 'terminated'; reason: SessionEndReason }

type ChannelMessage = AuthSessionEventDetail

interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>
}

interface RefreshResponseBody extends ApiResponse<AuthPayload> {
  data?: AuthPayload
}

export class AuthSessionError extends Error {
  constructor(
    message: string,
    public kind: 'terminal' | 'transient',
    public code: string,
    public status: number,
  ) {
    super(message)
    this.name = 'AuthSessionError'
  }
}

let refreshPromise: Promise<string> | null = null
let refreshTimer: number | null = null
let sessionEndHandled = false
let channel: BroadcastChannel | null = null

function emitSessionEvent(detail: AuthSessionEventDetail) {
  window.dispatchEvent(new CustomEvent<AuthSessionEventDetail>(AUTH_SESSION_EVENT, { detail }))
}

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
      if (event.data?.type === 'tokens-updated') {
        sessionEndHandled = false
        scheduleProactiveRefresh()
        emitSessionEvent(event.data)
        return
      }
      if (event.data?.type === 'terminated') {
        terminateSession(event.data.reason, { broadcast: false })
      }
    }
  }
  return channel
}

function broadcast(message: ChannelMessage) {
  getChannel()?.postMessage(message)
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  localStorage.removeItem(SESSION_END_REASON_KEY)
  sessionEndHandled = false
  scheduleProactiveRefresh()
  const message: AuthSessionEventDetail = { type: 'tokens-updated' }
  broadcast(message)
}

export function clearTokens(reason: SessionEndReason = 'logout') {
  localStorage.setItem(SESSION_END_REASON_KEY, reason)
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  clearRefreshTimer()
}

export function isTerminalAuthError(error: unknown): error is AuthSessionError {
  return error instanceof AuthSessionError && error.kind === 'terminal'
}

export function getSafeReturnUrl(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  try {
    const url = new URL(value, window.location.origin)
    if (url.origin !== window.location.origin) return '/'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/'
  }
}

function currentReturnUrl(): string {
  const url = new URL(window.location.href)
  url.searchParams.delete('reason')
  url.searchParams.delete('return')
  url.searchParams.delete('login')
  return getSafeReturnUrl(`${url.pathname}${url.search}${url.hash}`)
}

export function terminateSession(
  reason: SessionEndReason,
  options: { broadcast?: boolean; redirect?: boolean } = {},
) {
  if (sessionEndHandled) return
  sessionEndHandled = true

  const shouldBroadcast = options.broadcast !== false
  const shouldRedirect = options.redirect ?? reason !== 'logout'
  const returnUrl = currentReturnUrl()

  window.dispatchEvent(new CustomEvent(BEFORE_SESSION_END_EVENT, { detail: { reason } }))
  localStorage.setItem(SESSION_END_REASON_KEY, reason)
  if (shouldBroadcast) broadcast({ type: 'terminated', reason })
  clearTokens(reason)
  emitSessionEvent({ type: 'terminated', reason })

  if (!shouldRedirect) return
  const url = new URL(window.location.href)
  url.searchParams.set('reason', reason === 'kicked' ? 'kicked' : 'expired')
  url.searchParams.set('return', returnUrl)
  window.location.replace(`${url.pathname}${url.search}`)
}

function decodeClaims(token: string): { exp?: number; uid?: string } | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(atob(padded)) as { exp?: number; uid?: string }
  } catch {
    return null
  }
}

function decodeExpiry(token: string): number | null {
  const claims = decodeClaims(token)
  return typeof claims?.exp === 'number' ? claims.exp * 1000 : null
}

export function getTokenUserID(token: string): string | null {
  const userID = decodeClaims(token)?.uid
  return typeof userID === 'string' && userID ? userID : null
}

export function isSameTokenUser(left: string, right: string): boolean {
  const userID = getTokenUserID(left)
  return userID !== null && userID === getTokenUserID(right)
}

function clearRefreshTimer() {
  if (refreshTimer !== null) {
    window.clearTimeout(refreshTimer)
    refreshTimer = null
  }
}

function scheduleTransientRetry() {
  clearRefreshTimer()
  if (!getRefreshToken()) return
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null
    void runProactiveRefresh()
  }, TRANSIENT_RETRY_MS)
}

function scheduleProactiveRefresh() {
  clearRefreshTimer()
  const accessToken = getAccessToken()
  const refreshToken = getRefreshToken()
  if (!accessToken || !refreshToken) return

  const expiresAt = decodeExpiry(accessToken)
  if (expiresAt === null) return
  const delay = Math.max(0, expiresAt - Date.now() - EARLY_REFRESH_MS)
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null
    void runProactiveRefresh()
  }, delay)
}

async function runProactiveRefresh() {
  if (!getRefreshToken()) return
  if (document.hidden || !navigator.onLine) {
    scheduleTransientRetry()
    return
  }
  try {
    await ensureFreshAccessToken()
    scheduleProactiveRefresh()
  } catch (error) {
    if (!isTerminalAuthError(error)) scheduleTransientRetry()
  }
}

async function parseRefreshBody(response: Response): Promise<RefreshResponseBody | null> {
  try {
    return await response.json() as RefreshResponseBody
  } catch {
    return null
  }
}

function refreshError(
  body: RefreshResponseBody | null,
  status: number,
  tokenUsed: string,
): AuthSessionError {
  const code = body?.code || 'REFRESH_FAILED'
  const message = body?.message || (status >= 500 ? '认证服务暂时不可用' : '登录状态已失效')
  const tokenRotatedElsewhere = getRefreshToken() && getRefreshToken() !== tokenUsed && getAccessToken()
  if (tokenRotatedElsewhere) {
    return new AuthSessionError('Refresh Token 已由其他标签页轮换', 'transient', 'TOKEN_ROTATED', status)
  }
  const terminalCodes = new Set(['INVALID_REFRESH_TOKEN', 'TOKEN_REVOKED', 'UNAUTHORIZED'])
  const terminal = status === 401 || status === 403 || terminalCodes.has(code)
  return new AuthSessionError(message, terminal ? 'terminal' : 'transient', code, status)
}

async function performRefresh(refreshToken: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
  } catch {
    throw new AuthSessionError('网络异常，暂时无法刷新登录状态', 'transient', 'NETWORK_ERROR', 0)
  }

  const body = await parseRefreshBody(response)
  if (response.ok && body?.code === 'OK' && body.data?.tokens) {
    const tokens = body.data.tokens
    setTokens(tokens.accessToken, tokens.refreshToken)
    return tokens.accessToken
  }

  const rotatedAccessToken = getRefreshToken() !== refreshToken ? getAccessToken() : null
  if (rotatedAccessToken) return rotatedAccessToken
  throw refreshError(body, response.status, refreshToken)
}

async function withRefreshLock<T>(callback: () => Promise<T>): Promise<T> {
  const locks = (navigator as Navigator & { locks?: LockManagerLike }).locks
  if (!locks) return callback()
  return locks.request(REFRESH_LOCK_NAME, callback)
}

export async function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    const requestedRefreshToken = getRefreshToken()
    refreshPromise = withRefreshLock(async () => {
      const currentRefreshToken = getRefreshToken()
      if (!currentRefreshToken) {
        throw new AuthSessionError('登录状态已失效', 'terminal', 'NO_REFRESH_TOKEN', 401)
      }

      if (requestedRefreshToken && currentRefreshToken !== requestedRefreshToken) {
        const currentAccessToken = getAccessToken()
        if (currentAccessToken) return currentAccessToken
      }
      return performRefresh(currentRefreshToken)
    }).catch((error: unknown) => {
      if (isTerminalAuthError(error)) terminateSession('expired')
      throw error
    }).finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

export async function ensureFreshAccessToken(): Promise<string> {
  const accessToken = getAccessToken()
  const refreshToken = getRefreshToken()
  if (!accessToken) {
    if (refreshToken) return refreshAccessToken()
    const error = new AuthSessionError('请先登录', 'terminal', 'NO_AUTH_TOKEN', 401)
    terminateSession('expired')
    throw error
  }

  // exp 解码失败（token 损坏/结构异常）时也走刷新，避免带着坏 token 先发一次注定 401 的请求。
  const expiresAt = decodeExpiry(accessToken)
  const cannotDecode = expiresAt === null
  if (cannotDecode || expiresAt - Date.now() <= EARLY_REFRESH_MS) {
    const refreshedAccessToken = await refreshAccessToken()
    // 原 token 无法解码 uid 时做用户一致性校验只会误报 SESSION_CHANGED，此时直接采用刷新结果。
    if (!cannotDecode && !isSameTokenUser(refreshedAccessToken, accessToken)) {
      throw new AuthSessionError(
        '登录账号已切换，请重试当前操作',
        'transient',
        'SESSION_CHANGED',
        401,
      )
    }
    return refreshedAccessToken
  }
  return accessToken
}

export function startAuthSessionLifecycle(): () => void {
  getChannel()
  scheduleProactiveRefresh()

  const onVisibilityChange = () => {
    if (!document.hidden) void runProactiveRefresh()
  }
  const onOnline = () => { void runProactiveRefresh() }
  const onStorage = (event: StorageEvent) => {
    if (event.key === SESSION_END_REASON_KEY && event.newValue) {
      const reason = event.newValue as SessionEndReason
      if (reason === 'expired' || reason === 'kicked' || reason === 'logout') {
        terminateSession(reason, { broadcast: false })
      }
      return
    }
    if ((event.key === ACCESS_TOKEN_KEY || event.key === REFRESH_TOKEN_KEY) && event.newValue) {
      sessionEndHandled = false
      scheduleProactiveRefresh()
      // BroadcastChannel 可用时由消息通道通知 Store；storage 仅作为旧浏览器兜底。
      if (!channel && event.key === REFRESH_TOKEN_KEY) {
        emitSessionEvent({ type: 'tokens-updated' })
      }
    }
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('online', onOnline)
  window.addEventListener('storage', onStorage)
  return () => {
    clearRefreshTimer()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('storage', onStorage)
  }
}
