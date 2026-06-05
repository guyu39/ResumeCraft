// ============================================================
// CommentSummaryPanel — 管理员评论汇总面板
// 在编辑页展示该简历的全部分享评论，按模块归类
// ============================================================

import React, { useEffect, useMemo, useState } from 'react'
import { MessageSquare, ChevronDown, ChevronRight, Users, Hash, X } from 'lucide-react'
import { resumeApi, type AdminCommentItem, type ModuleCommentSummary } from '@/api/resume'
import { useResumeStore } from '@/store/resumeStore'

interface GroupedComments {
  moduleId: string
  moduleTitle: string
  items: {
    itemIndex: number
    itemLabel: string
    comments: AdminCommentItem[]
  }[]
}

function hashColor(str: string): string {
  const colors = [
    '#1A56DB', '#0E9F6E', '#F05252', '#9061F9', '#E02424',
    '#0694A2', '#D03801', '#7E3AF2', '#047857', '#B45309',
  ]
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function groupComments(items: AdminCommentItem[], modules: { id: string; title: string; type: string }[]): GroupedComments[] {
  const moduleMap = new Map<string, string>()
  for (const m of modules) moduleMap.set(m.id, m.title)

  const byModule = new Map<string, Map<number, AdminCommentItem[]>>()
  for (const item of items) {
    const modKey = item.moduleId
    if (!byModule.has(modKey)) byModule.set(modKey, new Map())
    const byItem = byModule.get(modKey)!
    if (!byItem.has(item.itemIndex)) byItem.set(item.itemIndex, [])
    byItem.get(item.itemIndex)!.push(item)
  }

  const result: GroupedComments[] = []
  for (const [modId, byItem] of byModule) {
    const itemsArr: GroupedComments['items'] = []
    let firstComment: AdminCommentItem | undefined
    for (const [itemIndex, itemComments] of byItem) {
      if (!firstComment) firstComment = itemComments[0]
      const label = itemComments[0]?.itemLabel || `#${itemIndex}`
      itemsArr.push({ itemIndex, itemLabel: label, comments: itemComments })
    }
    result.push({
      moduleId: modId,
      moduleTitle: moduleMap.get(modId) || firstComment?.moduleTitle || modId,
      items: itemsArr,
    })
  }
  return result
}

const CommentSummaryPanel: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const resume = useResumeStore((s) => s.resume)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{ items: AdminCommentItem[]; summary: { totalComments: number; totalVisitors: number; moduleBreakdown: ModuleCommentSummary[] } } | null>(null)
  const [err, setErr] = useState('')
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!resume.id) return
    setLoading(true)
    resumeApi.getComments(resume.id)
      .then((r) => setData(r))
      .catch(() => setErr('加载评论失败'))
      .finally(() => setLoading(false))
  }, [resume.id])

  const modules = useMemo(() => {
    return resume.modules.map((m) => ({ id: m.id as string, title: m.title as string, type: m.type as string }))
  }, [resume.modules])

  const grouped = useMemo(() => {
    if (!data?.items) return []
    return groupComments(data.items, modules)
  }, [data, modules])

  const toggleModule = (id: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleItem = (key: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  if (err) {
    return <p className="text-xs text-red-400 text-center py-4">{err}</p>
  }

  if (!data || data.summary.totalComments === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-400">
        <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-xs">暂无分享评论</p>
        <p className="text-[10px] mt-1 opacity-60">分享简历链接后可收集访客反馈</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 头部统计 */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4 text-primary" />
            评论汇总
          </h3>
          {onClose && (
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
        </div>
        <div className="flex gap-3 text-[11px] text-gray-500">
          <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{data.summary.totalComments} 条</span>
          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{data.summary.totalVisitors} 人</span>
        </div>
      </div>

      {/* 模块列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 no-scrollbar">
        {grouped.map((mod) => {
          const modExpanded = expandedModules.has(mod.moduleId)
          const modCommentCount = mod.items.reduce((sum, it) => sum + it.comments.length, 0)
          return (
            <div key={mod.moduleId} className="rounded-lg border border-gray-100 bg-white overflow-hidden">
              {/* 模块标题 */}
              <button
                onClick={() => toggleModule(mod.moduleId)}
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {modExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                  <span className="text-xs font-medium text-gray-700 truncate">{mod.moduleTitle}</span>
                </div>
                <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">{modCommentCount} 条</span>
              </button>

              {/* 子项列表 */}
              {modExpanded && (
                <div className="px-3 pb-2 space-y-1">
                  {mod.items.map((item) => {
                    const itemKey = `${mod.moduleId}#${item.itemIndex}`
                    const itemExpanded = expandedItems.has(itemKey)
                    return (
                      <div key={itemKey} className="rounded-md bg-gray-50/70">
                        <button
                          onClick={() => toggleItem(itemKey)}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 text-left hover:bg-gray-100 rounded-md transition-colors"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            {itemExpanded ? <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />}
                            <span className="text-[11px] text-gray-600 truncate">{item.itemLabel}</span>
                          </div>
                          <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">{item.comments.length}</span>
                        </button>

                        {/* 评论列表 */}
                        {itemExpanded && (
                          <div className="px-2.5 pb-2 pt-0.5 space-y-2">
                            {item.comments.map((c) => (
                              <div key={c.id} className="text-[11px]">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span
                                    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: hashColor(c.visitorId) }}
                                  />
                                  <span className="font-medium text-gray-700">{c.authorName}</span>
                                  <span className="text-gray-400 text-[10px] ml-auto">
                                    {new Date(c.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                <p className="text-gray-600 leading-relaxed pl-3.5">{c.content}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default CommentSummaryPanel
