// ============================================================
// AdminCommentContext — 管理员评论上下文
// 在编辑页（CenterPanel）提供，供 ClassicTemplate 消费
// 实现简历预览中内联显示评论徽章和展开面板
// ============================================================

import React, { createContext, useContext, useState, useCallback } from 'react'
import type { AdminCommentItem } from '@/api/resume'

interface AdminCommentContextValue {
  /** 全部评论（已按 moduleId + itemIndex 聚合） */
  comments: AdminCommentItem[]
  /** 当前展开的评论面板 key（格式: moduleId#itemIndex） */
  expandedKey: string | null
  /** 设置展开的面板 */
  setExpandedKey: (key: string) => void
  /** 获取指定 moduleId + itemIndex 的评论列表 */
  getCommentsForItem: (moduleId: string, itemIndex: number) => AdminCommentItem[]
  /** 获取指定 moduleId + itemIndex 的评论数量 */
  getCommentCount: (moduleId: string, itemIndex: number) => number
  /** 访客颜色映射（用于区分不同访客） */
  getVisitorColor: (visitorId: string) => string
  /** 删除评论回调 */
  onDeleteComment?: (commentId: string) => void
}

const AdminCommentContext = createContext<AdminCommentContextValue | null>(null)

export const useAdminCommentContext = () => useContext(AdminCommentContext)

/** 预定义的访客颜色池（柔和色，确保可读性） */
const VISITOR_COLORS = [
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#3b82f6', // blue-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#14b8a6', // teal-500
  '#6366f1', // indigo-500
]

interface AdminCommentProviderProps {
  children: React.ReactNode
  comments: AdminCommentItem[]
  onDeleteComment?: (commentId: string) => void
}

export const AdminCommentProvider: React.FC<AdminCommentProviderProps> = ({
  children,
  comments,
  onDeleteComment,
}) => {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const getCommentsForItem = useCallback(
    (moduleId: string, itemIndex: number) =>
      comments.filter((c) => c.moduleId === moduleId && c.itemIndex === itemIndex),
    [comments]
  )

  const getCommentCount = useCallback(
    (moduleId: string, itemIndex: number) =>
      comments.filter((c) => c.moduleId === moduleId && c.itemIndex === itemIndex).length,
    [comments]
  )

  const visitorColorMap = React.useMemo(() => {
    const map = new Map<string, string>()
    const uniqueVisitors = Array.from(new Set(comments.map((c) => c.visitorId)))
    uniqueVisitors.forEach((v, i) => {
      map.set(v, VISITOR_COLORS[i % VISITOR_COLORS.length])
    })
    return map
  }, [comments])

  const getSnapshotGroups = useCallback(() => {
    const map = new Map<string, { label: string; count: number }>()
    for (const c of comments) {
      const sid = c.snapshotId || '__unknown__'
      const e = map.get(sid) || { label: c.snapshotLabel || '', count: 0 }
      e.count++
      map.set(sid, e)
    }
    return Array.from(map.entries()).map(([snapshotId, v]) => ({ snapshotId, snapshotLabel: v.label || snapshotId, count: v.count }))
  }, [comments])

  const getCommentsBySnapshot = useCallback(
    (snapshotId: string) => comments.filter((c) => (c.snapshotId || '__unknown__') === snapshotId),
    [comments]
  )

  const getVisitorColor = useCallback(
    (visitorId: string) => visitorColorMap.get(visitorId) || '#94a3b8',
    [visitorColorMap]
  )

  const toggleKey = useCallback(
    (key: string) => {
      setExpandedKey((prev) => (prev === key ? null : key))
    },
    []
  )

  return (
    <AdminCommentContext.Provider
      value={{
        comments,
        expandedKey,
        setExpandedKey: toggleKey,
        getCommentsForItem,
        getCommentCount,
        getVisitorColor,
        onDeleteComment,
      }}
    >
      {children}
    </AdminCommentContext.Provider>
  )
}

export default AdminCommentContext
