// ============================================================
// SnapshotTimeline — 版本快照时间轴组件（浮动胶囊式）
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { resumeApi } from '@/api/resume'
import type { SnapshotListItem } from '@/api/resume'
import useDeleteConfirm from '@/hooks/useDeleteConfirm'
import { toast } from '@/components/common/Toast'

interface SnapshotTimelineProps {
  resumeId: string
  activeSnapshotId: string | null
  onSelectSnapshot?: (snapshot: SnapshotListItem) => void
  onCompareSnapshot?: (snapshotId: string) => void
  onSnapshotsLoaded?: (items: SnapshotListItem[]) => void
}

interface TooltipInfo {
  snapshot: SnapshotListItem
  x: number
  y: number
}

export default function SnapshotTimeline({
  resumeId, activeSnapshotId, onSelectSnapshot, onCompareSnapshot, onSnapshotsLoaded,
}: SnapshotTimelineProps) {
  const [snapshots, setSnapshots] = useState<SnapshotListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [renameInfo, setRenameInfo] = useState<TooltipInfo | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipHovered = useRef(false)
  const { requestDelete, deleteConfirmDialog } = useDeleteConfirm()

  const loadSnapshots = useCallback(async () => {
    if (!resumeId) return
    try {
      setLoading(true); setError(null)
      const res = await resumeApi.getSnapshots(resumeId, { limit: 50, includeAuto: false })
      setSnapshots(res.items)
      onSnapshotsLoaded?.(res.items)
    } catch { setError('加载版本历史失败') } finally { setLoading(false) }
  }, [resumeId, onSnapshotsLoaded])

  useEffect(() => { loadSnapshots() }, [loadSnapshots])
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current) }, [])

  const handleMouseEnter = (snapshot: SnapshotListItem, el: HTMLElement) => {
    if (renameInfo) return
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
    const rect = el.getBoundingClientRect()
    setTooltip({ snapshot, x: rect.left + rect.width / 2, y: rect.top })
  }

  const handleMouseLeave = () => {
    hideTimer.current = setTimeout(() => { if (!tooltipHovered.current) setTooltip(null) }, 150)
  }

  const handleTooltipEnter = () => { tooltipHovered.current = true }
  const handleTooltipLeave = () => { tooltipHovered.current = false; setTooltip(null) }

  const handleDelete = (snapshotId: string) => {
    requestDelete({
      title: '删除快照',
      message: '确定删除此快照？删除后不可恢复。',
      onConfirm: async () => {
        setTooltip(null)
        try {
          await resumeApi.deleteSnapshot(resumeId, snapshotId)
          await loadSnapshots()
          toast('快照已删除', 'success')
        } catch (e) {
          const code = (e as { code?: string })?.code
          toast(code === 'SNAPSHOT_IN_USE' ? '该快照已被投递记录使用，无法删除' : '删除快照失败', 'error')
        }
      },
    })
  }

  const handleStartRename = (snapshot: SnapshotListItem) => {
    setRenameValue(snapshot.label || '')
    setRenameInfo(tooltip)
    setTooltip(null)
  }

  const handleConfirmRename = async () => {
    if (!renameInfo || !renameValue.trim()) return
    try {
      await resumeApi.updateSnapshotLabel(resumeId, renameInfo.snapshot.id, renameValue.trim())
      setRenameInfo(null)
      await loadSnapshots()
    } catch { setError('重命名失败') }
  }

  const getNodeStyle = (_s: SnapshotListItem, hovered: boolean, isActive: boolean): React.CSSProperties => ({
    width: isActive ? 10 : 8,
    height: isActive ? 10 : 8,
    borderRadius: '50%',
    background: isActive ? '#1A56DB' : '#FFFFFF',
    border: `2px solid ${isActive ? '#1A56DB' : (hovered ? '#1A56DB' : '#94A3B8')}`,
    cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s ease',
    display: 'inline-block',
  })

  // 仅当存在 2 个及以上快照时才显示时间轴，避免单快照时显示孤零零的胶囊
  if (snapshots.length < 2) return null

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-auto">
      {error && snapshots.length === 0 && (
        <div className="text-center py-1 text-xs text-red-500 bg-red-50 rounded-full px-3">
          {error}<button className="ml-2 underline" onClick={() => setError(null)}>关闭</button>
        </div>
      )}

      <div className="flex items-center gap-1 bg-surface/90 backdrop-blur border border-line rounded-full shadow-lg px-2.5 py-1.5">
        {loading && snapshots.length === 0 && (
          <span className="text-xs text-muted px-2">加载中...</span>
        )}

        {snapshots.map((snapshot, i) => {
          const isHovered = tooltip?.snapshot.id === snapshot.id
          const isActive = activeSnapshotId === snapshot.id

          return (
            <div key={snapshot.id} className="flex items-center gap-1">
              {i > 0 && <div className="h-px w-2.5 bg-line" />}
              <button
                type="button"
                className="relative flex items-center gap-1.5 rounded-full px-1 py-0.5 cursor-pointer transition-colors hover:bg-slate-50"
                onMouseEnter={(e) => handleMouseEnter(snapshot, e.currentTarget)}
                onMouseLeave={handleMouseLeave}
                onClick={() => onSelectSnapshot?.(snapshot)}
              >
                <span style={getNodeStyle(snapshot, isHovered, isActive)} />
                {isActive && snapshot.label && (
                  <span className="text-[11px] text-primary font-medium whitespace-nowrap pr-0.5">
                    {snapshot.label}
                  </span>
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* Portal tooltip */}
      {tooltip && createPortal(
        <div className="fixed bg-surface border border-line rounded-xl shadow-lg p-2.5 z-[9999]"
          style={{
            left: Math.min(Math.max(tooltip.x - 95, 8), window.innerWidth - 200),
            bottom: window.innerHeight - tooltip.y + 14,
            whiteSpace: 'nowrap', minWidth: 170,
          }}
          onMouseEnter={handleTooltipEnter}
          onMouseLeave={handleTooltipLeave}
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-ink">
            <span>{tooltip.snapshot.label || tooltip.snapshot.snapshotType}</span>
          </div>
          <div className="text-[10px] text-muted mt-1">
            {new Date(tooltip.snapshot.createdAt).toLocaleString('zh-CN')}
          </div>
          <div className="flex gap-1.5 mt-2">
            {activeSnapshotId && activeSnapshotId !== tooltip.snapshot.id && (
              <button className="text-[10px] px-2 py-0.5 rounded border border-line bg-surface text-muted hover:text-ink hover:bg-slate-50"
                onClick={() => { onCompareSnapshot?.(tooltip.snapshot.id); setTooltip(null) }}>
                对比
              </button>
            )}
            <button className="text-[10px] px-2 py-0.5 rounded border border-line bg-surface text-muted hover:text-ink hover:bg-slate-50"
              onClick={() => handleStartRename(tooltip.snapshot)}>改名</button>
            <button className="text-[10px] px-2 py-0.5 rounded border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
              onClick={() => handleDelete(tooltip.snapshot.id)}>删除</button>
          </div>
        </div>,
        document.body
      )}

      {/* Portal 改名气泡 */}
      {renameInfo && createPortal(
        <div className="fixed bg-surface border border-line rounded-xl shadow-lg p-3 z-[10000]"
          style={{
            left: Math.min(Math.max(renameInfo.x - 80, 8), window.innerWidth - 180),
            bottom: window.innerHeight - renameInfo.y + 14,
          }}>
          <input className="w-36 px-2 py-1 text-xs border border-line rounded focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15 bg-surface"
            value={renameValue} onChange={(e) => setRenameValue(e.target.value)} maxLength={100} autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmRename(); if (e.key === 'Escape') setRenameInfo(null) }} />
          <div className="flex justify-end gap-2 mt-2">
            <button className="text-[10px] px-2 py-1 rounded border border-line bg-surface text-muted hover:bg-slate-50"
              onClick={() => setRenameInfo(null)}>取消</button>
            <button className="text-[10px] px-2 py-1 rounded bg-primary text-white hover:bg-blue-700"
              onClick={handleConfirmRename}>确定</button>
          </div>
        </div>,
        document.body
      )}

      {/* 全局删除确认弹窗（替换原生 confirm） */}
      {deleteConfirmDialog}
    </div>
  )
}
