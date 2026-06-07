// ============================================================
// SnapshotTimeline — 版本快照时间轴组件
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { resumeApi } from '@/api/resume'
import type { SnapshotListItem } from '@/api/resume'

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

  const handleDelete = async (snapshotId: string) => {
    if (!confirm('确定删除此快照？')) return
    setTooltip(null)
    try {
      await resumeApi.deleteSnapshot(resumeId, snapshotId)
      // 清除该快照的本地草稿
      try { localStorage.removeItem(`resumecraft_snapshot_draft_${snapshotId}`) } catch { /* ignore */ }
      await loadSnapshots()
    } catch { setError('删除快照失败') }
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
    width: hovered ? 20 : 18, height: hovered ? 20 : 18,
    borderRadius: '50%',
    background: isActive ? '#3B82F6' : '#1A56DB',
    border: isActive ? '2px solid #3B82F6' : 'none',
    boxShadow: isActive ? '0 0 0 3px rgba(59,130,246,0.3)' : 'none',
    cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s ease',
  })

  const nodeSpacing = 80

  return (
    <div className="w-full flex-shrink-0">
      {error && snapshots.length === 0 && (
        <div className="text-center py-1 text-xs text-red-500 bg-red-50">
          {error}<button className="ml-2 underline" onClick={() => setError(null)}>关闭</button>
        </div>
      )}

      <div className="flex items-center justify-center px-4 py-5 relative">
        <div className="absolute left-4 right-4 h-[3px] bg-gray-200 rounded" style={{ top: '50%', transform: 'translateY(-50%)' }} />

        {loading && snapshots.length === 0 && (
          <span className="text-xs text-gray-400">加载中...</span>
        )}

        <div className="flex items-center justify-center gap-0">
          {snapshots.map((snapshot) => {
            const isHovered = tooltip?.snapshot.id === snapshot.id
            const isActive = activeSnapshotId === snapshot.id

            return (
              <div key={snapshot.id} className="relative flex flex-col items-center flex-shrink-0"
                style={{ width: nodeSpacing }}
                onMouseEnter={(e) => handleMouseEnter(snapshot, e.currentTarget)}
                onMouseLeave={handleMouseLeave}
              >
                <div style={getNodeStyle(snapshot, isHovered, isActive)}
                  onClick={() => onSelectSnapshot?.(snapshot)}
                />
                {snapshot.label && (
                  <div className={`absolute top-full mt-1.5 text-[10px] font-semibold whitespace-nowrap max-w-[80px] truncate leading-tight text-center ${isActive ? 'text-[#3B82F6]' : 'text-[#1A56DB]'}`}>
                    {snapshot.label}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Portal tooltip */}
      {tooltip && createPortal(
        <div className="fixed bg-white border border-gray-200 rounded-lg shadow-xl p-2 z-[9999]"
          style={{
            left: Math.min(Math.max(tooltip.x - 95, 8), window.innerWidth - 200),
            bottom: window.innerHeight - tooltip.y + 14,
            whiteSpace: 'nowrap', minWidth: 170,
          }}
          onMouseEnter={handleTooltipEnter}
          onMouseLeave={handleTooltipLeave}
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-gray-800">
            <span>{tooltip.snapshot.label || tooltip.snapshot.snapshotType}</span>
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            {new Date(tooltip.snapshot.createdAt).toLocaleString('zh-CN')}
          </div>
          <div className="flex gap-2 mt-2">
            {activeSnapshotId && activeSnapshotId !== tooltip.snapshot.id && (
              <button className="text-[10px] px-2 py-0.5 bg-purple-50 hover:bg-purple-100 rounded text-purple-600"
                onClick={() => { onCompareSnapshot?.(tooltip.snapshot.id); setTooltip(null) }}>
                对比
              </button>
            )}
            <button className="text-[10px] px-2 py-0.5 bg-blue-50 hover:bg-blue-100 rounded text-blue-600"
              onClick={() => handleStartRename(tooltip.snapshot)}>改名</button>
            <button className="text-[10px] px-2 py-0.5 bg-red-50 hover:bg-red-100 rounded text-red-500"
              onClick={() => handleDelete(tooltip.snapshot.id)}>删除</button>
          </div>
        </div>,
        document.body
      )}

      {/* Portal 改名气泡 */}
      {renameInfo && createPortal(
        <div className="fixed bg-white border border-blue-300 rounded-lg shadow-xl p-3 z-[10000]"
          style={{
            left: Math.min(Math.max(renameInfo.x - 80, 8), window.innerWidth - 180),
            bottom: window.innerHeight - renameInfo.y + 14,
          }}>
          <input className="w-36 px-2 py-1 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            value={renameValue} onChange={(e) => setRenameValue(e.target.value)} maxLength={100} autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmRename(); if (e.key === 'Escape') setRenameInfo(null) }} />
          <div className="flex justify-end gap-2 mt-2">
            <button className="text-[10px] px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600"
              onClick={() => setRenameInfo(null)}>取消</button>
            <button className="text-[10px] px-2 py-1 bg-[#1A56DB] text-white rounded hover:bg-blue-700"
              onClick={handleConfirmRename}>确定</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
