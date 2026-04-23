// ============================================================
// 云端同步 Hook - 简历数据与后端同步
// 策略：
// 1. 编辑过程中实时保存到浏览器 (localStorage) - 由 resumeStore 处理
// 2. 定期保存到云端（每30秒，有变化时）
// 3. 离开编辑页时静默自动保存（不弹窗）
// 4. 进入页面时查询云端时间戳，不一致则保存本地数据到云端
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { useResumeStore } from '@/store/resumeStore'
import { useAuthStore } from '@/store/authStore'
import { resumeApi, ApiError } from '@/api'
import type { Resume } from '@/types/resume'

// 保存状态
export type SaveStatus = 'idle' | 'saving' | 'synced' | 'error' | 'loading'

// 检查是否是有效的 UUID
function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

// 简历序列号（用于比较是否有变化）
function serializeResume(r: Resume): string {
  return JSON.stringify({
    title: r.title,
    themeColor: r.themeColor,
    styleSettings: r.styleSettings,
    modules: r.modules,
  })
}

export function useCloudSync() {
  const resume = useResumeStore((s) => s.resume)
  const lastSavedAt = useResumeStore((s) => s.lastSavedAt)
  const markSaved = useResumeStore((s) => s.markSaved)
  const { isAuthenticated } = useAuthStore()

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)

  // Refs
  const isSyncingRef = useRef(false)
  const lastSyncedDataRef = useRef<string>('')
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cloudIdRef = useRef<string | null>(null) // 云端 ID（可能是 UUID）
  const hasSyncedOnMountRef = useRef(false) // 标记是否已完成进入时的同步检查

  // 保存到云端（SQL）
  const saveToCloud = useCallback(async (): Promise<boolean> => {
    if (!isAuthenticated) {
      console.log('[CloudSync] 未登录，跳过保存')
      return false
    }

    // 检查是否正在保存
    if (isSyncingRef.current) {
      console.log('[CloudSync] 正在保存中，跳过')
      return false
    }

    // 序列化和比较
    const currentData = serializeResume(resume)
    if (currentData === lastSyncedDataRef.current) {
      console.log('[CloudSync] 数据无变化，跳过保存')
      setSaveStatus('synced')
      return true
    }

    isSyncingRef.current = true
    setSaveStatus('saving')
    console.log('[CloudSync] 开始保存到云端...')

    try {
      let targetId = resume.id

      // 如果本地 ID 不是有效的 UUID，且还没有云端 ID，则在云端创建新简历
      if (!isValidUUID(resume.id) && !cloudIdRef.current) {
        console.log('[CloudSync] 本地简历尚未同步到云端，先创建...')
        const created = await resumeApi.create({
          title: resume.title,
          locale: resume.locale,
          template: resume.template,
          themeColor: resume.themeColor,
          styleSettings: resume.styleSettings,
          modules: resume.modules,
        })
        cloudIdRef.current = created.id
        targetId = created.id
        console.log('[CloudSync] 云端创建成功，新 ID:', targetId)
      } else if (cloudIdRef.current) {
        targetId = cloudIdRef.current
      }

      const result = await resumeApi.update(targetId, {
        title: resume.title,
        themeColor: resume.themeColor,
        styleSettings: resume.styleSettings,
        modules: resume.modules,
        clientUpdatedAt: Date.now(),
      })
      console.log('[CloudSync] 保存成功:', result)
      lastSyncedDataRef.current = currentData
      setLastSyncedAt(Date.now())
      setSaveStatus('synced')
      markSaved()
      return true
    } catch (err) {
      console.error('[CloudSync] 保存失败:', err)
      if (err instanceof ApiError) {
        console.error('[CloudSync] 错误码:', err.code, '状态:', err.status)
      }
      setSaveStatus('error')
      return false
    } finally {
      isSyncingRef.current = false
    }
  }, [resume, isAuthenticated, markSaved])

  // 定期自动保存到云端（每30秒）
  useEffect(() => {
    if (!isAuthenticated) {
      console.log('[CloudSync] 未登录，不启动定期保存')
      return
    }

    console.log('[CloudSync] 启动定期保存定时器 (30秒)')

    intervalIdRef.current = setInterval(() => {
      console.log('[CloudSync] 定时检查...')
      const currentData = serializeResume(resume)
      if (currentData !== lastSyncedDataRef.current) {
        console.log('[CloudSync] 检测到变化，执行保存')
        saveToCloud()
      } else {
        console.log('[CloudSync] 数据无变化')
      }
    }, 30000) // 30秒

    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current)
        console.log('[CloudSync] 停止定期保存定时器')
      }
    }
  }, [isAuthenticated, resume, saveToCloud])

  // 监听简历变化，立即更新本地状态
  useEffect(() => {
    if (!isAuthenticated) return

    const currentData = serializeResume(resume)
    if (currentData !== lastSyncedDataRef.current) {
      console.log('[CloudSync] 简历已变化，状态变为 idle')
      setSaveStatus('idle')
    }
  }, [resume, isAuthenticated])

  // 离开页面时静默自动保存（不弹窗提示）
  useEffect(() => {
    if (!isAuthenticated) return

    const handleBeforeUnload = () => {
      const currentData = serializeResume(resume)
      if (currentData !== lastSyncedDataRef.current) {
        console.log('[CloudSync] 页面关闭，静默保存...')
        // 直接触发保存，不阻塞关闭
        saveToCloud()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isAuthenticated, resume, saveToCloud])

  // 进入页面时同步检查：查询云端时间戳，不一致则保存
  useEffect(() => {
    if (!isAuthenticated) return
    if (hasSyncedOnMountRef.current) return // 防止重复执行
    if (!cloudIdRef.current && !isValidUUID(resume.id)) {
      console.log('[CloudSync] 进入页面，无云端 ID，跳过同步检查')
      return
    }

    const syncOnMount = async () => {
      hasSyncedOnMountRef.current = true
      const targetId = cloudIdRef.current || resume.id

      if (!isValidUUID(targetId)) {
        console.log('[CloudSync] 进入页面，ID 不是 UUID，跳过同步检查')
        return
      }

      console.log('[CloudSync] 进入页面，执行同步检查...')
      setSaveStatus('loading')

      try {
        // 查询云端简历的 updatedAt
        const cloudResume = await resumeApi.get(targetId)
        console.log('[CloudSync] 云端 updatedAt:', cloudResume.updatedAt, '本地 lastSavedAt:', lastSavedAt)

        // 比较时间戳：云端时间戳 vs 本地最后保存时间
        // 如果不一致，说明云端有更新（其他设备编辑过），或者本地有未保存的更改
        // 这里以本地时间戳为基准：如果本地 lastSavedAt 晚于云端 updatedAt，说明本地有新数据
        if (lastSavedAt && cloudResume.updatedAt && lastSavedAt > cloudResume.updatedAt) {
          console.log('[CloudSync] 检测到本地数据更新，执行保存')
          await saveToCloud()
        } else if (!lastSavedAt || lastSavedAt < cloudResume.updatedAt) {
          // 云端有更新（或其他情况），将云端数据同步到本地
          console.log('[CloudSync] 云端数据更新，将更新应用到本地')
          // 更新本地同步状态（不覆盖本地数据，只是标记已同步）
          lastSyncedDataRef.current = serializeResume(cloudResume as Resume)
          setSaveStatus('synced')
        }
      } catch (err) {
        console.error('[CloudSync] 同步检查失败:', err)
        // 如果是 404，说明云端没有这个简历，需要创建
        if (err instanceof ApiError && err.status === 404) {
          console.log('[CloudSync] 云端简历不存在，需要创建')
          await saveToCloud()
        } else {
          setSaveStatus('error')
        }
      }
    }

    // 延迟执行，确保其他初始化完成
    const timer = setTimeout(syncOnMount, 500)
    return () => clearTimeout(timer)
  }, [isAuthenticated]) // 只在 isAuthenticated 变化时触发

  // 加载简历从云端
  const loadFromCloud = useCallback(
    async (resumeId: string) => {
      if (!isAuthenticated) return null

      try {
        console.log('[CloudSync] 从云端加载简历:', resumeId)
        const cloudResume = await resumeApi.get(resumeId)
        // 更新同步状态
        const cloudData = serializeResume(cloudResume as Resume)
        lastSyncedDataRef.current = cloudData
        cloudIdRef.current = resumeId // 保存云端 ID
        hasSyncedOnMountRef.current = true // 标记已同步
        setSaveStatus('synced')
        console.log('[CloudSync] 加载成功')
        return cloudResume
      } catch (err) {
        console.error('[CloudSync] 加载失败:', err)
        return null
      }
    },
    [isAuthenticated]
  )

  // 手动保存
  const manualSave = useCallback(async () => {
    return await saveToCloud()
  }, [saveToCloud])

  // 设置云端 ID（当从云端加载简历时调用）
  const setCloudId = useCallback((id: string) => {
    cloudIdRef.current = id
    hasSyncedOnMountRef.current = true // 手动设置 ID 时标记已同步
    console.log('[CloudSync] 设置云端 ID:', id)
  }, [])

  // 暴露全局方法供外部调用（如 ResumeListPage）
  useEffect(() => {
    (window as any).__cloudSyncSetCloudId = setCloudId
    ;(window as any).__cloudSyncMarkSynced = () => {
      hasSyncedOnMountRef.current = true
      console.log('[CloudSync] 标记为已完成初始同步')
    }
    return () => {
      delete (window as any).__cloudSyncSetCloudId
      delete (window as any).__cloudSyncMarkSynced
    }
  }, [setCloudId])

  return {
    saveToCloud,
    loadFromCloud,
    manualSave,
    setCloudId,
    saveStatus,
    lastSyncedAt,
  }
}
