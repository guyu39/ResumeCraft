// ============================================================
// CommentsPanel — 编辑页侧栏评论列表（按快照 → 模块两层分组）
// ============================================================
// 变更记录：
// 2026-06-05 增加模块层级分组，显示完整的模块信息

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, MessageSquare, Trash2, X } from 'lucide-react'
import { resumeApi, type AdminCommentItem } from '@/api/resume'
import { useResumeStore } from '@/store/resumeStore'
import { type Module } from '@/types/resume'

interface Props {
  resumeId: string
  onClose: () => void
}

/** 从 modules 中解析 moduleId → 模块标题 */
function resolveModuleTitle(modules: Module[], moduleId: string): string {
  const mod = modules.find(m => m.id === moduleId)
  return mod?.title || mod?.type || '(模块)'
}

/** 从模块的 data.items 或 data 中解析 itemIndex → item 标签 */
function resolveItemLabel(mod: Module, itemIndex: number): string {
  if (mod.type === 'summary' || mod.type === 'skills') return ''
  const data = mod.data as any
  const items = data?.items as any[] | undefined
  if (!items || itemIndex >= items.length) return ''
  const item = items[itemIndex]
  if (!item) return ''
  return item.company || item.companyName || item.school || item.schoolName
    || item.name || item.practice || item.practiceName || item.title || ''
}

const CommentsPanel: React.FC<Props> = ({ resumeId, onClose }) => {
  const [items, setItems] = useState<AdminCommentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const resume = useResumeStore(s => s.resume)

  useEffect(() => {
    if (!resumeId) return
    setLoading(true)
    resumeApi.getComments(resumeId)
      .then(res => setItems(res.items || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [resumeId])

  // 按快照 → 模块两层分组，模块标题从当前简历解析
  const grouped = useMemo(() => {
    const modules = resume?.modules || []
    // snapshotKey → moduleKey → comments
    const snapshotMap = new Map<string, Map<string, AdminCommentItem[]>>()
    const snapshotLabels = new Map<string, string>()

    for (const item of items) {
      const snapKey = item.snapshotId || '__no_snapshot__'
      if (!snapshotMap.has(snapKey)) {
        snapshotMap.set(snapKey, new Map())
        snapshotLabels.set(snapKey, item.snapshotLabel || item.snapshotId || '未绑定快照')
      }
      const moduleMap = snapshotMap.get(snapKey)!
      const modKey = item.moduleId || '__unknown__'
      if (!moduleMap.has(modKey)) {
        moduleMap.set(modKey, [])
      }
      moduleMap.get(modKey)!.push(item)
    }

    return Array.from(snapshotMap.entries())
      .sort((a, b) => (a[0] === '__no_snapshot__' ? 1 : b[0] === '__no_snapshot__' ? -1 : 0))
      .map(([snapKey, moduleMap]) => ({
        snapshotKey: snapKey,
        snapshotLabel: snapshotLabels.get(snapKey) || '未绑定',
        modules: Array.from(moduleMap.entries()).map(([modKey, modComments]) => {
          const first = modComments[0]
          const mod = modules.find(m => m.id === modKey)
          const moduleTitle = first.moduleTitle || resolveModuleTitle(modules, modKey)
          const itemLabel = first.itemLabel || (mod ? resolveItemLabel(mod, first.itemIndex) : '')
          return {
            moduleKey: snapKey + '/' + modKey,
            moduleId: modKey,
            moduleTitle,
            itemLabel,
            comments: modComments,
          }
        }),
      }))
  }, [items, resume])

  const toggle = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const handleDelete = useCallback(async (commentId: string) => {
    setDeletingId(commentId)
    try {
      await resumeApi.deleteComment(resumeId, commentId)
      setItems(prev => prev.filter(c => c.id !== commentId))
    } catch { /* ignore */ }
    setDeletingId(null)
  }, [resumeId])

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-semibold text-gray-800">评论列表</h4>
          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{items.length}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
        ) : grouped.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">暂无评论</p>
        ) : (
          <div className="space-y-2">
            {grouped.map(snap => {
              const isSnapExpanded = expandedKeys.has(snap.snapshotKey)
              return (
                <div key={snap.snapshotKey} className="rounded-xl border border-gray-100 overflow-hidden">
                  {/* 快照分组头 */}
                  <button
                    onClick={() => toggle(snap.snapshotKey)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50/70 hover:bg-gray-100 transition-colors text-left"
                  >
                    {isSnapExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                    <span className="text-xs font-medium text-gray-700 truncate">{snap.snapshotLabel}</span>
                    <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">
                      {snap.modules.length} 模块 · {snap.modules.reduce((s, m) => s + m.comments.length, 0)} 条
                    </span>
                  </button>

                  {/* 快照下的模块列表 */}
                  {isSnapExpanded && snap.modules.map(mod => {
                    const isModExpanded = expandedKeys.has(mod.moduleKey)
                    return (
                      <div key={mod.moduleKey}>
                        {/* 模块分组头 */}
                        <button
                          onClick={() => toggle(mod.moduleKey)}
                          className="w-full flex items-center gap-2 px-5 py-2 bg-gray-50/30 hover:bg-gray-100/60 transition-colors text-left border-t border-gray-100"
                        >
                          {isModExpanded ? <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />}
                          <span className="text-[11px] font-medium text-gray-600 truncate">
                            {mod.moduleTitle}
                            {mod.itemLabel ? <span className="font-normal text-gray-400"> · {mod.itemLabel}</span> : null}
                          </span>
                          <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">{mod.comments.length} 条</span>
                        </button>

                        {/* 模块下的评论列表 */}
                        {isModExpanded && (
                          <div className="divide-y divide-gray-50 border-t border-gray-50">
                            {mod.comments.map(c => (
                              <div key={c.id} className="px-6 py-2.5 group">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-1">
                                      <span className="text-[11px] font-medium text-gray-700">{c.authorName}</span>
                                      <span className="text-[10px] text-gray-400">
                                        {c.createdAt ? new Date(c.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-gray-600 leading-relaxed break-words">{c.content}</p>
                                  </div>
                                  <button
                                    onClick={() => handleDelete(c.id)}
                                    disabled={deletingId === c.id}
                                    className="flex-shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"
                                    title="删除评论"
                                  >
                                    {deletingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default CommentsPanel
