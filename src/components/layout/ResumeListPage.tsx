// ============================================================
// 简历列表页面
// ============================================================

import React, { useCallback, useMemo, useRef, useState } from 'react'
import { CalendarClock, FileText, PencilLine, Plus, SquarePen, Trash2, LogOut, User, Cloud, FileSearch } from 'lucide-react'
import {
    createDefaultResume,
    getAllResumesFromStorage,
    renameResumeInStorage,
    removeResumeFromStorageCollection,
    saveResumeToCollectionStorage,
    selectResumeForEditingInStorage,
    setCurrentResumeIdToStorage,
} from '@/store/resumeStore'
import { useAuthStore } from '@/store/authStore'
import { resumeApi } from '@/api'
import type { Resume, TemplateType } from '@/types/resume'
import type { ResumeListItem } from '@/api'
import useDeleteConfirm from '@/hooks/useDeleteConfirm'
import { createPortal } from 'react-dom'

const TEMPLATE_LABELS: Record<TemplateType, string> = {
    classic: '经典单栏',
    modern: '现代双栏',
    minimal: '简约极简',
}

function formatDate(value: number): string {
    if (!value) return '未保存'
    return new Date(value).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
}

function isValidUUID(id: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

interface ResumeListPageProps {
    cloudResumes: ResumeListItem[]
    isAuthenticated: boolean
    onLogout: () => void
    onCloudResumeDeleted?: (id: string) => void
    onCloudResumeUpdated?: (id: string, title: string, updatedAt: number) => void
    onCloudResumeCreated?: (id: string, title: string, updatedAt: number) => void
}

const ResumeListPage: React.FC<ResumeListPageProps> = ({
    cloudResumes,
    isAuthenticated,
    onLogout,
    onCloudResumeDeleted,
    onCloudResumeUpdated,
    onCloudResumeCreated,
}) => {
    const { user } = useAuthStore()
    const [resumes, setResumes] = useState<Resume[]>(() => getAllResumesFromStorage())
    const [renamingResume, setRenamingResume] = useState<Resume | null>(null)
    const [renameTitle, setRenameTitle] = useState('')
    const [pendingCreateName, setPendingCreateName] = useState<string | null>(null) // null=不弹窗
    const [createName, setCreateName] = useState('')
    const { requestDelete, deleteConfirmDialog } = useDeleteConfirm()
    const [syncing, setSyncing] = useState(false)

    const [showCreateMode, setShowCreateMode] = useState(false)
    const [parseError, setParseError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const refresh = useCallback(() => {
        setResumes(getAllResumesFromStorage())
    }, [])

    // 同步简历到云端
    const syncToCloud = useCallback(async (resume: Resume) => {
        if (!isAuthenticated) return
        setSyncing(true)
        try {
            const result = await resumeApi.update(resume.id, {
                title: resume.title,
                themeColor: resume.themeColor,
                styleSettings: resume.styleSettings,
                modules: resume.modules,
            })
            // 通知父组件云端简历已更新
            onCloudResumeUpdated?.(resume.id, resume.title, result.updatedAt)
        } catch (err) {
            console.error('[ResumeList] 同步失败:', err)
        } finally {
            setSyncing(false)
        }
    }, [isAuthenticated, onCloudResumeUpdated])

    const goEditor = useCallback(() => {
        window.location.href = '/editor'
    }, [])

    const handleOpen = useCallback(
        async (id: string) => {
            // 如果已登录，先同步当前简历（仅本地简历）
            if (isAuthenticated) {
                const currentResume = getAllResumesFromStorage().find(r => r.id === id)
                if (currentResume) {
                    await syncToCloud(currentResume)
                }
            }
            // 尝试从本地存储选中
            const ok = selectResumeForEditingInStorage(id)
            if (ok) {
                // 通知 useCloudSync 关于云端 ID
                ;(window as any).__cloudSyncSetCloudId?.(id)
                ;(window as any).__cloudSyncMarkSynced?.()
                goEditor()
                return
            }
            // 本地没有，但 ID 是 UUID（云端简历），直接设置当前 ID 并跳转
            if (isValidUUID(id)) {
                setCurrentResumeIdToStorage(id)
                ;(window as any).__cloudSyncSetCloudId?.(id)
                ;(window as any).__cloudSyncMarkSynced?.()
                goEditor()
            }
        },
        [goEditor, isAuthenticated, syncToCloud]
    )

    const doCreate = useCallback(async (title: string) => {
        const resume = createDefaultResume()
        resume.title = title

        if (isAuthenticated) {
            // 云端创建
            try {
                const created = await resumeApi.create({
                    title: resume.title,
                    locale: resume.locale,
                    template: resume.template,
                    themeColor: resume.themeColor,
                    styleSettings: resume.styleSettings,
                    modules: resume.modules,
                })
                // 使用云端返回的简历
                saveResumeToCollectionStorage({
                    ...resume,
                    id: created.id,
                    updatedAt: created.updatedAt,
                } as Resume)
                selectResumeForEditingInStorage(created.id)
                // 通知 useCloudSync 关于云端 ID
                ;(window as any).__cloudSyncSetCloudId?.(created.id)
                ;(window as any).__cloudSyncMarkSynced?.()
                // 通知父组件云端简历已创建
                onCloudResumeCreated?.(created.id, created.title, created.updatedAt)

                // 导航到编辑器
                goEditor()
                return
            } catch (err) {
                console.error('[ResumeList] 云端创建失败:', err)
                // 回退到本地创建
                saveResumeToCollectionStorage(resume)
                selectResumeForEditingInStorage(resume.id)
                refresh()
            }
        } else {
            saveResumeToCollectionStorage(resume)
            selectResumeForEditingInStorage(resume.id)
            refresh()
        }
        // 本地/回退路径（非 UUID）：需要 skip_auto_load 让 App.tsx 走 loadFromStorage
        sessionStorage.setItem('skip_auto_load', 'true')
        goEditor()
    }, [goEditor, isAuthenticated, onCloudResumeCreated, refresh])

    const openCreateNameDialog = useCallback(() => {
        const defaultTitle = createDefaultResume().title
setPendingCreateName(defaultTitle)
        setCreateName('')
    }, [])

    const closeCreateNameDialog = useCallback(() => {
        setPendingCreateName(null)
        setCreateName('')
    }, [])

    const handleDelete = useCallback(
        (id: string) => {
            // 同时查找本地简历和云端简历
            const local = resumes.find((item) => item.id === id)
            const cloud = cloudResumes.find((item) => item.id === id)
            const title = local?.title || cloud?.title || '未命名简历'

            requestDelete({
                title: '删除简历',
                message: `确定删除「${title}」吗？该操作不可恢复。`,
                onConfirm: async () => {
                    // 用户确认后，先删除本地
                    removeResumeFromStorageCollection(id)
                    refresh()

                    // 如果已登录，再调用云端删除
                    if (isAuthenticated) {
                        try {
                            await resumeApi.delete(id)
                            // 通知父组件云端简历已删除
                            onCloudResumeDeleted?.(id)
                        } catch (err) {
                            console.error('[ResumeList] 云端删除失败:', err)
                        }
                    }
                },
            })
        },
        [refresh, requestDelete, resumes, cloudResumes, isAuthenticated, onCloudResumeDeleted]
    )

    const openRename = useCallback((resume: Resume) => {
        setRenamingResume(resume)
        setRenameTitle((resume.title || '').trim() || '我的简历')
    }, [])

    const closeRename = useCallback(() => {
        setRenamingResume(null)
        setRenameTitle('')
    }, [])

    const submitRename = useCallback(async () => {
        if (!renamingResume) return
        const ok = renameResumeInStorage(renamingResume.id, renameTitle)
        if (!ok) return

        // 如果已登录，同步到云端
        if (isAuthenticated) {
            const updated = getAllResumesFromStorage().find(r => r.id === renamingResume.id)
            if (updated) {
                await syncToCloud(updated)
            }
        }

        refresh()
        closeRename()
    }, [closeRename, isAuthenticated, refresh, renameTitle, renamingResume, syncToCloud])

    const renameDialog = useMemo(() => {
        if (!renamingResume) return null

        return createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                <div className="absolute inset-0 bg-black/35" onClick={closeRename} />
                <div className="relative w-full max-w-md rounded-2xl border border-gray-100 bg-white p-5 shadow-2xl">
                    <h4 className="text-base font-semibold text-gray-800">重命名简历</h4>
                    <p className="mt-2 text-sm leading-relaxed text-gray-500">
                        为「{renamingResume.title || '未命名简历'}」设置新名称
                    </p>

                    <input
                        type="text"
                        value={renameTitle}
                        onChange={(event) => setRenameTitle(event.target.value)}
                        maxLength={50}
                        autoFocus
                        className="mt-4 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        placeholder="请输入简历名称"
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault()
                                submitRename()
                            }
                            if (event.key === 'Escape') {
                                event.preventDefault()
                                closeRename()
                            }
                        }}
                    />

                    <div className="mt-5 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={closeRename}
                            className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm text-gray-600 hover:bg-gray-50"
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            onClick={submitRename}
                            disabled={!renameTitle.trim()}
                            className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            保存
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        )
    }, [closeRename, renameTitle, renamingResume, submitRename])

    const submitCreateName = useCallback(() => {
        const name = createName.trim() || createDefaultResume().title
        closeCreateNameDialog()
        doCreate(name)
    }, [createName, closeCreateNameDialog, doCreate])

    const CreateNameDialogModal = useMemo(() => {
        if (!pendingCreateName) return null

        return createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                <div className="absolute inset-0 bg-black/35" onClick={closeCreateNameDialog} />
                <div className="relative w-full max-w-md rounded-2xl border border-gray-100 bg-white p-5 shadow-2xl">
                    <h4 className="text-base font-semibold text-gray-800">新建简历</h4>
                    <p className="mt-2 text-sm leading-relaxed text-gray-500">
                        已有重名简历「{pendingCreateName}」，请输入新的简历名称
                    </p>

                    <input
                        type="text"
                        value={createName}
                        onChange={(event) => setCreateName(event.target.value)}
                        maxLength={50}
                        autoFocus
                        className="mt-4 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        placeholder="请输入简历名称"
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault()
                                submitCreateName()
                            }
                            if (event.key === 'Escape') {
                                event.preventDefault()
                                closeCreateNameDialog()
                            }
                        }}
                    />

                    <div className="mt-5 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={closeCreateNameDialog}
                            className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm text-gray-600 hover:bg-gray-50"
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            onClick={submitCreateName}
                            className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm text-white hover:bg-slate-800"
                        >
                            创建
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        )
    }, [pendingCreateName, createName, closeCreateNameDialog, submitCreateName])

    const displayResumes = useMemo(() => {
        if (!isAuthenticated) return []
        return cloudResumes.map(cr => ({
            id: cr.id,
            title: cr.title,
            template: cr.template as TemplateType,
            locale: 'zh-CN' as const,
            themeColor: '#1A56DB',
            styleSettings: { fontFamily: 'Microsoft YaHei', fontSize: 12, textColor: '#363636', lineHeight: 1.3, pagePaddingHorizontal: 20, pagePaddingVertical: 20, moduleSpacing: 7, paragraphSpacing: 1, moduleTitleLinePosition: 'left', moduleTitleMarkerStyle: 'bar', moduleTitleMarkerVisible: true },
            updatedAt: cr.updatedAt,
            modules: [],
        })) as Resume[]
}, [isAuthenticated, cloudResumes])

    const handleCreate = useCallback(() => {
        setShowCreateMode(true)
    }, [])

    const handleCreateBlank = useCallback(() => {
        setShowCreateMode(false)
        const defaultTitle = createDefaultResume().title
        const allTitles = displayResumes.map(r => r.title)
        if (allTitles.includes(defaultTitle)) {
            openCreateNameDialog()
        } else {
            doCreate(defaultTitle)
        }
    }, [displayResumes, openCreateNameDialog, doCreate])

    const handleChooseParse = useCallback(() => {
        setShowCreateMode(false)
        setParseError(null)
        fileInputRef.current?.click()
    }, [])

    const handleParseResume = useCallback(async (file: File) => {
        // 读取文件为 base64，存入 sessionStorage 供编辑器后台解析
        try {
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = () => resolve(reader.result as string)
                reader.onerror = () => reject(new Error('读取文件失败'))
                reader.readAsDataURL(file)
            })

            sessionStorage.setItem('pending_parse', JSON.stringify({
                filename: file.name,
                fileData: base64,
            }))

            // 立即创建空白简历
            const resume = createDefaultResume()
            resume.title = `简历-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`

            if (isAuthenticated) {
                try {
                    const created = await resumeApi.create({
                        title: resume.title,
                        locale: resume.locale,
                        template: resume.template,
                        themeColor: resume.themeColor,
                        styleSettings: resume.styleSettings,
                        modules: resume.modules,
                    })
                    saveResumeToCollectionStorage({ ...resume, id: created.id, updatedAt: created.updatedAt } as Resume)
                    selectResumeForEditingInStorage(created.id)
                    ;(window as any).__cloudSyncSetCloudId?.(created.id)
                    ;(window as any).__cloudSyncMarkSynced?.()
                    onCloudResumeCreated?.(created.id, created.title, created.updatedAt)
                    goEditor()
                    return
                } catch (err) {
                    console.error('[ResumeList] 云端创建失败，回退本地:', err)
                }
            }

            // 本地回退
            saveResumeToCollectionStorage(resume)
            selectResumeForEditingInStorage(resume.id)
            refresh()
            sessionStorage.setItem('skip_auto_load', 'true')
            goEditor()
        } catch (err) {
            const message = err instanceof Error ? err.message : '读取文件失败'
            setParseError(message)
        }
    }, [isAuthenticated, onCloudResumeCreated, refresh, goEditor])

    return (
        <>
            <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-8">
                <div className="mx-auto max-w-5xl space-y-6">
                    {/* 头部 */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                                    我的简历
                                </h1>
                                <p className="mt-2 text-sm text-slate-600">
                                    选择一份简历继续编辑，或创建新的简历版本。
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                {isAuthenticated && user && (
                                    <div className="flex items-center gap-2 text-sm text-slate-600">
                                        <User className="h-4 w-4" />
                                        <span>{user.displayName || user.email}</span>
                                        {syncing && <Cloud className="h-4 w-4 animate-pulse" />}
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={onLogout}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                                >
                                    <LogOut className="h-4 w-4" />
                                    退出登录
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCreate}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                                >
                                    <Plus className="h-4 w-4" />
                                    新建简历
                                </button>
                            </div>
                        </div>
                    </div>

                    {isAuthenticated && cloudResumes.length > 0 && (
                        <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-700">
                            <Cloud className="mr-2 inline h-4 w-4" />
                            已同步 {cloudResumes.length} 份简历到云端
                        </div>
                    )}

                    {displayResumes.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
                            <p className="text-base text-slate-600">还没有简历，先创建第一份吧。</p>
                            <button
                                type="button"
                                onClick={handleCreate}
                                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                            >
                                <Plus className="h-4 w-4" />
                                立即创建
                            </button>
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2">
                            {displayResumes.map((resume) => (
                                <article
                                    key={resume.id}
                                    className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h2 className="truncate text-base font-semibold text-slate-900">
                                                {resume.title || '未命名简历'}
                                            </h2>
                                            <p className="mt-1 text-sm text-slate-500">
                                                模板：{TEMPLATE_LABELS[resume.template] || '经典单栏'}
                                            </p>
                                        </div>
                                        <FileText className="h-5 w-5 shrink-0 text-slate-400" />
                                    </div>

                                    <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                                        <CalendarClock className="h-4 w-4" />
                                        <span>最近更新：{formatDate(resume.updatedAt)}</span>
                                        {isAuthenticated && (
                                            <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">
                                                云端
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-5 flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleOpen(resume.id)}
                                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                                        >
                                            <PencilLine className="h-4 w-4" />
                                            打开编辑
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(resume.id)}
                                            className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-slate-600 transition hover:border-red-300 hover:text-red-600"
                                            aria-label="删除简历"
                                            title="删除简历"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => openRename(resume)}
                                            className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
                                            aria-label="重命名简历"
                                            title="重命名简历"
                                        >
                                            <SquarePen className="h-4 w-4" />
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            {deleteConfirmDialog}
            {renameDialog}
            {CreateNameDialogModal}

            {/* 隐藏的文件选择器 - 简历解析导入 */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleParseResume(file)
                    e.target.value = ''
                }}
            />

            {/* 新建方式选择弹窗 */}
            {showCreateMode && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                    <div className="absolute inset-0 bg-black/35" onClick={() => setShowCreateMode(false)} />
                    <div className="relative w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl">
                        <h4 className="text-base font-semibold text-gray-800">新建简历</h4>
                        <p className="mt-1 text-sm text-gray-500">选择一种方式创建简历</p>

                        <div className="mt-5 space-y-3">
                            <button
                                type="button"
                                onClick={handleCreateBlank}
                                className="flex w-full items-center gap-4 rounded-xl border border-gray-200 p-4 text-left transition hover:border-primary/40 hover:bg-primary/5"
                            >
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                                    <Plus className="h-5 w-5 text-slate-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-gray-800">新建空白简历</p>
                                    <p className="text-xs text-gray-500">从零开始创建一份简历</p>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={handleChooseParse}
                                className="flex w-full items-center gap-4 rounded-xl border border-gray-200 p-4 text-left transition hover:border-primary/40 hover:bg-primary/5"
                            >
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                                    <FileSearch className="h-5 w-5 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-gray-800">解析简历导入</p>
                                    <p className="text-xs text-gray-500">上传 PDF / Word 文件，AI 自动识别填充</p>
                                </div>
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowCreateMode(false)}
                            className="mt-4 w-full rounded-lg border border-gray-200 py-2 text-sm text-gray-500 hover:bg-gray-50"
                        >
                            取消
                        </button>
                    </div>
                </div>,
                document.body
            )}

            {/* 解析错误提示 */}
            {parseError && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                    <div className="absolute inset-0 bg-black/35" onClick={() => setParseError(null)} />
                    <div className="relative w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl text-center">
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
                            <span className="text-xl">!</span>
                        </div>
                        <p className="mt-4 text-sm font-medium text-gray-800">解析失败</p>
                        <p className="mt-1 text-xs text-red-600">{parseError}</p>
                        <button
                            type="button"
                            onClick={() => setParseError(null)}
                            className="mt-4 w-full rounded-lg border border-gray-200 py-2 text-sm text-gray-500 hover:bg-gray-50"
                        >
                            确定
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </>
    )
}

export default ResumeListPage