// ============================================================
// CenterPanel — 中栏简历实时预览区
// ============================================================

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useResumeStore } from '@/store/resumeStore'
import PagedResumePaper, { A4_HEIGHT_PX, A4_WIDTH_PX } from '@/components/resume/PagedResumePaper'

const FIT_PADDING_PX = 24
const FIT_BOOST_RATIO = 1.15
const MAX_PREVIEW_SCALE = 1.25

const CenterPanel: React.FC = () => {
  const { resume } = useResumeStore()
  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [contentHeight, setContentHeight] = useState(A4_HEIGHT_PX)

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return

    const updateSize = () => {
      setViewportSize({
        width: element.clientWidth,
        height: element.clientHeight,
      })
    }

    updateSize()

    const observer = new ResizeObserver(updateSize)
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  const autoFitScale = useMemo(() => {
    const { width } = viewportSize
    if (!width) return 1

    const fitWidth = (width - FIT_PADDING_PX * 2) / A4_WIDTH_PX
    return Math.max(0.2, Math.min(fitWidth, 1))
  }, [viewportSize])

  const finalScale = Math.min(autoFitScale * FIT_BOOST_RATIO, MAX_PREVIEW_SCALE)

  return (
    <div className="flex flex-col h-full">
      {/* 顶部工具栏 */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200">
        <h2 className="text-sm font-medium text-gray-600">简历预览</h2>
        <div className="text-xs text-gray-500">
          实际 {Math.round(finalScale * 100)}% · A4 纸张 210mm × 297mm
        </div>
      </div>

      {/* 简历画布区域 */}
      <div ref={viewportRef} className="flex-1 overflow-auto no-scrollbar flex items-start justify-center pt-8 pb-12 px-8">
        {/* 缩放占位容器：保持布局按缩放后的宽高滚动 */}
        <div
          className="flex-shrink-0"
          style={{
            width: `${A4_WIDTH_PX * finalScale}px`,
            minHeight: `${Math.max(A4_HEIGHT_PX, contentHeight) * finalScale}px`,
          }}
        >
          <div
            style={{
              width: `${A4_WIDTH_PX}px`,
              transform: `scale(${finalScale})`,
              transformOrigin: 'top left',
            }}
            ref={(node) => {
              if (!node) return
              const update = () => setContentHeight(node.scrollHeight)
              update()
            }}
          >
            <PagedResumePaper resume={resume} />
          </div>
        </div>
      </div>

      {/* 底部信息栏 */}
      <div className="flex-shrink-0 text-center py-2 text-xs text-amber-600">
        如遇内容被切割，可通过增加换行、或前往「设置」调整间距解决
      </div>
    </div>
  )
}

export default CenterPanel
