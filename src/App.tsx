// ============================================================
// App — 根组件
// ============================================================

import React, { useEffect, useState } from 'react'
import { useResumeStore } from '@/store/resumeStore'
import { useAuthStore } from '@/store/authStore'
import AppShell from '@/components/layout/AppShell'
import PreviewPage from '@/components/layout/PreviewPage'
import ResumeListPage from '@/components/layout/ResumeListPage'
import LoginPage from '@/components/layout/LoginPage'
import { resumeApi } from '@/api'
import type { ResumeLocale, TemplateType, Module } from '@/types/resume'

function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

const App: React.FC = () => {
  const { loadFromStorage, initResume } = useResumeStore()
  const { isAuthenticated, checkAuth, logout } = useAuthStore()
  const [authChecked, setAuthChecked] = useState(false)
  const [cloudResumes, setCloudResumes] = useState<any[]>([])
  const [showLogin, setShowLogin] = useState(false)
  const [hasCloudLoaded, setHasCloudLoaded] = useState(false)

  const pathname = window.location.pathname
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
          console.log('[App] 跳过自动加载，等待本地简历')
          setHasCloudLoaded(true)
          return
        }

        // 如果当前没有选中简历，且云端有简历，加载第一份
        const currentId = localStorage.getItem('resumecraft_current_resume_id')
        if (!currentId && result.items && result.items.length > 0) {
          // 自动加载第一份简历
          const firstResume = await resumeApi.get(result.items[0].id)
          if (firstResume) {
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
            // 通知 useCloudSync 关于云端 ID
            ;(window as any).__cloudSyncSetCloudId?.(firstResume.id)
          }
        } else if (currentId && isValidUUID(currentId)) {
          // 当前有选中的云端简历，加载它
          try {
            const currentResume = await resumeApi.get(currentId)
            if (currentResume) {
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
              // 通知 useCloudSync 关于云端 ID
              ;(window as any).__cloudSyncSetCloudId?.(currentResume.id)
            }
          } catch (err) {
            console.error('[App] 加载当前云端简历失败:', err)
          }
        }
      } catch (err) {
        console.error('[App] 加载云端简历失败:', err)
      }
      setHasCloudLoaded(true)
    }

    loadCloudResumes()
  }, [authChecked, isAuthenticated, initResume])

  // 编辑页和预览页需要恢复简历
  useEffect(() => {
    if (!authChecked) return
    if (isEditorPage || isPreviewPage) {
      if (!isAuthenticated) {
        // 未登录时从 localStorage 加载
        loadFromStorage()
      }
      // 已登录时，云端简历已在上面加载
    }
  }, [authChecked, isAuthenticated, isEditorPage, isPreviewPage, loadFromStorage])

  // 等待认证状态确定
  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-500">加载中...</div>
      </div>
    )
  }

  // 显示登录页
  if (showLogin) {
    return <LoginPage />
  }

  if (isPreviewPage) return <PreviewPage />
  if (isEditorPage) return <AppShell />

  // 简历列表页
  return (
    <ResumeListPage
      cloudResumes={cloudResumes}
      isAuthenticated={isAuthenticated}
      hasCloudLoaded={hasCloudLoaded}
      onLogin={() => setShowLogin(true)}
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