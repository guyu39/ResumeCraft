import React, { useCallback, useMemo, useState } from 'react'
import { CalendarClock, FileText, PencilLine, Plus, SquarePen, Trash2 } from 'lucide-react'
import {
    createDefaultResume,
    getAllResumesFromStorage,
    renameResumeInStorage,
    removeResumeFromStorageCollection,
    saveResumeToCollectionStorage,
    selectResumeForEditingInStorage,
} from '@/store/resumeStore'
import type { Resume, TemplateType } from '@/types/resume'
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

const ResumeListPage: React.FC = () => {
    const [resumes, setResumes] = useState<Resume[]>(() => getAllResumesFromStorage())
    const [renamingResume, setRenamingResume] = useState<Resume | null>(null)
    const [renameTitle, setRenameTitle] = useState('')
    const { requestDelete, deleteConfirmDialog } = useDeleteConfirm()

    const sortedResumes = useMemo(
        () => resumes.slice().sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
        [resumes]
    )

    const refresh = useCallback(() => {
        setResumes(getAllResumesFromStorage())
    }, [])

    const goEditor = useCallback(() => {
        window.location.href = '/editor'
    }, [])

    const handleOpen = useCallback(
        (id: string) => {
            const ok = selectResumeForEditingInStorage(id)
            if (ok) {
                goEditor()
            }
        },
        [goEditor]
    )

    const handleCreate = useCallback(() => {
        const resume = createDefaultResume()
        saveResumeToCollectionStorage(resume)
        selectResumeForEditingInStorage(resume.id)
        goEditor()
    }, [goEditor])

    const handleDelete = useCallback(
        (id: string) => {
            const target = resumes.find((item) => item.id === id)
            const title = target?.title || '未命名简历'
            requestDelete({
                title: '删除简历',
                message: `确定删除「${title}」吗？该操作不可恢复。`,
                onConfirm: () => {
                    removeResumeFromStorageCollection(id)
                    refresh()
                },
            })
        },
        [refresh, requestDelete, resumes]
    )

    const openRename = useCallback((resume: Resume) => {
        setRenamingResume(resume)
        setRenameTitle((resume.title || '').trim() || '我的简历')
    }, [])

    const closeRename = useCallback(() => {
        setRenamingResume(null)
        setRenameTitle('')
    }, [])

    const submitRename = useCallback(() => {
        if (!renamingResume) return
        const ok = renameResumeInStorage(renamingResume.id, renameTitle)
        if (!ok) return
        refresh()
        closeRename()
    }, [closeRename, refresh, renameTitle, renamingResume])

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

    return (
        <>
            <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-8">
                <div className="mx-auto max-w-5xl space-y-6">
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

                    {sortedResumes.length === 0 ? (
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
                            {sortedResumes.map((resume) => (
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
                                                模板：{TEMPLATE_LABELS[resume.template]}
                                            </p>
                                        </div>
                                        <FileText className="h-5 w-5 shrink-0 text-slate-400" />
                                    </div>

                                    <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                                        <CalendarClock className="h-4 w-4" />
                                        <span>最近更新：{formatDate(resume.updatedAt)}</span>
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
        </>
    )
}

export default ResumeListPage
