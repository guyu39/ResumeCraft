// ============================================================
// 云端同步 Hook — 本地优先 + revision 驱动的串行保存队列
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  useResumeStore,
  flushDraft,
  registerFlushToCloud,
} from '@/store/resumeStore'
import { useAuthStore } from '@/store/authStore'
import { resumeApi } from '@/api'
import type { Resume } from '@/types/resume'
import type { ResumeDetail, UpdateResumeRequest } from '@/api/types'

export type SaveStatus = 'idle' | 'saving' | 'synced' | 'error' | 'loading' | 'offline'

function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

interface PersistedResumePayload {
  title: string
  locale: string
  template: string
  themeColor: string
  styleSettings: Resume['styleSettings']
  modules: Resume['modules']
  personalData: Record<string, unknown>
  basedOnSnapshotId?: string
}

interface SaveWaiter {
  revision: number
  resolve: (saved: boolean) => void
}

function normalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForHash)
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = normalizeForHash((value as Record<string, unknown>)[key])
        return result
      }, {})
  }
  return value
}

function serializePayload(payload: PersistedResumePayload): string {
  return JSON.stringify(normalizeForHash(payload))
}

function buildPayload(): PersistedResumePayload {
  const state = useResumeStore.getState()
  const resume = state.resume
  return {
    title: resume.title,
    locale: resume.locale,
    template: resume.template,
    themeColor: resume.themeColor,
    styleSettings: resume.styleSettings,
    modules: resume.modules,
    personalData: state.personalData,
    basedOnSnapshotId: state.basedOnSnapshotId || undefined,
  }
}

function toUpdateRequest(payload: PersistedResumePayload, version: number, draftsVersion: number): UpdateResumeRequest {
  return {
    ...payload,
    clientUpdatedAt: Date.now(),
    version,
    snapshotDraftsVersion: draftsVersion,
  }
}

function cloudPayload(cloud: ResumeDetail): PersistedResumePayload {
  return {
    title: cloud.title,
    locale: cloud.locale,
    template: cloud.template,
    themeColor: cloud.themeColor,
    styleSettings: cloud.styleSettings as Resume['styleSettings'],
    modules: cloud.modules as Resume['modules'],
    personalData: cloud.personalData || {},
    basedOnSnapshotId: cloud.basedOnSnapshotId || undefined,
  }
}

