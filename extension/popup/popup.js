const API_BASE_KEY = 'rc_api_base'

async function getApiBase(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get(API_BASE_KEY, (result) => {
      resolve(result[API_BASE_KEY] || 'http://localhost:8080')
    })
  })
}

async function setApiBase(base: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [API_BASE_KEY]: base }, resolve)
  })
}

async function getJwt(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.session.get('rc_jwt', (result) => {
      resolve(result.rc_jwt || null)
    })
  })
}

async function setJwt(jwt: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.session.set({ rc_jwt: jwt }, resolve)
  })
}

async function clearJwt(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.session.remove('rc_jwt', resolve)
  })
}

async function apiRequest(method: string, path: string, body?: unknown) {
  const jwt = await getJwt()
  const base = await getApiBase()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`

  const resp = await fetch(`${base}/api${path}`, {
    method,
    headers,
    body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.message || `API error ${resp.status}`)
  return data
}

interface ResumeListItem {
  id: string
  title: string
  latestSnapshotId?: string | null
}

interface SnapshotItem {
  id: string
  label: string
  snapshotType: string
  versionNo: number
}

const loginView = document.getElementById('login-view')!
const mainView = document.getElementById('main-view')!
const emailInput = document.getElementById('email') as HTMLInputElement
const passwordInput = document.getElementById('password') as HTMLInputElement
const apiBaseInput = document.getElementById('api-base') as HTMLInputElement
const loginBtn = document.getElementById('login-btn') as HTMLButtonElement
const loginError = document.getElementById('login-error')!
const logoutBtn = document.getElementById('logout-btn')!
const statusIcon = document.getElementById('status-icon')!
const statusText = document.getElementById('status-text')!
const statusBar = document.getElementById('page-status')!
const resumeSelect = document.getElementById('resume-select') as HTMLSelectElement
const snapshotSelect = document.getElementById('snapshot-select') as HTMLSelectElement
const fillBtn = document.getElementById('fill-btn') as HTMLButtonElement
const fillResult = document.getElementById('fill-result')!
const filledCount = document.getElementById('filled-count')!
const unmatchedCount = document.getElementById('unmatched-count')!

let currentPlatform: string | null = null

async function init() {
  const jwt = await getJwt()
  if (jwt) {
    try {
      await apiRequest('GET', '/auth/me')
      showMainView()
    } catch {
      await clearJwt()
      showLoginView()
    }
  } else {
    showLoginView()
  }
}

function showLoginView() {
  loginView.classList.remove('hidden')
  mainView.classList.add('hidden')
}

function showMainView() {
  loginView.classList.add('hidden')
  mainView.classList.remove('hidden')
  detectPage()
  loadResumes()
}

async function detectPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'PING' })
    if (response.detected && response.isApplyPage) {
      statusBar.className = 'status-bar detected'
      statusIcon.textContent = '✅'
      statusText.textContent = `已识别: ${response.platform}`
      currentPlatform = response.platform
      fillBtn.disabled = false
    } else if (response.detected) {
      statusBar.className = 'status-bar not-apply'
      statusIcon.textContent = '⚠️'
      statusText.textContent = `${response.platform} — 非投递页面`
      currentPlatform = response.platform
      fillBtn.disabled = true
    } else {
      statusBar.className = 'status-bar unsupported'
      statusIcon.textContent = '❌'
      statusText.textContent = '当前页面不支持'
      currentPlatform = null
      fillBtn.disabled = true
    }
  } catch {
    statusBar.className = 'status-bar unsupported'
    statusIcon.textContent = '❌'
    statusText.textContent = '无法连接到页面'
    fillBtn.disabled = true
  }
}

async function loadResumes() {
  try {
    const data = await apiRequest('GET', '/resumes')
    const resumes: ResumeListItem[] = data.data || data

    resumeSelect.innerHTML = ''
    if (resumes.length === 0) {
      resumeSelect.innerHTML = '<option value="">暂无简历</option>'
      fillBtn.disabled = true
      return
    }

    for (const r of resumes) {
      const opt = document.createElement('option')
      opt.value = r.id
      opt.textContent = r.title
      resumeSelect.appendChild(opt)
    }

    if (resumes.length > 0) {
      loadSnapshots(resumes[0].id)
    }
  } catch (err) {
    resumeSelect.innerHTML = '<option value="">加载失败</option>'
    console.error('Failed to load resumes:', err)
  }
}

async function loadSnapshots(resumeId: string) {
  try {
    const data = await apiRequest('GET', `/resumes/${resumeId}/snapshots?limit=20`)
    const snapshots: SnapshotItem[] = data.data?.snapshots || data.snapshots || []

    if (snapshots.length <= 1) {
      snapshotSelect.classList.add('hidden')
      return
    }

    snapshotSelect.classList.remove('hidden')
    snapshotSelect.innerHTML = '<option value="">当前版本</option>'

    for (const s of snapshots) {
      if (s.snapshotType === 'default') continue
      const opt = document.createElement('option')
      opt.value = s.id
      opt.textContent = s.label || `v${s.versionNo}`
      snapshotSelect.appendChild(opt)
    }
  } catch {
    snapshotSelect.classList.add('hidden')
  }
}

async function handleFill() {
  fillBtn.disabled = true
  fillBtn.textContent = '填充中...'

  try {
    const resumeId = resumeSelect.value
    if (!resumeId) return

    const snapshotId = snapshotSelect.value || undefined

    const detail = await apiRequest('GET', `/resumes/${resumeId}`)
    const resumeData = detail.data || detail

    let modules = resumeData.modules || resumeData.content?.modules || []

    if (snapshotId) {
      const snapData = await apiRequest('GET', `/resumes/${resumeId}/snapshots/${snapshotId}`)
      const snapshot = snapData.data || snapData
      modules = snapshot.content?.modules || snapshot.modules || modules
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error('No active tab')

    const result = await chrome.tabs.sendMessage(tab.id, {
      type: 'FILL_FORM',
      modules,
    })

    if (result.error) throw new Error(result.error)

    filledCount.textContent = String(result.filled ?? 0)
    unmatchedCount.textContent = String(result.unmatched ?? 0)
    fillResult.classList.remove('hidden')
  } catch (err) {
    console.error('Fill failed:', err)
    alert(`填充失败: ${err instanceof Error ? err.message : '未知错误'}`)
  } finally {
    fillBtn.disabled = false
    fillBtn.textContent = '一键填充'
  }
}

loginBtn.addEventListener('click', async () => {
  loginBtn.disabled = true
  loginError.classList.add('hidden')

  try {
    await setApiBase(apiBaseInput.value.replace(/\/$/, ''))
    const data = await apiRequest('POST', '/auth/login', {
      email: emailInput.value,
      password: passwordInput.value,
    })

    const token = data.data?.token || data.token
    if (!token) throw new Error('登录响应缺少 token')

    await setJwt(token)
    showMainView()
  } catch (err) {
    loginError.textContent = err instanceof Error ? err.message : '登录失败'
    loginError.classList.remove('hidden')
  } finally {
    loginBtn.disabled = false
  }
})

logoutBtn.addEventListener('click', async () => {
  await clearJwt()
  showLoginView()
})

resumeSelect.addEventListener('change', () => {
  loadSnapshots(resumeSelect.value)
})

fillBtn.addEventListener('click', handleFill)

init()
