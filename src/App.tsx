// ============================================================
// App — 根组件
// ============================================================

import React, { useEffect, useState } from 'react'
import { useResumeStore } from '@/store/resumeStore'
import { useAuthStore } from '@/store/authStore'
import AppShell from '@/components/layout/AppShell'
import PreviewPage from '@/components/layout/PreviewPage'
import ShareViewPage from '@/pages/ShareViewPage'
import ResumeListPage from '@/components/layout/ResumeListPage'
import LoginPage from '@/components/layout/LoginPage'
import { resumeApi } from '@/api'
import type { ResumeLocale, TemplateType, Module } from '@/types/resume'

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

  const pathname = window.location.pathname
  const isSharePage = pathname.startsWith('/share/')
  const isPreviewPage = pathname === '/preview'
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
          // 自动加载第一份简历
          const firstResume = await resumeApi.get(result.items[0].id)
          if (firstResume) {
            // 先恢复快照草稿和 basedOnSnapshotId（必须在 initResume 之前，
            // 否则 initResume → saveToStorage 会用 null 覆盖 basedOnSnapshotId）
            restoreCloudSnapshotData(firstResume)
            initResume({
              id: firstResume.id,
              title: firstResume.title,
              locale: firstResume.locale as ResumeLocale,
              template: firstResume.template as TemplateType,
              themeColor: firstResume.themeColor,
              styleSettings: firstResume.styleSettings,
              modules: firstResume.modules as Module[],
              updatedAt: firstResume.updatedAt,
            })
              // 同步乐观锁版本号
              setResumeVersion((firstResume as any).version ?? 0)
              setDraftsVersion((firstResume as any).snapshotDraftsVersion ?? 0)
              setPersonalData((firstResume as any).personalData ?? {})
              // 通知 useCloudSync 关于云端 ID
              ; (window as any).__cloudSyncSetCloudId?.(firstResume.id)
          }
        } else if (currentId && isValidUUID(currentId)) {
          // 当前有选中的云端简历，加载它
          try {
            const currentResume = await resumeApi.get(currentId)
            if (currentResume) {
              // 先恢复快照草稿和 basedOnSnapshotId（必须在 initResume 之前）
              restoreCloudSnapshotData(currentResume)
              initResume({
                id: currentResume.id,
                title: currentResume.title,
                locale: currentResume.locale as ResumeLocale,
                template: currentResume.template as TemplateType,
                themeColor: currentResume.themeColor,
                styleSettings: currentResume.styleSettings,
                modules: currentResume.modules as Module[],
                updatedAt: currentResume.updatedAt,
              })
                // 同步乐观锁版本号
                setResumeVersion((currentResume as any).version ?? 0)
                setDraftsVersion((currentResume as any).snapshotDraftsVersion ?? 0)
                setPersonalData((currentResume as any).personalData ?? {})
                // 通知 useCloudSync 关于云端 ID
                ; (window as any).__cloudSyncSetCloudId?.(currentResume.id)
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

  // 编辑页和预览页需要恢复简历
  useEffect(() => {
    if (!authChecked || !isAuthenticated) return
    if (isEditorPage || isPreviewPage) {
      // 已登录时，云端简历已在上面加载
    }
  }, [authChecked, isAuthenticated, isEditorPage, isPreviewPage])

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

  if (isPreviewPage) return <PreviewPage />
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