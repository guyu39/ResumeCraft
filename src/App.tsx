// ============================================================
// App — 根组件
// ============================================================

import React, { useEffect, useState } from 'react'
import { useResumeStore, peekLocalDraft, flushToCloud } from '@/store/resumeStore'
import { useAuthStore } from '@/store/authStore'
import AppShell from '@/components/layout/AppShell'
import ShareViewPage from '@/pages/ShareViewPage'
import ApplicationsPage from '@/pages/ApplicationsPage'
import JobPostingsPage from '@/pages/JobPostingsPage'
import ResumeListPage from '@/components/layout/ResumeListPage'
import LoginPage from '@/components/layout/LoginPage'
import KickConfirmModal from '@/components/common/KickConfirmModal'
import { resumeApi, authApi } from '@/api'
import type { ResumeLocale, TemplateType, Module, ResumeStyleSettings } from '@/types/resume'

function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

/** 从云端恢复手动快照基准；云端空值必须清除本地遗留关联。 */
function restoreCloudSnapshotData(cloudResume: any) {
  const cloudId = cloudResume?.basedOnSnapshotId
  useResumeStore.getState().setBasedOnSnapshotIdFromStorage(cloudId || null)
  // 一次性清理：移除历史遗留的快照草稿 localStorage key（草稿中转层已废弃）
  try {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('resumecraft_snapshot_draft_')) toRemove.push(key)
    }
    for (const key of toRemove) localStorage.removeItem(key)
  } catch { /* ignore */ }
}

