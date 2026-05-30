// ============================================================
// CenterPanel — 中栏简历实时预览区
// ============================================================

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useResumeStore } from '@/store/resumeStore'
import PagedResumePaper, { A4_HEIGHT_PX, A4_WIDTH_PX } from '@/components/resume/PagedResumePaper'
import SnapshotTimeline from '@/components/common/SnapshotTimeline'
import { resumeApi, type SnapshotListItem } from '@/api/resume'
import type { Resume } from '@/types/resume'

const FIT_PADDING_PX = 24
const FIT_BOOST_RATIO = 1.3
const MAX_PREVIEW_SCALE = 1.3

const CenterPanel: React.FC = () => {
  const { resume, previewResume, setPreviewResume, clearPreviewResume, setActiveSnapshotId, snapshotVersion } = useResumeStore()
  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [contentHeight, setContentHeight] = useState(A4_HEIGHT_PX)
  const isServerResume = resume?.id && resume.id.includes('-')

  const displayResume = previewResume ?? resume

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

  const handleSelectSnapshot = useCallback(async (snapshot: SnapshotListItem) => {
    try {
      const { content } = await resumeApi.getSnapshotDetail(resume.id, snapshot.id)
      const c = content as { modules?: unknown[]; themeColor?: string; styleSettings?: unknown }
      if (c && c.modules) {
        const preview: Resume = {
          ...resume,
          modules: c.modules as Resume['modules'],
          themeColor: (c.themeColor as Resume['themeColor']) ?? resume.themeColor,
          styleSettings: (c.styleSettings as Resume['styleSettings']) ?? resume.styleSettings,
        }
        setPreviewResume(preview)
        setActiveSnapshotId(snapshot.id)
      }
    } catch { /* ignore */ }
  }, [resume, setPreviewResume, setActiveSnapshotId])

  return (
    <div className="flex flex-col h-full">
      {/* 顶部工具栏 */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-gray-600">简历预览</h2>
          {previewResume && (
            <div className="flex items-center gap-2 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded text-xs">
              <span className="text-blue-600">📸 快照预览</span>
              <button className="text-blue-500 hover:text-blue-700 font-medium" onClick={clearPreviewResume}>
                回到当前
              </button>
            </div>
          )}
        </div>
        {/* 切割提示（移至顶部） */}
      <div className="flex-shrink-0 text-center py-1.5 text-xs text-amber-600 bg-amber-50/40">
        如遇内容被切割，可通过增加换行、或前往「设置」调整间距解决
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
            ref={(node) => { if (!node) return; const update = () => setContentHeight(node.scrollHeight); update() }}
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
            onSelectSnapshot={handleSelectSnapshot}
          />
        </div>
      )}
    </div>
  )
}

export default CenterPanel
