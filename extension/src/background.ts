import { storage } from './core/storage'

const API_BASE_DEFAULT = 'http://localhost:8080'

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'API_REQUEST') {
    handleApiRequest(msg)
      .then(sendResponse)
      .catch((err: Error) => sendResponse({ error: err.message }))
    return true
  }

  if (msg.type === 'GET_AUTH_STATUS') {
    storage.getJwt().then((jwt) => {
      sendResponse({ authenticated: !!jwt })
    })
    return true
  }

  if (msg.type === 'SET_JWT') {
    storage.setJwt(msg.jwt as string).then(() => sendResponse({ ok: true }))
    return true
  }

  if (msg.type === 'LOGOUT') {
    storage.clearJwt().then(() => sendResponse({ ok: true }))
    return true
  }

  return false
})

async function handleApiRequest(msg: {
  method: string
  path: string
  body?: unknown
  params?: Record<string, string>
}) {
  const jwt = await storage.getJwt()
  const apiBase = await storage.getApiBase()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (jwt) {
    headers['Authorization'] = `Bearer ${jwt}`
  }

  let url = `${apiBase || API_BASE_DEFAULT}/api${msg.path}`
  if (msg.params) {
    const qs = new URLSearchParams(msg.params).toString()
    url += `?${qs}`
  }

  const fetchOpts: RequestInit = {
    method: msg.method,
    headers,
  }
  if (msg.body && msg.method !== 'GET') {
    fetchOpts.body = JSON.stringify(msg.body)
  }

  const resp = await fetch(url, fetchOpts)
  const data = await resp.json()

  if (!resp.ok) {
    throw new Error(data.message || `API error ${resp.status}`)
  }
  return data
}
