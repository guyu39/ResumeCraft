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
  const { resume, initResume, setActiveSnapshotId, setBasedOnSnapshotId, activeSnapshotId, basedOnSnapshotId, snapshotVersion, isDirty, markClean, setSnapshots: setStoreSnapshots } = useResumeStore()
  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [contentHeight, setContentHeight] = useState(A4_HEIGHT_PX)
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
  const [snapshots, setSnapshots] = useState<SnapshotListItem[]>([])
  const [snapshotsLoaded, setSnapshotsLoaded] = useState(false)
  const isServerResume = resume?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resume.id)

  const displayResume = resume

  // 当前活跃快照的标签名
  const activeSnapshotLabel = activeSnapshotId
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

  // 点击节点 → 切换快照。快照是不可变时间点，但支持每个快照独立的本地草稿：
  // - 切走时：将当前编辑保存到快照专属 localStorage key，而非云DB
  // - 切入时：优先加载快照专属本地草稿（如果存在），跳过云端 API
  const handleSelectSnapshot = useCallback(async (snapshot: SnapshotListItem) => {
    if (snapshot.id === activeSnapshotId) return

    // ① 离开当前快照：对应当前编辑的快照专属固化到 localStorage
    if (isDirty && activeSnapshotId) {
      const draftKey = `resumecraft_snapshot_draft_${activeSnapshotId}`
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          modules: resume.modules,
          themeColor: resume.themeColor,
          styleSettings: resume.styleSettings,
          savedAt: Date.now(),
        }))
      } catch { /* ignore */ }
      markClean()
    }

    // ② 进入目标快照：优先加载快照专属本地草稿
    const targetDraftKey = `resumecraft_snapshot_draft_${snapshot.id}`
    const targetDraft = (() => { try { return localStorage.getItem(targetDraftKey) } catch { return null } })()

    if (targetDraft) {
      const parsed = JSON.parse(targetDraft)
      if (parsed.modules) {
        initResume({
          ...resume,
          modules: parsed.modules as Resume['modules'],
          themeColor: (parsed.themeColor as Resume['themeColor']) ?? resume.themeColor,
          styleSettings: (parsed.styleSettings as Resume['styleSettings']) ?? resume.styleSettings,
        })
        setActiveSnapshotId(snapshot.id)
        setBasedOnSnapshotId(snapshot.id)
        return
      }
    }

    // ③ 无本地草稿：从云端加载快照原始内容
    try {
      const { content } = await resumeApi.getSnapshotDetail(resume.id, snapshot.id)
      const c = content as { modules?: unknown[]; themeColor?: string; styleSettings?: unknown }
      if (c && c.modules) {
        initResume({
          ...resume,
          modules: c.modules as Resume['modules'],
          themeColor: (c.themeColor as Resume['themeColor']) ?? resume.themeColor,
          styleSettings: (c.styleSettings as Resume['styleSettings']) ?? resume.styleSettings,
        })
        setActiveSnapshotId(snapshot.id)
        setBasedOnSnapshotId(snapshot.id)
      }
    } catch { /* ignore */ }
  }, [resume, initResume, setActiveSnapshotId, setBasedOnSnapshotId, activeSnapshotId, isDirty, markClean])

  // 对比：tooltip 点击「对比」触发
  const handleCompareSnapshot = useCallback(async (snapshotId: string) => {
    if (!activeSnapshotId || activeSnapshotId === snapshotId) return
    try {
      const result = await resumeApi.diffSnapshots(resume.id, activeSnapshotId, snapshotId)
      setDiffResult(result)
    } catch { /* ignore */ }
  }, [resume.id, activeSnapshotId])

  // 首次加载快照列表（用于显示标签名 + 自动选中最新快照）
  const handleSnapshotsLoaded = useCallback((items: SnapshotListItem[]) => {
    setSnapshots(items)
    setSnapshotsLoaded(true)
    // 同步到全局 store，供 AI 面板查找快照标签
    setStoreSnapshots(items.map((s) => ({ id: s.id, label: s.label, snapshotType: s.snapshotType })))
    if (items.length > 0) {
      const currentValid = activeSnapshotId && items.some((s) => s.id === activeSnapshotId)
      if (!currentValid) {
        // 优先使用 basedOnSnapshotId（重入时从云端恢复的上次编辑快照）
        const preferredId = basedOnSnapshotId || activeSnapshotId
        const preferredValid = preferredId && items.some((s) => s.id === preferredId)
        const targetId = preferredValid ? preferredId! : items[0].id
        setActiveSnapshotId(targetId)
        setBasedOnSnapshotId(targetId)

        // 重入时：尝试加载目标快照的本地草稿（从云端恢复或浏览器遗留）
        const draftKey = `resumecraft_snapshot_draft_${targetId}`
        try {
          const raw = localStorage.getItem(draftKey)
          if (raw) {
            const parsed = JSON.parse(raw)
            if (parsed.modules) {
              initResume({
                ...resume,
                modules: parsed.modules as Resume['modules'],
                themeColor: (parsed.themeColor as Resume['themeColor']) ?? resume.themeColor,
                styleSettings: (parsed.styleSettings as Resume['styleSettings']) ?? resume.styleSettings,
              })
            }
          }
        } catch { /* ignore */ }
      }
    }
  }, [activeSnapshotId, basedOnSnapshotId, setActiveSnapshotId, setBasedOnSnapshotId, setStoreSnapshots, resume, initResume])

  return (
    <div className="flex flex-col h-full">
      {/* 顶部工具栏 */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-gray-600">简历预览</h2>
          {activeSnapshotLabel && (
            <span className="text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded">{activeSnapshotLabel}</span>
          )}
        </div>
        {/* 切割提示 */}
        <div className="flex-shrink-0 text-center py-1.5 text-xs text-amber-600 border-b border-amber-100 bg-amber-50/40 rounded-md">        如遇内容被切割，可通过增加换行、或前往「设置」调整间距解决
        </div>
        <div className="text-xs text-gray-500">
          实际 {Math.round(finalScale * 100)}% · A4 纸张
        </div>
      </div>

      {/* 无快照提示：显示在工具栏下而非时间线内 */}
      {isServerResume && snapshotsLoaded && snapshots.length === 0 && (
        <div className="flex-shrink-0 text-center py-1.5 text-xs text-gray-400 bg-gray-50 border-b border-gray-100">
          点击右上角「新建版本」记录当前版本
        </div>
      )}

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
