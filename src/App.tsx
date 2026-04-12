// ============================================================
// App — 根组件
// ============================================================

import React, { useEffect } from 'react'
import { useResumeStore } from '@/store/resumeStore'
import AppShell from '@/components/layout/AppShell'
import PreviewPage from '@/components/layout/PreviewPage'
import ResumeListPage from '@/components/layout/ResumeListPage'

const App: React.FC = () => {
  const { loadFromStorage } = useResumeStore()
  const pathname = window.location.pathname
  const 是否预览页 = pathname === '/preview'
  const 是否编辑页 = pathname === '/editor'

  useEffect(() => {
    // 编辑页和预览页需要恢复当前简历
    if (是否编辑页 || 是否预览页) {
      loadFromStorage()
    }
  }, [loadFromStorage, 是否编辑页, 是否预览页])

  if (是否预览页) return <PreviewPage />
  if (是否编辑页) return <AppShell />
  return <ResumeListPage />
}

export default App
