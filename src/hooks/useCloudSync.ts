// ============================================================
// 云端同步 Hook — 事件驱动落库 + 脏标记去重
// 策略：
// 1. 编辑过程中实时保存到浏览器 (localStorage) + 标记 isDirty
// 2. 退出/刷新/切后台/切快照 → 触发落库 (仅 isDirty 时)
// 3. sendBeacon 兜底保证送达
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { useResumeStore, flushDraft, registerFlushToCloud } from '@/store/resumeStore'
import { useAuthStore } from '@/store/authStore'
import { resumeApi } from '@/api'
import type { Resume } from '@/types/resume'

export type SaveStatus = 'idle' | 'saving' | 'synced' | 'error' | 'loading'

function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

function serializeResume(r: Resume): string {
  return JSON.stringify({ title: r.title, themeColor: r.themeColor, styleSettings: r.styleSettings, modules: r.modules })
}

export function useCloudSync() {
  const resume = useResumeStore((s) => s.resume)
  const isDirty = useResumeStore((s) => s.isDirty)
  const basedOnSnapshotId = useResumeStore((s) => s.basedOnSnapshotId)
  const setBasedOnSnapshotId = useResumeStore((s) => s.setBasedOnSnapshotId)
  const lastSavedAt = useResumeStore((s) => s.lastSavedAt)
  const markSaved = useResumeStore((s) => s.markSaved)
  const markClean = useResumeStore((s) => s.markClean)
  const { isAuthenticated } = useAuthStore()

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)

  const isSyncingRef = useRef(false)
  const lastSyncedDataRef = useRef<string>('')
  const cloudIdRef = useRef<string | null>(null)
  const hasSyncedOnMountRef = useRef(false)

  // ========== 核心：落库 ==========
  const saveToCloud = useCallback(async (useBeacon = false): Promise<boolean> => {
    if (!isAuthenticated || isSyncingRef.current) return false

    const currentData = serializeResume(resume)

    // 脏标记去重：无修改则跳过
    if (!isDirty) {
      console.log('[CloudSync] isDirty=false，跳过')
      return true
    }

    // 内容去重：与上次落库相同则跳过
    if (currentData === lastSyncedDataRef.current) {
      console.log('[CloudSync] 数据无变化，跳过')
      markClean()
      setSaveStatus('synced')
      return true
    }

    const targetId = cloudIdRef.current || resume.id
    if (!isValidUUID(targetId)) {
      console.warn('[CloudSync] 非云端简历，跳过')
      return false
    }

    // beforeunload 场景：fetch + keepalive + auth header
    if (useBeacon) {
      const body = JSON.stringify({
        title: resume.title, themeColor: resume.themeColor,
        styleSettings: resume.styleSettings, modules: resume.modules,
        clientUpdatedAt: Date.now(),
        basedOnSnapshotId: basedOnSnapshotId || undefined,
      })
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const token = localStorage.getItem('accessToken')
      if (token) headers['Authorization'] = `Bearer ${token}`
      fetch(`/api/resumes/${targetId}`, { method: 'PUT', headers, body, keepalive: true }).catch(() => { })
      markClean()
      return true
    }

    isSyncingRef.current = true
    setSaveStatus('saving')

    try {
      const resp = await resumeApi.update(targetId, {
        title: resume.title, themeColor: resume.themeColor,
        styleSettings: resume.styleSettings, modules: resume.modules,
        clientUpdatedAt: Date.now(),
        basedOnSnapshotId: basedOnSnapshotId || undefined,
      })
      lastSyncedDataRef.current = currentData
      setLastSyncedAt(Date.now())
      setSaveStatus('synced')
      markSaved()
      markClean()
      // 同步后端返回的最新快照 ID
      if (resp?.latestSnapshotId) {
        setBasedOnSnapshotId(resp.latestSnapshotId)
      }
      return true
    } catch (err) {
      console.error('[CloudSync] 保存失败:', err)
      setSaveStatus('error')
      return false
    } finally {
      isSyncingRef.current = false
    }
  }, [resume, isAuthenticated, isDirty, basedOnSnapshotId, markSaved, markClean, setBasedOnSnapshotId])

  // ========== 事件驱动：退出/刷新 ==========
  useEffect(() => {
    if (!isAuthenticated) return

    const handleBeforeUnload = () => {
      // 1. 立即刷入 localStorage（防止 debounce 未完成）
      flushDraft()
      // 2. 用 sendBeacon 落库
      saveToCloud(true)
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isAuthenticated, saveToCloud])

  // ========== 事件驱动：切后台（移动端更可靠） ==========
  useEffect(() => {
    if (!isAuthenticated) return

    const handleVisibility = () => {
      if (document.hidden && isDirty) {
        console.log('[CloudSync] 切后台，触发保存')
        saveToCloud()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [isAuthenticated, isDirty, saveToCloud])

  // ========== 监听内容变化，重置状态 ==========
  useEffect(() => {
    if (!isAuthenticated) return
    const currentData = serializeResume(resume)
    if (currentData !== lastSyncedDataRef.current) {
      setSaveStatus('idle')
    }
  }, [resume, isAuthenticated])

  // ========== 进入页面时同步检查 ==========
  useEffect(() => {
    if (!isAuthenticated) return
    if (!cloudIdRef.current && !isValidUUID(resume.id)) return

    const syncOnMount = async () => {
      if (hasSyncedOnMountRef.current) return
      hasSyncedOnMountRef.current = true
      const targetId = cloudIdRef.current || resume.id
      if (!isValidUUID(targetId)) return

      setSaveStatus('loading')
      try {
        const cloudResume = await resumeApi.get(targetId)
        // 使用 latestSnapshotId（最新的 manual/default 快照），而非 latestVersionId
        if ((cloudResume as any).latestSnapshotId) {
          setBasedOnSnapshotId((cloudResume as any).latestSnapshotId)
        }
        if (lastSavedAt && cloudResume.updatedAt && lastSavedAt > cloudResume.updatedAt) {
          await saveToCloud()
        } else if (!lastSavedAt || lastSavedAt < cloudResume.updatedAt) {
          lastSyncedDataRef.current = serializeResume(cloudResume as Resume)
          setSaveStatus('synced')
        }
      } catch (err) {
        console.error('[CloudSync] 同步检查失败:', err)
        setSaveStatus('error')
      }
    }

    const timer = setTimeout(syncOnMount, 500)
    return () => clearTimeout(timer)
  }, [isAuthenticated])

  // ========== 加载云端简历 ==========
  const loadFromCloud = useCallback(async (resumeId: string) => {
    if (!isAuthenticated) return null
    try {
      const cloudResume = await resumeApi.get(resumeId)
      lastSyncedDataRef.current = serializeResume(cloudResume as Resume)
      cloudIdRef.current = resumeId
      hasSyncedOnMountRef.current = true
      setSaveStatus('synced')
      // 使用 latestSnapshotId（最新的 manual/default 快照），而非 latestVersionId（auto 版本）
      if ((cloudResume as any).latestSnapshotId) {
        setBasedOnSnapshotId((cloudResume as any).latestSnapshotId)
      }
      return cloudResume
    } catch (err) { console.error('[CloudSync] 加载失败:', err); return null }
  }, [isAuthenticated, setBasedOnSnapshotId])

  const manualSave = useCallback(() => saveToCloud(), [saveToCloud])

  const setCloudId = useCallback((id: string) => {
    cloudIdRef.current = id
    hasSyncedOnMountRef.current = true
  }, [])

  useEffect(() => {
    (window as any).__cloudSyncSetCloudId = setCloudId
      ; (window as any).__cloudSyncMarkSynced = () => { hasSyncedOnMountRef.current = true }
    // 注册全局落库回调
    registerFlushToCloud(() => saveToCloud())
    return () => {
      delete (window as any).__cloudSyncSetCloudId
      delete (window as any).__cloudSyncMarkSynced
      registerFlushToCloud(async () => false)
    }
  }, [setCloudId, saveToCloud])

  return { saveToCloud, loadFromCloud, manualSave, setCloudId, saveStatus, lastSyncedAt }
}
