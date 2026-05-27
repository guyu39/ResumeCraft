// ============================================================
// usePendingParse — 编辑器内后台解析简历
// 从 sessionStorage 读取 pending_parse，上传文件并填充数据
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { useResumeStore } from '@/store/resumeStore'
import { useAuthStore } from '@/store/authStore'
import { resumeApi } from '@/api'

interface PendingParseData {
    filename: string
    fileData: string // base64 data URL
}

export type ParseStatus = 'idle' | 'parsing' | 'done' | 'error'

export function usePendingParse() {
    const updateModuleData = useResumeStore((s) => s.updateModuleData)
    const { isAuthenticated } = useAuthStore()
    const [status, setStatus] = useState<ParseStatus>('idle')
    const [error, setError] = useState<string | null>(null)
    const parsedRef = useRef(false)

    useEffect(() => {
        if (parsedRef.current) return

        const raw = sessionStorage.getItem('pending_parse')
        if (!raw) return

        let data: PendingParseData
        try {
            data = JSON.parse(raw) as PendingParseData
        } catch {
            sessionStorage.removeItem('pending_parse')
            return
        }

        if (!data.fileData || !data.filename) {
            sessionStorage.removeItem('pending_parse')
            return
        }

        // 立即清除，避免刷新后重复解析
        sessionStorage.removeItem('pending_parse')
        parsedRef.current = true
        setStatus('parsing')

        runParse(data)
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    const runParse = useCallback(async (data: PendingParseData) => {
        try {
            // base64 data URL → File
            const base64 = data.fileData.split(',')[1]
            const mimeType = data.fileData.match(/data:([^;]+)/)?.[1] ?? 'application/pdf'
            const byteChars = atob(base64)
            const byteNums = new Array(byteChars.length)
            for (let i = 0; i < byteChars.length; i++) {
                byteNums[i] = byteChars.charCodeAt(i)
            }
            const byteArr = new Uint8Array(byteNums)
            const file = new File([byteArr], data.filename, { type: mimeType })

            const formData = new FormData()
            formData.append('file', file)

            const token = localStorage.getItem('accessToken')
            if (!token) {
                setError('请先登录')
                setStatus('error')
                return
            }

            const res = await fetch('/api/resumes/parse', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            })

            const json = await res.json()
            if (json.code !== 'OK') {
                setError(json.message || '简历解析失败')
                setStatus('error')
                return
            }

            const parsed = json.data as Record<string, unknown>

            // 合并解析结果到各模块
            const modules = useResumeStore.getState().resume.modules
            const mergedModuleIds = new Set<string>()

            for (const m of modules) {
                if (m.type === 'personal' && parsed.personal) {
                    updateModuleData(m.id, parsed.personal as Record<string, unknown>)
                    mergedModuleIds.add(m.id)
                } else if (m.type === 'summary' && parsed.summary) {
                    updateModuleData(m.id, (parsed.summary as Record<string, unknown>))
                    mergedModuleIds.add(m.id)
                } else if (m.type === 'skills' && parsed.skills) {
                    const sd = parsed.skills as Record<string, unknown>
                    const patch: Record<string, unknown> = {}
                    if (sd.content) patch.content = sd.content
                    if (sd.items && Array.isArray(sd.items) && sd.items.length > 0) patch.items = sd.items
                    if (sd.displayMode) patch.displayMode = sd.displayMode
                    if (Object.keys(patch).length > 0) {
                        updateModuleData(m.id, patch)
                        mergedModuleIds.add(m.id)
                    }
                } else if (['education', 'work', 'project', 'awards', 'certificates', 'languages', 'portfolio'].includes(m.type)) {
                    const pd = parsed[m.type] as { items?: unknown[] } | undefined
                    if (pd?.items && Array.isArray(pd.items) && pd.items.length > 0) {
                        updateModuleData(m.id, { items: pd.items } as Record<string, unknown>)
                        mergedModuleIds.add(m.id)
                    }
                }
            }

            // 保存到云端
            if (isAuthenticated && mergedModuleIds.size > 0) {
                const updated = useResumeStore.getState().resume
                try {
                    await resumeApi.update(updated.id, {
                        title: updated.title,
                        themeColor: updated.themeColor,
                        styleSettings: updated.styleSettings,
                        modules: updated.modules,
                    })
                } catch (err) {
                    console.error('[PendingParse] 云端保存失败:', err)
                }
            }

            setStatus('done')
        } catch (err) {
            setError(err instanceof Error ? err.message : '简历解析失败')
            setStatus('error')
        }
    }, [isAuthenticated, updateModuleData])

    const dismiss = useCallback(() => {
        setStatus('idle')
        setError(null)
    }, [])

    return { status, error, dismiss }
}
