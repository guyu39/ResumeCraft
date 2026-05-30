// ============================================================
// CenterPanel — 中栏简历实时预览区
// ============================================================

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useResumeStore } from '@/store/resumeStore'
import PagedResumePaper, { A4_HEIGHT_PX, A4_WIDTH_PX } from '@/components/resume/PagedResumePaper'
import SnapshotTimeline from '@/components/common/SnapshotTimeline'
import { resumeApi, type SnapshotListItem, type DiffResult } from '@/api/resume'
import type { Resume } from '@/types/resume'

const FIT_PADDING_PX = 24
const FIT_BOOST_RATIO = 1.3
const MAX_PREVIEW_SCALE = 1.3

const CenterPanel: React.FC = () => {
  const { resume, previewResume, setPreviewResume, clearPreviewResume, setActiveSnapshotId, activeSnapshotId, snapshotVersion } = useResumeStore()
  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [contentHeight, setContentHeight] = useState(A4_HEIGHT_PX)
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
  const [snapshots, setSnapshots] = useState<SnapshotListItem[]>([])
  const isServerResume = resume?.id && resume.id.includes('-')

  const displayResume = previewResume ?? resume

  // 当前活跃快照的标签名
  const activeSnapshotLabel = previewResume
    ? snapshots.find((s) => s.id === activeSnapshotId)?.label || `v${snapshots.find((s) => s.id === activeSnapshotId)?.versionNo}`
    : null

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const updateSize = () => setViewportSize({ width: element.clientWidth, height: element.clientHeight })
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const autoFitScale = useMemo(() => {
    const { width, height } = viewportSize
    if (!width || !height) return 1
    const fitWidth = (width - FIT_PADDING_PX * 2) / A4_WIDTH_PX
    const fitHeight = (height - FIT_PADDING_PX * 2) / A4_HEIGHT_PX
    return Math.max(0.2, Math.min(fitWidth, fitHeight, 1))
  }, [viewportSize])

  const finalScale = Math.min(autoFitScale * FIT_BOOST_RATIO, MAX_PREVIEW_SCALE)

  // 点击节点 → 预览
  const handleSelectSnapshot = useCallback(async (snapshot: SnapshotListItem) => {
    try {
      const { content } = await resumeApi.getSnapshotDetail(resume.id, snapshot.id)
      const c = content as { modules?: unknown[]; themeColor?: string; styleSettings?: unknown }
      if (c && c.modules) {
        setPreviewResume({
          ...resume,
          modules: c.modules as Resume['modules'],
          themeColor: (c.themeColor as Resume['themeColor']) ?? resume.themeColor,
          styleSettings: (c.styleSettings as Resume['styleSettings']) ?? resume.styleSettings,
        })
        setActiveSnapshotId(snapshot.id)
      }
    } catch { /* ignore */ }
  }, [resume, setPreviewResume, setActiveSnapshotId])

  // 对比：tooltip 点击「对比」触发
  const handleCompareSnapshot = useCallback(async (snapshotId: string) => {
    if (!activeSnapshotId || activeSnapshotId === snapshotId) return
    try {
      const result = await resumeApi.diffSnapshots(resume.id, activeSnapshotId, snapshotId)
      setDiffResult(result)
    } catch { /* ignore */ }
  }, [resume.id, activeSnapshotId])

  // 首次加载快照列表（用于显示标签名）
  const handleSnapshotsLoaded = useCallback((items: SnapshotListItem[]) => {
    setSnapshots(items)
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* 顶部工具栏 */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-gray-600">简历预览</h2>
          {activeSnapshotLabel && (
            <span className="text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded">📸 {activeSnapshotLabel}</span>
          )}
          {previewResume && (
            <button className="text-xs text-gray-400 hover:text-gray-600 underline" onClick={clearPreviewResume}>
              回到当前
            </button>
          )}
        </div>
         {/* 切割提示 */}
      <div className="flex-shrink-0 text-center py-1.5 text-xs text-amber-600 border-b border-amber-100 bg-amber-50/40 rounded-md">        如遇内容被切割，可通过增加换行、或前往「设置」调整间距解决
      </div>
        <div className="text-xs text-gray-500">
          实际 {Math.round(finalScale * 100)}% · A4 纸张
        </div>
      </div>

     

      {/* 简历画布区域 */}
      <div ref={viewportRef} className="flex-1 overflow-auto no-scrollbar flex items-start justify-center pt-8 pb-12 px-8">
        <div className="flex-shrink-0"
          style={{ width: `${A4_WIDTH_PX * finalScale}px`, minHeight: `${Math.max(A4_HEIGHT_PX, contentHeight) * finalScale}px` }}>
          <div
            style={{ width: `${A4_WIDTH_PX}px`, transform: `scale(${finalScale})`, transformOrigin: 'top left' }}
            ref={(node) => { if (!node) return; setContentHeight(node.scrollHeight) }}
          >
            <PagedResumePaper resume={displayResume} />
          </div>
        </div>
      </div>

      {/* 版本快照时间轴 */}
      {isServerResume && (
        <div className="flex-shrink-0 border-t border-gray-100">
          <SnapshotTimeline
            key={snapshotVersion}
            resumeId={resume.id}
            activeSnapshotId={activeSnapshotId}
            onSelectSnapshot={handleSelectSnapshot}
            onCompareSnapshot={handleCompareSnapshot}
            onSnapshotsLoaded={handleSnapshotsLoaded}
          />
        </div>
      )}

      {/* 差异对比弹窗 */}
      {diffResult && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30" onClick={() => setDiffResult(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-[600px] max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="text-base font-semibold text-gray-800">
                版本对比：{diffResult.snapshotA.label || `v${diffResult.snapshotA.versionNo}`} vs {diffResult.snapshotB.label || `v${diffResult.snapshotB.versionNo}`}
              </h3>
              <button className="text-gray-400 hover:text-gray-600 text-lg" onClick={() => setDiffResult(null)}>✕</button>
            </div>
            <div className="px-6 py-4">
              <div className="flex gap-4 mb-4 text-xs text-gray-500">
                <span>新增 {diffResult.stats.modulesAdded}</span>
                <span>删除 {diffResult.stats.modulesRemoved}</span>
                <span>修改 {diffResult.stats.modulesModified}</span>
                <span>字段 {diffResult.stats.fieldsChanged}</span>
              </div>
              {diffResult.diffs.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">两个版本内容相同</p>
              ) : (
                <div className="space-y-3">
                  {diffResult.diffs.map((d, i) => (
                    <div key={i} className="border border-gray-100 rounded-lg p-3 text-sm">
                      <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                        <span className="font-medium text-gray-600">{d.moduleType}</span><span>·</span><span>{d.field}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs mt-2">
                        <div className="bg-red-50 rounded p-2">
                          <div className="text-red-400 mb-0.5">旧版</div>
                          <div className="text-gray-700 whitespace-pre-wrap">{d.before}</div>
                        </div>
                        <div className="bg-green-50 rounded p-2">
                          <div className="text-green-500 mb-0.5">新版</div>
                          <div className="text-gray-700 whitespace-pre-wrap">{d.after}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default CenterPanel