const App: React.FC = () => {
  const { initResume, loadFromStorage, setResumeVersion, setDraftsVersion, setPersonalDataFromStorage, setBasedOnSnapshotIdFromStorage } = useResumeStore()
  const { isAuthenticated, checkAuth, logout } = useAuthStore()
  // 单设备登录：检测到他设备后暂存了 loginTicket 待二次确认；确认前保持在登录页，不进入应用
  const kickPending = useAuthStore((s) => !!s.kickConfirm)
  const [authChecked, setAuthChecked] = useState(false)
  const [cloudResumes, setCloudResumes] = useState<any[]>([])
  const [showLogin, setShowLogin] = useState(false)

  // 把云端简历灌入 store（同步版本号/个人信息/云端 ID）。抽出供正常加载与冲突仲裁复用。
  const hydrateFromCloud = (cloud: any) => {
    restoreCloudSnapshotData(cloud)
    initResume({
      id: cloud.id,
      title: cloud.title,
      locale: cloud.locale as ResumeLocale,
      template: cloud.template as TemplateType,
      themeColor: cloud.themeColor,
      styleSettings: cloud.styleSettings as ResumeStyleSettings,
      modules: cloud.modules as Module[],
      updatedAt: cloud.updatedAt,
    })
    setResumeVersion((cloud as any).version ?? 0)
    setDraftsVersion((cloud as any).snapshotDraftsVersion ?? 0)
    // 头像上传是后端同步写 personal_data 的，但本地若刚上传了新头像、云端这次拉取的响应
    // 恰好是发起于上传之前的旧请求（网络时序），会用旧值覆盖本地刚显示的新头像。
    // 这里保留本地已有的新头像，不被本次云端数据的 avatar 字段覆盖。
    const localAvatar = (useResumeStore.getState().personalData as any)?.avatar
    const cloudPersonalData = (cloud as any).personalData ?? {}
    setPersonalDataFromStorage(localAvatar ? { ...cloudPersonalData, avatar: localAvatar } : cloudPersonalData)
    ;(window as any).__cloudSyncSetCloudId?.(cloud.id)
    // initResume 已把云端数据写入 store + localStorage（覆盖本地缓存）；
    // 再对齐 useCloudSync 同步指纹，认账「已是云端版」，避免随后又判 dirty 触发多余回写。
    ;(window as any).__cloudSyncMarkSyncedWith?.()
  }

  // 保留本地未提交的草稿（不被云端覆盖），并对齐云端版本号以便后续落库时覆盖云端。
  const keepLocalDraft = (draft: NonNullable<ReturnType<typeof peekLocalDraft>>, cloud: any) => {
    // 保留本端时不能先恢复云端 snapshotDrafts，否则会覆盖当前浏览器里的快照草稿。
    setBasedOnSnapshotIdFromStorage(draft.basedOnSnapshotId)
    const cloudVersion = (cloud as any).version ?? 0
    const cloudDraftsVersion = (cloud as any).snapshotDraftsVersion ?? 0
    initResume({
      id: draft.data.id,
      title: draft.data.title,
      locale: draft.data.locale,
      template: draft.data.template,
      themeColor: draft.data.themeColor,
      styleSettings: draft.data.styleSettings,
      modules: draft.data.modules,
      updatedAt: Date.now(),
    })
    // 对齐云端版本号：本地草稿提交时用云端 version 才能通过乐观锁覆盖
    setResumeVersion(cloudVersion)
    setDraftsVersion(cloudDraftsVersion)
    ;(window as any).__cloudSyncAlignVersion?.(cloud.id, cloudVersion, cloudDraftsVersion)
  }

  // 加载云端简历前，先检测本地是否有同一份简历的未提交草稿。
  // 单设备策略：只要本地草稿更新，就默认保留本端并自动落库，不再让用户仲裁。
  const loadCloudWithConflictCheck = async (cloud: any) => {
    const draft = peekLocalDraft()
    const shouldKeepLocal = draft && draft.data.id === cloud.id && draft.localRevision > draft.ackedRevision

    if (shouldKeepLocal) {
        keepLocalDraft(draft!, cloud)
        await flushToCloud()
        return
    }
    hydrateFromCloud(cloud)
  }

  // 用 state 持有 pathname 并监听 popstate，使浏览器前进/后退键能正确切换页面。
  // （此前直接读 window.location.pathname 且无监听，回退时 URL 变了但 React 不重渲染，
  //  表现为「浏览器回退键失效」。）
  const [pathname, setPathname] = useState(window.location.pathname)
  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const isSharePage = pathname.startsWith('/share/')
  const isApplicationsPage = pathname.startsWith('/applications')
  const isJobsPage = pathname.startsWith('/jobs')
  const isEditorPage = pathname === '/editor'

  // 检查是否需要显示登录页
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('login') === '1') {
      setShowLogin(true)
      // 清理 URL 参数
      const returnParam = params.get('return')
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.delete('login')
      if (returnParam) newUrl.searchParams.set('return', returnParam)
      else newUrl.searchParams.delete('return')
      window.history.replaceState({}, '', newUrl.pathname + newUrl.search)
    }
  }, [])

  // 启动时检查认证状态
  useEffect(() => {
    const init = async () => {
      await checkAuth()
      setAuthChecked(true)
    }
    init()
  }, [checkAuth])

  // 单设备登录：已登录设备定期探测会话有效性。被其他设备顶号后，下一次 /auth/me 返回 401
  // SESSION_KICKED，由 client.ts 拦截器统一处理（清 token + 跳登录页）。
  // 个人工具被顶是低频事件，间隔放宽到 3 分钟；tab 切到后台暂停轮询，可见时立即补一次再恢复。
  useEffect(() => {
    if (!authChecked || !isAuthenticated) return
    let cancelled = false
    const HEARTBEAT_MS = 180_000
    const tick = async () => {
      if (cancelled || document.hidden) return
      try {
        await authApi.me()
      } catch {
        // 被踢时拦截器已处理跳转；其它错误忽略，等待下次探测
      }
    }
    const timer = window.setInterval(tick, HEARTBEAT_MS)
    const onVisible = () => {
      if (!document.hidden) void tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [authChecked, isAuthenticated])

  // 已登录时加载云端简历列表
  useEffect(() => {
    if (!authChecked) return
    if (!isAuthenticated) return

    const loadCloudResumes = async () => {
      try {
        const result = await resumeApi.list({ page: 1, pageSize: 50 })
        setCloudResumes(result.items || [])

        // 检查是否需要跳过自动加载（新建简历后）
        const skipAutoLoad = sessionStorage.getItem('skip_auto_load')
        if (skipAutoLoad) {
          sessionStorage.removeItem('skip_auto_load')
          // 新建/解析简历后：从 localStorage 加载已保存的简历数据
          loadFromStorage()
          return
        }

        // 如果当前没有选中简历，且云端有简历，加载第一份
        const currentId = localStorage.getItem('resumecraft_current_resume_id')
        if (!currentId && result.items && result.items.length > 0) {
          // 自动加载第一份简历（带本地草稿冲突检测）
          const firstResume = await resumeApi.get(result.items[0].id)
          if (firstResume) {
            await loadCloudWithConflictCheck(firstResume)
          }
        } else if (currentId && isValidUUID(currentId)) {
          // 当前有选中的云端简历，加载它（带本地草稿冲突检测）
          try {
            const currentResume = await resumeApi.get(currentId)
            if (currentResume) {
              await loadCloudWithConflictCheck(currentResume)
            }
          } catch (err) {
            console.error('[App] 加载当前云端简历失败，回退到本地:', err)
            loadFromStorage()
            // 如果本地加载的简历 ID 是有效 UUID，通知 useCloudSync
            const localId = useResumeStore.getState().resume.id
            if (localId && isValidUUID(localId)) {
              ;(window as any).__cloudSyncSetCloudId?.(localId)
            }
          }
        } else if (currentId) {
          // 本地简历 ID（非 UUID 格式），从 localStorage 加载
          loadFromStorage()
        }
      } catch (err) {
        console.error('[App] 加载云端简历失败:', err)
      }
    }

    loadCloudResumes()
  }, [authChecked, isAuthenticated, initResume])

  // 等待认证状态确定
  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-500">加载中...</div>
      </div>
    )
  }

  // 分享页（公开，无需登录）
  if (isSharePage) return <ShareViewPage />

  // 未登录 / 强制登录页 / 挤号待确认：均渲染登录页（确认框作为登录环节的二次确认，盖在登录页上）
  if (!isAuthenticated || showLogin || kickPending) {
    return (
      <>
        <LoginPage />
        <KickConfirmModal />
      </>
    )
  }

  if (isApplicationsPage) return <><ApplicationsPage /><KickConfirmModal /></>

  if (isJobsPage) return <><JobPostingsPage /><KickConfirmModal /></>

  if (isEditorPage) return <><AppShell /><KickConfirmModal /></>

  // 简历列表页
  return (
    <>
      <ResumeListPage
        cloudResumes={cloudResumes}
        isAuthenticated={isAuthenticated}
        onLogout={async () => {
          await logout()
          setCloudResumes([])
          localStorage.removeItem('resumecraft_current_resume_id')
          window.location.reload()
        }}
        onCloudResumeDeleted={(id) => {
          setCloudResumes((prev) => prev.filter((r) => r.id !== id))
        }}
        onCloudResumeUpdated={(id, title, updatedAt) => {
          setCloudResumes((prev) =>
            prev.map((r) => (r.id === id ? { ...r, title, updatedAt } : r))
          )
        }}
        onCloudResumeCreated={(id, title, updatedAt) => {
          setCloudResumes((prev) => [
            { id, title, template: 'classic', updatedAt, createdAt: updatedAt },
            ...prev,
          ])
        }}
      />
      <KickConfirmModal />
    </>
  )
}

export default App
