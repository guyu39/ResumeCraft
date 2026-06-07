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

/** 收集 localStorage 中所有快照专属草稿 → Map<snapshotId, DraftContent> */
function collectSnapshotDrafts(): Record<string, unknown> {
  const drafts: Record<string, unknown> = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('resumecraft_snapshot_draft_')) {
        const snapshotId = key.slice('resumecraft_snapshot_draft_'.length)
        const raw = localStorage.getItem(key)
        if (raw) {
          try {
            drafts[snapshotId] = JSON.parse(raw)
          } catch { /* 忽略损坏的草稿 */ }
        }
      }
    }
  } catch { /* ignore */ }
  return drafts
}

export function useCloudSync() {
  const resume = useResumeStore((s) => s.resume)
  const basedOnSnapshotId = useResumeStore((s) => s.basedOnSnapshotId)
  const setBasedOnSnapshotId = useResumeStore((s) => s.setBasedOnSnapshotId)
  const lastSavedAt = useResumeStore((s) => s.lastSavedAt)
  const markSaved = useResumeStore((s) => s.markSaved)
  const resumeVersion = useResumeStore((s) => s.resumeVersion)
  const draftsVersion = useResumeStore((s) => s.draftsVersion)
  const setResumeVersion = useResumeStore((s) => s.setResumeVersion)
  const setDraftsVersion = useResumeStore((s) => s.setDraftsVersion)
  const setSyncStatus = useResumeStore((s) => s.setSyncStatus)
  const { isAuthenticated } = useAuthStore()

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)

  const isSyncingRef = useRef(false)
  const lastSyncedDataRef = useRef<string>('')
  const cloudIdRef = useRef<string | null>(null)
  const hasSyncedOnMountRef = useRef(false)
  const localVersionRef = useRef(resumeVersion)
  const localDraftsVersionRef = useRef(draftsVersion)

  // 同步 ref 与 store 值
  localVersionRef.current = resumeVersion
  localDraftsVersionRef.current = draftsVersion

  // ========== 核心：落库 ==========
  const saveToCloud = useCallback(async (useBeacon = false): Promise<boolean> => {
    if (!isAuthenticated || isSyncingRef.current) return false

    // 直接从 Store 读取最新状态，避免 closure 中 stale resume
    // （flushToCloud 在 updateModuleData 之后立即调用，此时 React 尚未 re-render，
    //  closure 中的 resume 仍是旧值，导致头像 URL 未写入云端）
    const latestResume = useResumeStore.getState().resume
    const currentData = serializeResume(latestResume)

    // 内容去重：与上次落库相同则跳过（比 isDirty 更可靠，不依赖额外状态维护）
    if (currentData === lastSyncedDataRef.current) {
      console.log('[CloudSync] 数据无变化，跳过')
      setSaveStatus('synced')
      return true
    }

    const targetId = cloudIdRef.current || latestResume.id
    if (!isValidUUID(targetId)) {
      console.warn('[CloudSync] 非云端简历，跳过')
      return false
    }

    // beforeunload 场景：fetch + keepalive + auth header
    if (useBeacon) {
      const snapshotDrafts = collectSnapshotDrafts()
      const body = JSON.stringify({
        title: latestResume.title, themeColor: latestResume.themeColor,
        styleSettings: latestResume.styleSettings, modules: latestResume.modules,
        clientUpdatedAt: Date.now(),
        basedOnSnapshotId: basedOnSnapshotId || undefined,
        snapshotDrafts: Object.keys(snapshotDrafts).length > 0 ? snapshotDrafts : undefined,
        personalData: useResumeStore.getState().personalData || undefined,
        version: localVersionRef.current,
        snapshotDraftsVersion: localDraftsVersionRef.current,
      })
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const token = localStorage.getItem('accessToken')
      if (token) headers['Authorization'] = `Bearer ${token}`
      fetch(`/api/resumes/${targetId}`, { method: 'PUT', headers, body, keepalive: true }).catch(() => { })
      lastSyncedDataRef.current = currentData
      return true
    }

    isSyncingRef.current = true
    setSaveStatus('saving')
    setSyncStatus('cloud_syncing')

    try {
      const snapshotDrafts = collectSnapshotDrafts()
      const resp = await resumeApi.update(targetId, {
        title: latestResume.title, themeColor: latestResume.themeColor,
        styleSettings: latestResume.styleSettings, modules: latestResume.modules,
        clientUpdatedAt: Date.now(),
        basedOnSnapshotId: basedOnSnapshotId || undefined,
        snapshotDrafts: Object.keys(snapshotDrafts).length > 0 ? snapshotDrafts : undefined,
        personalData: useResumeStore.getState().personalData || undefined,
        version: localVersionRef.current,
        snapshotDraftsVersion: localDraftsVersionRef.current,
      })
      lastSyncedDataRef.current = currentData
      // 更新本地版本号
      setResumeVersion(resp.version)
      setDraftsVersion(resp.snapshotDraftsVersion)
      localVersionRef.current = resp.version
      localDraftsVersionRef.current = resp.snapshotDraftsVersion
      setLastSyncedAt(Date.now())
      setSaveStatus('synced')
      setSyncStatus('cloud_synced')
      markSaved()
      if (resp?.latestSnapshotId) {
        setBasedOnSnapshotId(resp.latestSnapshotId)
      }
      return true
    } catch (err: any) {
      console.error('[CloudSync] 保存失败:', err)
      // 409 Conflict 特殊处理
      if (err?.status === 409 || err?.code === 'VERSION_CONFLICT') {
        setSaveStatus('error')
        setSyncStatus('conflict')
      } else {
        setSaveStatus('error')
        setSyncStatus('error')
      }
      return false
    } finally {
      isSyncingRef.current = false
    }
  }, [isAuthenticated, basedOnSnapshotId, markSaved, setBasedOnSnapshotId, setSyncStatus, setResumeVersion, setDraftsVersion])

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
      if (document.hidden) {
        console.log('[CloudSync] 切后台，触发保存')
        saveToCloud()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [isAuthenticated, saveToCloud])

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