export function useCloudSync() {
  const resume = useResumeStore((s) => s.resume)
  const localRevision = useResumeStore((s) => s.localRevision)
  const ackedRevision = useResumeStore((s) => s.ackedRevision)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const setBasedOnSnapshotIdFromStorage = useResumeStore((s) => s.setBasedOnSnapshotIdFromStorage)
  const setResumeVersion = useResumeStore((s) => s.setResumeVersion)
  const setDraftsVersion = useResumeStore((s) => s.setDraftsVersion)
  const setAckedRevision = useResumeStore((s) => s.setAckedRevision)
  const setSyncRevisions = useResumeStore((s) => s.setSyncRevisions)
  const setSyncStatus = useResumeStore((s) => s.setSyncStatus)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)

  const cloudIdRef = useRef<string | null>(null)
  const serverVersionRef = useRef(useResumeStore.getState().resumeVersion)
  const draftsVersionRef = useRef(useResumeStore.getState().draftsVersion)
  const lastSyncedHashRef = useRef('')
  const isSavingRef = useRef(false)
  const pendingRef = useRef(false)
  const waitersRef = useRef<SaveWaiter[]>([])
  const retryTimerRef = useRef<number | null>(null)
  const saveToCloudRef = useRef<((useBeacon?: boolean) => Promise<boolean>) | null>(null)
  const retryImmediatelyRef = useRef(false)
  const retryCountRef = useRef(0)
  const conflictRetryCountRef = useRef(0)
  const hasSyncedOnMountRef = useRef(false)

  const updateVersions = useCallback((version: number, draftsVersion: number) => {
    serverVersionRef.current = version
    draftsVersionRef.current = draftsVersion
    setResumeVersion(version)
    setDraftsVersion(draftsVersion)
  }, [setDraftsVersion, setResumeVersion])

  const resolveWaiters = useCallback((savedRevision: number, saved: boolean) => {
    const remaining: SaveWaiter[] = []
    for (const waiter of waitersRef.current) {
      if (saved && waiter.revision <= savedRevision) waiter.resolve(true)
      else if (!saved) waiter.resolve(false)
      else remaining.push(waiter)
    }
    waitersRef.current = remaining
  }, [])

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current !== null || !navigator.onLine) return
    const delays = [1000, 3000, 10000]
    if (retryCountRef.current >= delays.length) return
    const delay = delays[retryCountRef.current]
    retryCountRef.current += 1
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null
      void saveToCloudRef.current?.()
    }, delay)
  }, [])

  const saveToCloud = useCallback(async (useBeacon = false): Promise<boolean> => {
    if (!isAuthenticated) return false

    const state = useResumeStore.getState()
    const targetId = cloudIdRef.current || state.resume.id
    if (!isValidUUID(targetId)) return false

    const payload = buildPayload()
    const payloadHash = serializePayload(payload)
    const targetRevision = state.localRevision
    const startedAt = Date.now()
    const payloadBytes = new Blob([payloadHash]).size

    if (payloadHash === lastSyncedHashRef.current && targetRevision <= state.ackedRevision) {
      setSaveStatus('synced')
      return true
    }

    if (useBeacon) {
      const body = JSON.stringify(toUpdateRequest(payload, serverVersionRef.current, draftsVersionRef.current))
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const token = localStorage.getItem('accessToken')
      if (token) headers.Authorization = `Bearer ${token}`
      fetch(`/api/resumes/${targetId}`, {
        method: 'PUT',
        headers,
        body,
        keepalive: true,
      }).catch((error) => console.warn('[CloudSync] keepalive 保存未确认:', error))
      return false
    }

    if (isSavingRef.current) {
      pendingRef.current = true
      return new Promise<boolean>((resolve) => {
        waitersRef.current.push({ revision: targetRevision, resolve })
      })
    }

    isSavingRef.current = true
    setSaveStatus('saving')
    setSyncStatus('cloud_syncing')

    let saved = false
    try {
      const response = await resumeApi.update(targetId, toUpdateRequest(payload, serverVersionRef.current, draftsVersionRef.current))
      updateVersions(response.version, response.snapshotDraftsVersion)
      lastSyncedHashRef.current = payloadHash
      setAckedRevision(targetRevision)
      flushDraft()
      setLastSyncedAt(Date.now())
      retryCountRef.current = 0
      conflictRetryCountRef.current = 0
      setSaveStatus('synced')
      setSyncStatus('cloud_synced')
      saved = true
      console.info('[CloudSync]', {
        event: 'save_success',
        revision: targetRevision,
        durationMs: Date.now() - startedAt,
        payloadBytes,
      })
      resolveWaiters(targetRevision, true)
    } catch (error: any) {
      console.error('[CloudSync] 保存失败:', error)
      if (error?.status === 409 || error?.code === 'VERSION_CONFLICT') {
        try {
          const cloud = await resumeApi.get(targetId)
          updateVersions(cloud.version ?? 0, cloud.snapshotDraftsVersion ?? 0)
          const current = useResumeStore.getState()
          const cloudHash = serializePayload(cloudPayload(cloud))
          if (cloudHash === serializePayload(buildPayload())) {
            lastSyncedHashRef.current = cloudHash
            setAckedRevision(current.localRevision)
            setSaveStatus('synced')
            setSyncStatus('cloud_synced')
            saved = true
            resolveWaiters(current.localRevision, true)
          } else if (current.localRevision > current.ackedRevision) {
            if (conflictRetryCountRef.current < 2) {
              conflictRetryCountRef.current += 1
              pendingRef.current = true
              retryImmediatelyRef.current = true
              setSaveStatus('saving')
            } else {
              setSaveStatus('error')
              setSyncStatus('error')
              resolveWaiters(current.localRevision, false)
            }
          } else {
            const store = useResumeStore.getState()
            // 先切换分支关联，确保 initResume 写入的本地草稿与云端 current 属于同一分支。
            setBasedOnSnapshotIdFromStorage(cloud.basedOnSnapshotId || null)
            store.initResume({
              id: cloud.id,
              title: cloud.title,
              locale: cloud.locale as Resume['locale'],
              template: cloud.template as Resume['template'],
              themeColor: cloud.themeColor as Resume['themeColor'],
              styleSettings: cloud.styleSettings as Resume['styleSettings'],
              modules: cloud.modules as Resume['modules'],
              updatedAt: cloud.updatedAt,
            })
            store.setPersonalDataFromStorage(cloud.personalData || {})
            lastSyncedHashRef.current = cloudHash
            setSyncRevisions(current.localRevision, current.localRevision)
            setSaveStatus('synced')
            setSyncStatus('cloud_synced')
            saved = true
            resolveWaiters(current.localRevision, true)
          }
        } catch (conflictError) {
          console.error('[CloudSync] 自动对齐版本失败:', conflictError)
          setSaveStatus('error')
          setSyncStatus('error')
          resolveWaiters(targetRevision, false)
        }
      } else {
        console.warn('[CloudSync]', {
          event: 'save_failed',
          revision: targetRevision,
          durationMs: Date.now() - startedAt,
          payloadBytes,
          online: navigator.onLine,
        })
        setSaveStatus(navigator.onLine ? 'error' : 'offline')
        setSyncStatus(navigator.onLine ? 'error' : 'offline')
        resolveWaiters(targetRevision, false)
        scheduleRetry()
      }
    } finally {
      isSavingRef.current = false
      const latestRevision = useResumeStore.getState().localRevision
      const retryImmediately = retryImmediatelyRef.current
      const saveNewRevision = saved && latestRevision > targetRevision
      pendingRef.current = false
      retryImmediatelyRef.current = false
      if (retryImmediately || saveNewRevision) {
        void saveToCloud()
      }
    }
    return saved
  }, [isAuthenticated, scheduleRetry, setAckedRevision, setBasedOnSnapshotIdFromStorage, setSyncRevisions, setSyncStatus, updateVersions])

  const flushCurrentRevision = useCallback((): Promise<boolean> => {
    return saveToCloud()
  }, [saveToCloud])

  saveToCloudRef.current = saveToCloud

  const setCloudId = useCallback((id: string) => {
    cloudIdRef.current = id
    hasSyncedOnMountRef.current = true
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return
    const onVisibilityChange = () => {
      if (document.hidden) {
        flushDraft()
        void saveToCloud()
      }
    }
    const onBeforeUnload = () => {
      flushDraft()
      void saveToCloud(true)
    }
    const onOnline = () => {
      retryCountRef.current = 0
      setSaveStatus('idle')
      void saveToCloud()
    }
    const onBeforeKick = () => {
      flushDraft()
      void saveToCloud(true)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('online', onOnline)
    window.addEventListener('resumecraft:before-kick', onBeforeKick)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('resumecraft:before-kick', onBeforeKick)
    }
  }, [isAuthenticated, saveToCloud])

  // 输入停止 500ms 后自动保存；结构操作和连续输入会自然合并到最新 revision。
  useEffect(() => {
    if (!isAuthenticated || localRevision <= ackedRevision) return
    setSaveStatus(navigator.onLine ? 'idle' : 'offline')
    const timer = window.setTimeout(() => { void saveToCloud() }, 500)
    return () => window.clearTimeout(timer)
  }, [ackedRevision, isAuthenticated, localRevision, saveToCloud])

  // 离开输入控件时跳过防抖，立即尝试同步当前 revision。
  useEffect(() => {
    if (!isAuthenticated) return
    const onFocusOut = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (target.matches('input, textarea, [contenteditable="true"]')) {
        flushDraft()
        void saveToCloud()
      }
    }
    document.addEventListener('focusout', onFocusOut)
    return () => document.removeEventListener('focusout', onFocusOut)
  }, [isAuthenticated, saveToCloud])

  useEffect(() => {
    if (!isAuthenticated) return
    const current = buildPayload()
    if (serializePayload(current) !== lastSyncedHashRef.current) {
      setSaveStatus(navigator.onLine ? 'idle' : 'offline')
    }
  }, [isAuthenticated, resume])

  useEffect(() => {
    (window as any).__cloudSyncSetCloudId = setCloudId
    ;(window as any).__cloudSyncAlignVersion = (id: string, version: number, draftsVersion: number) => {
      cloudIdRef.current = id
      updateVersions(version, draftsVersion)
      hasSyncedOnMountRef.current = true
    }
    ;(window as any).__cloudSyncMarkSynced = () => {
      lastSyncedHashRef.current = serializePayload(buildPayload())
      hasSyncedOnMountRef.current = true
      const revision = useResumeStore.getState().localRevision
      setAckedRevision(revision)
      setSaveStatus('synced')
      setSyncStatus('cloud_synced')
    }
    ;(window as any).__cloudSyncMarkSyncedWith = () => {
      lastSyncedHashRef.current = serializePayload(buildPayload())
      hasSyncedOnMountRef.current = true
      const revision = useResumeStore.getState().localRevision
      setAckedRevision(revision)
      setSaveStatus('synced')
      setSyncStatus('cloud_synced')
    }
    registerFlushToCloud(flushCurrentRevision)
    return () => {
      delete (window as any).__cloudSyncSetCloudId
      delete (window as any).__cloudSyncAlignVersion
      delete (window as any).__cloudSyncMarkSynced
      delete (window as any).__cloudSyncMarkSyncedWith
      registerFlushToCloud(async () => false)
    }
  }, [flushCurrentRevision, setAckedRevision, setCloudId, setSyncStatus, updateVersions])

  const loadFromCloud = useCallback(async (resumeId: string) => {
    if (!isAuthenticated) return null
    try {
      const cloud = await resumeApi.get(resumeId)
      cloudIdRef.current = resumeId
      hasSyncedOnMountRef.current = true
      updateVersions(cloud.version ?? 0, cloud.snapshotDraftsVersion ?? 0)
      lastSyncedHashRef.current = serializePayload(cloudPayload(cloud))
      setSyncRevisions(useResumeStore.getState().localRevision, useResumeStore.getState().localRevision)
      setSaveStatus('synced')
      return cloud
    } catch (error) {
      console.error('[CloudSync] 加载失败:', error)
      setSaveStatus('error')
      return null
    }
  }, [isAuthenticated, setSaveStatus, setSyncRevisions, updateVersions])

  const manualSave = useCallback(() => saveToCloud(), [saveToCloud])

  return {
    saveToCloud,
    loadFromCloud,
    manualSave,
    setCloudId,
    saveStatus,
    lastSyncedAt,
  }
}
