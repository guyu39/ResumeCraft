import {
  AuthSessionError,
  ensureFreshAccessToken,
  getAccessToken,
  isSameTokenUser,
  refreshAccessToken,
  terminateSession,
} from './authSession'

async function responseCode(response: Response): Promise<string> {
  try {
    const body = await response.clone().json() as { code?: string }
    return body.code || ''
  } catch {
    return ''
  }
}

function withAuthorization(init: RequestInit, accessToken: string): RequestInit {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)
  return { ...init, headers }
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const accessToken = await ensureFreshAccessToken()
  const firstResponse = await fetch(input, withAuthorization(init, accessToken))
  if (firstResponse.status !== 401) return firstResponse

  const firstCode = await responseCode(firstResponse)
  const currentAccessToken = getAccessToken()
  const tokenChanged = !!currentAccessToken && currentAccessToken !== accessToken
  const sameUserRotation = tokenChanged && isSameTokenUser(currentAccessToken, accessToken)
  if (tokenChanged && !sameUserRotation) {
    throw new AuthSessionError(
      '登录账号已切换，请重试当前操作',
      'transient',
      'SESSION_CHANGED',
      401,
    )
  }
  if (firstCode === 'SESSION_KICKED' && !sameUserRotation) {
    terminateSession('kicked')
    throw new AuthSessionError('账号已在其他设备登录', 'terminal', firstCode, 401)
  }

  // 401/SESSION_KICKED 返回前，其他请求或标签页可能已经完成正常轮换。
  // 此时旧 Session ID 被后端撤销，表现与被顶号相同，但应复用新 Token，而不是退出。
  const refreshedAccessToken = sameUserRotation
    ? currentAccessToken
    : await refreshAccessToken()
  if (!isSameTokenUser(refreshedAccessToken, accessToken)) {
    throw new AuthSessionError(
      '登录账号已切换，请重试当前操作',
      'transient',
      'SESSION_CHANGED',
      401,
    )
  }
  const retryResponse = await fetch(input, withAuthorization(init, refreshedAccessToken))
  if (retryResponse.status !== 401) return retryResponse

  const retryCode = await responseCode(retryResponse)
  const latestAccessToken = getAccessToken()
  if (latestAccessToken && latestAccessToken !== refreshedAccessToken) {
    const code = isSameTokenUser(latestAccessToken, refreshedAccessToken)
      ? 'TOKEN_ROTATED'
      : 'SESSION_CHANGED'
    throw new AuthSessionError(
      code === 'TOKEN_ROTATED' ? '登录状态刚刚更新，请重试当前操作' : '登录账号已切换，请重试当前操作',
      'transient',
      code,
      401,
    )
  }
  const reason = retryCode === 'SESSION_KICKED' ? 'kicked' : 'expired'
  terminateSession(reason)
  throw new AuthSessionError(
    reason === 'kicked' ? '账号已在其他设备登录' : '登录状态已失效，请重新登录',
    'terminal',
    retryCode || 'UNAUTHORIZED',
    401,
  )
}
