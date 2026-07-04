// ============================================================
// App — 根组件
// ============================================================

import React, { useEffect, useState } from 'react'
import { useResumeStore, peekLocalDraft, serializeResumeContent, flushToCloud } from '@/store/resumeStore'
import { useAuthStore } from '@/store/authStore'
import AppShell from '@/components/layout/AppShell'
import ShareViewPage from '@/pages/ShareViewPage'
import ApplicationsPage from '@/pages/ApplicationsPage'
import ResumeListPage from '@/components/layout/ResumeListPage'
import LoginPage from '@/components/layout/LoginPage'
import { resumeApi } from '@/api'
import { requestConflictResolve } from '@/components/common/ConflictDialog'
import type { ResumeLocale, TemplateType, Module, ResumeStyleSettings, Resume } from '@/types/resume'

function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

/** 从云端响应恢复快照专属草稿到 localStorage + 恢复 basedOnSnapshotId */
function restoreCloudSnapshotData(cloudResume: any) {
  // 恢复快照草稿到 localStorage（确保重入后可被 handleSelectSnapshot 读取）
  if (cloudResume?.snapshotDrafts && typeof cloudResume.snapshotDrafts === 'object') {
    for (const [snapshotId, draft] of Object.entries(cloudResume.snapshotDrafts)) {
      try {
        localStorage.setItem(`resumecraft_snapshot_draft_${snapshotId}`, JSON.stringify(draft))
      } catch { /* ignore */ }
    }
  }
  // 恢复 basedOnSnapshotId，使 handleSnapshotsLoaded 能选中正确的快照
  // 优先级：云端 > localStorage fallback（迁移未执行时 based_on_snapshot_id 列为 null）
  const cloudId = cloudResume?.basedOnSnapshotId
  if (cloudId) {
    useResumeStore.getState().setBasedOnSnapshotId(cloudId)
  } else {
    // fallback：从 localStorage 恢复上次编辑的快照 ID
    try {
      const localId = localStorage.getItem('resumecraft_active_snapshot_id')
      if (localId) {
        useResumeStore.getState().setBasedOnSnapshotId(localId)
      }
    } catch { /* ignore */ }
  }
}

const App: React.FC = () => {
  const { initResume, loadFromStorage, setResumeVersion, setDraftsVersion, setPersonalData } = useResumeStore()
  const { isAuthenticated, checkAuth, logout } = useAuthStore()
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
    setPersonalData(localAvatar ? { ...cloudPersonalData, avatar: localAvatar } : cloudPersonalData)
    ;(window as any).__cloudSyncSetCloudId?.(cloud.id)
    // initResume 已把云端数据写入 store + localStorage（覆盖本地缓存）；
    // 再对齐 useCloudSync 同步指纹，认账「已是云端版」，避免随后又判 dirty 触发多余回写。
    ;(window as any).__cloudSyncMarkSyncedWith?.()
  }

  // 保留本地未提交的草稿（不被云端覆盖），并对齐云端版本号以便后续落库时覆盖云端。
  const keepLocalDraft = (draft: Resume, cloud: any) => {
    restoreCloudSnapshotData(cloud)
    initResume({
      id: draft.id,
      title: draft.title,
      locale: draft.locale,
      template: draft.template,
      themeColor: draft.themeColor,
      styleSettings: draft.styleSettings,
      modules: draft.modules,
      updatedAt: Date.now(),
    })
    // 对齐云端版本号：本地草稿提交时用云端 version 才能通过乐观锁覆盖
    setResumeVersion((cloud as any).version ?? 0)
    setDraftsVersion((cloud as any).snapshotDraftsVersion ?? 0)
    ;(window as any).__cloudSyncSetCloudId?.(cloud.id)
  }

  // 加载云端简历前，先检测本地是否有「同一份简历、更新且内容不同」的未提交草稿。
  // 有冲突 → 弹窗仲裁；否则直接用云端，避免无脑覆盖本地未落库的改动。
  const loadCloudWithConflictCheck = async (cloud: any) => {
    const draft = peekLocalDraft()
    const isConflict =
      draft &&
      draft.data.id === cloud.id &&
      draft.savedAt > (cloud.updatedAt ?? 0) &&
      serializeResumeContent(draft.data) !== serializeResumeContent(cloud as Resume)

    if (isConflict) {
      // 字段级差异：本端 modules 作 currentModules(before)，云端作 comparisonModules(after)
      const loadDiff = async () => {
        const result = await resumeApi.diffSnapshots(
          cloud.id, '', '',
          draft!.data.modules as unknown[],
          (cloud.modules ?? []) as unknown[],
        )
        return result.diffs
      }
      const choice = await requestConflictResolve(loadDiff)
      if (choice === 'keepLocal') {
        keepLocalDraft(draft!.data, cloud)
        // 确认保留本地后立即落库，把本地版固化到云端（已对齐云端 version，可通过乐观锁）
        void flushToCloud()
        return
      }
      // 'useCloud' 或 取消（稍后处理）→ 用云端覆盖（云端已是最新，无需落库）
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

  // 未登录时强制显示登录页
  if (!isAuthenticated || showLogin) {
    return <LoginPage />
  }

  if (isApplicationsPage) return <ApplicationsPage />

  if (isEditorPage) return <AppShell />

  // 简历列表页
  return (
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
  )
}

export default App
