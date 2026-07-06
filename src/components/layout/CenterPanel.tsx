// ============================================================
// CenterPanel — 中栏简历实时预览区
// ============================================================

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, X, XCircle, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { useResumeStore } from '@/store/resumeStore'
import PagedResumePaper, { A4_WIDTH_PX } from '@/components/resume/PagedResumePaper'
import SnapshotTimeline from '@/components/common/SnapshotTimeline'
import type { NoticeItem } from '@/components/common/NoticeCenter'
import { resumeApi, type SnapshotListItem, type DiffResult, type AdminCommentItem } from '@/api/resume'
import { AdminCommentProvider } from '@/contexts/AdminCommentContext'
import DiffView from '@/components/common/DiffView'
import type { Resume } from '@/types/resume'

const FIT_PADDING_PX = 24
const MIN_SCALE = 0.3
const MAX_SCALE = 1.5
const SCALE_STEP = 0.1
const MIN_READABLE_SCALE = 0.5 // 低于此阈值提示用户收窄侧栏

interface CenterPanelProps {
  workspaceNotices?: NoticeItem[]
}

const CenterPanel: React.FC<CenterPanelProps> = ({ workspaceNotices = [] }) => {
  const { resume, initResume, setActiveModule, setActiveSnapshotId, setBasedOnSnapshotId, activeSnapshotId, basedOnSnapshotId, snapshotVersion, syncStatus, setSnapshots: setStoreSnapshots } = useResumeStore()
  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
  const [snapshots, setSnapshots] = useState<SnapshotListItem[]>([])
  const [, setSnapshotsLoaded] = useState(false)
  const [adminComments, setAdminComments] = useState<AdminCommentItem[]>([])
  const [, setAdminCommentsLoading] = useState(false)
  // 手动缩放：null 表示跟随容器宽度自动铺满
  const [manualScale, setManualScale] = useState<number | null>(null)
  const isServerResume = resume?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resume.id)

  const displayResume = resume

  // 当前活跃快照的标签名（仅在有快照数据时显示）
  const activeSnapshotLabel = activeSnapshotId && snapshots.length > 0
    ? snapshots.find((s) => s.id === activeSnapshotId)?.label || snapshots.find((s) => s.id === activeSnapshotId)?.snapshotType
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

  // 按容器宽度铺满（不限制高度，纵向可滚动；不超过 MAX_SCALE）
  const autoFitScale = useMemo(() => {
    const { width } = viewportSize
    if (!width) return 1
    const fitWidth = (width - FIT_PADDING_PX * 2) / A4_WIDTH_PX
    return Math.max(MIN_SCALE, Math.min(fitWidth, MAX_SCALE))
  }, [viewportSize])

  const finalScale = manualScale ?? autoFitScale

  const handleZoomOut = useCallback(() => {
    setManualScale((prev) => {
      const cur = prev ?? autoFitScale
      return Math.max(MIN_SCALE, Math.round((cur - SCALE_STEP) * 100) / 100)
    })
  }, [autoFitScale])

  const handleZoomIn = useCallback(() => {
    setManualScale((prev) => {
      const cur = prev ?? autoFitScale
      return Math.min(MAX_SCALE, Math.round((cur + SCALE_STEP) * 100) / 100)
    })
  }, [autoFitScale])

  const handleFitWidth = useCallback(() => setManualScale(null), [])

  const headerNotices = useMemo(() => {
    const list = [...workspaceNotices]
    if (list.length === 0 && finalScale < MIN_READABLE_SCALE) {
      list.push({
        id: 'preview-scale-warning',
        tone: 'warning' as const,
        title: `预览区偏窄（${Math.round(finalScale * 100)}%）`,
        description: '建议收窄一侧边栏',
      })
    }
    return list
  }, [workspaceNotices, finalScale])

  // 预览区点击 → 跳转到对应模块编辑
  const handlePreviewClick = useCallback((e: React.MouseEvent) => {
    // 从点击目标向上查找最近的 data-module-id 元素
    let target = e.target as HTMLElement | null
    while (target && target !== e.currentTarget) {
      const moduleId = target.getAttribute('data-module-id')
      if (moduleId) {
        setActiveModule(moduleId)
        return
      }
      target = target.parentElement
    }
  }, [setActiveModule])

  // 加载管理员评论数据
  useEffect(() => {
    if (!isServerResume || !resume.id) return
    let cancelled = false
    setAdminCommentsLoading(true)
    resumeApi.getComments(resume.id)
      .then((res) => {
        if (!cancelled) setAdminComments(res.items || [])
      })
      .catch((err) => {
        console.error('[CenterPanel] 加载评论失败:', err)
      })
      .finally(() => {
        if (!cancelled) setAdminCommentsLoading(false)
      })
    return () => { cancelled = true }
  }, [isServerResume, resume.id])

  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!resume.id) return
    try {
      await resumeApi.deleteComment(resume.id, commentId)
      setAdminComments(prev => prev.filter(c => c.id !== commentId))
    } catch (err) {
      console.error('[CenterPanel] 删除评论失败:', err)
    }
  }, [resume.id])

  // 点击节点 → 切换快照。快照是不可变时间点，但支持每个快照独立的本地草稿：
  // - 切走时：将当前编辑保存到快照专属 localStorage key，而非云DB
  // - 切入时：优先加载快照专属本地草稿（如果存在），跳过云端 API
  const handleSelectSnapshot = useCallback(async (snapshot: SnapshotListItem) => {
    if (snapshot.id === activeSnapshotId) return

    // ① 离开当前快照：对应当前编辑的快照专属固化到 localStorage
    // syncStatus !== 'idle' 而非 'dirty'：avatar 上传后 flushToCloud 将状态变为
    // cloud_synced，但快照 content_snapshot 仍是旧数据，必须保存草稿防止丢失
    if (syncStatus !== 'idle' && activeSnapshotId) {
      const draftKey = `resumecraft_snapshot_draft_${activeSnapshotId}`
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          modules: resume.modules,
          themeColor: resume.themeColor,
          styleSettings: resume.styleSettings,
          savedAt: Date.now(),
        }))
      } catch { /* ignore */ }
      // 注意：不调用 setSyncStatus('cloud_synced')！
      // syncStatus 跟踪的是"相对于云端的修改"，保存到 localStorage 草稿不等于同步到云端
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
  }, [resume, initResume, setActiveSnapshotId, setBasedOnSnapshotId, activeSnapshotId, syncStatus])

  // 对比：tooltip 点击「对比」触发
  const handleCompareSnapshot = useCallback(async (snapshotId: string) => {
    if (!activeSnapshotId || activeSnapshotId === snapshotId) return
    try {
      // 加载对比快照的本地草稿（如果有修改但未落库）
      let comparisonModules: unknown[] | undefined
      const comparisonDraftKey = `resumecraft_snapshot_draft_${snapshotId}`
      try {
        const raw = localStorage.getItem(comparisonDraftKey)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed.modules) {
            comparisonModules = parsed.modules
          }
        }
      } catch { /* ignore */ }
      // 将当前模块（含草稿）和对比快照模块（含草稿，如有）都传给后端
      const result = await resumeApi.diffSnapshots(
        resume.id, activeSnapshotId, snapshotId,
        resume.modules as unknown[],
        comparisonModules,
      )
      setDiffResult(result)
    } catch { /* ignore */ }
  }, [resume.id, resume.modules, activeSnapshotId])

  // 首次加载快照列表（用于显示标签名 + 自动选中最新快照）
  const handleSnapshotsLoaded = useCallback((items: SnapshotListItem[]) => {
    setSnapshots(items)
    setSnapshotsLoaded(true)
    // 同步到全局 store，供 AI 面板查找快照标签
    setStoreSnapshots(items.map((s) => ({ id: s.id, label: s.label, snapshotType: s.snapshotType })))
    if (items.length > 0) {
      const currentValid = activeSnapshotId && items.some((s) => s.id === activeSnapshotId)

      // 确定目标快照 ID
      let targetId: string
      if (currentValid) {
        targetId = activeSnapshotId!
      } else {
        const preferredId = basedOnSnapshotId || activeSnapshotId
        const preferredValid = preferredId && items.some((s) => s.id === preferredId)
        targetId = preferredValid ? preferredId! : items[0].id
        setActiveSnapshotId(targetId)
        setBasedOnSnapshotId(targetId)
      }

      // 加载本地草稿（仅在草稿比云端数据新时使用，避免旧草稿覆盖云端更新）
      const draftKey = `resumecraft_snapshot_draft_${targetId}`
      try {
        const raw = localStorage.getItem(draftKey)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed.modules) {
            const current = useResumeStore.getState()
            // 比较草稿保存时间和云端更新时间：草稿更新时才覆盖
            const cloudUpdatedAt = current.resume.updatedAt ?? 0
            const draftSavedAt = (parsed.savedAt as number) ?? 0
            if (draftSavedAt > cloudUpdatedAt) {
              current.initResume({
                ...current.resume,
                modules: parsed.modules as Resume['modules'],
                themeColor: (parsed.themeColor as Resume['themeColor']) ?? current.resume.themeColor,
                styleSettings: (parsed.styleSettings as Resume['styleSettings']) ?? current.resume.styleSettings,
              })
            }
          }
        }
      } catch { /* ignore */ }
    }
  }, [activeSnapshotId, basedOnSnapshotId, setActiveSnapshotId, setBasedOnSnapshotId, setStoreSnapshots])

  return (
    <div className="flex flex-col h-full relative">
      {/* 顶部工具栏 */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-surface border-b border-line">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-muted">简历预览</h2>
          {activeSnapshotLabel && (
            <span className="text-xs text-primary bg-brand-soft px-2 py-0.5 rounded">{activeSnapshotLabel}</span>
          )}
        </div>
        {headerNotices.length > 0 && (
          <div className="mx-4 min-w-0 flex-1 flex justify-center gap-2 flex-wrap">
            {headerNotices.map((n) => (
              <div key={n.id} className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                n.tone === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : n.tone === 'error'
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : n.tone === 'warning'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-sky-200 bg-sky-50 text-sky-700'
              }`}>
                <span className="flex-shrink-0">
                  {n.tone === 'success' ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                    n.tone === 'error' ? <XCircle className="h-3.5 w-3.5" /> :
                      n.tone === 'warning' ? <AlertTriangle className="h-3.5 w-3.5" /> :
                        <Info className="h-3.5 w-3.5" />}
                </span>
                <span className="truncate">{n.title}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={finalScale <= MIN_SCALE + 0.001}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line bg-surface text-muted hover:bg-slate-50 hover:text-ink transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            title="缩小"
            aria-label="缩小"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="min-w-[3rem] text-center text-xs tabular-nums text-muted">
            {Math.round(finalScale * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={finalScale >= MAX_SCALE - 0.001}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line bg-surface text-muted hover:bg-slate-50 hover:text-ink transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            title="放大"
            aria-label="放大"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleFitWidth}
            className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs transition-colors ${
              manualScale === null
                ? 'border-primary/30 bg-brand-soft text-primary'
                : 'border-line bg-surface text-muted hover:bg-slate-50 hover:text-ink'
            }`}
            title="适应宽度"
            aria-label="适应宽度"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 简历画布区域 */}
      <div ref={viewportRef} className="flex-1 overflow-auto no-scrollbar flex items-start justify-center pt-8 pb-12 px-8 cursor-pointer" onClick={handlePreviewClick}>
        <div className="flex-shrink-0"
          style={{ width: `${A4_WIDTH_PX * finalScale}px` }}>
          <div
            style={{ width: `${A4_WIDTH_PX}px`, transform: `scale(${finalScale})`, transformOrigin: 'top left' }}
          >
            <AdminCommentProvider comments={adminComments} onDeleteComment={handleDeleteComment}>
              <PagedResumePaper resume={displayResume} />
            </AdminCommentProvider>
          </div>
        </div>
      </div>

      {/* 版本快照时间轴（浮动胶囊，悬浮于预览区底部中央） */}
      {isServerResume && (
        <SnapshotTimeline
          key={snapshotVersion}
          resumeId={resume.id}
          activeSnapshotId={activeSnapshotId}
          onSelectSnapshot={handleSelectSnapshot}
          onCompareSnapshot={handleCompareSnapshot}
          onSnapshotsLoaded={handleSnapshotsLoaded}
        />
      )}

      {/* 差异对比弹窗 */}
      {diffResult && (() => {
        const labelA = activeSnapshotId === diffResult.snapshotA.id
          ? (diffResult.snapshotA.label || diffResult.snapshotA.id.slice(0, 8))
          : (diffResult.snapshotB.label || diffResult.snapshotB.id.slice(0, 8))
        const labelB = activeSnapshotId === diffResult.snapshotA.id
          ? (diffResult.snapshotB.label || diffResult.snapshotB.id.slice(0, 8))
          : (diffResult.snapshotA.label || diffResult.snapshotA.id.slice(0, 8))
        return createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30" onClick={() => setDiffResult(null)}>
            <div className="bg-surface rounded-2xl shadow-lg border border-line w-[640px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-line">
                <h3 className="text-base font-medium text-ink">
                  对比：<span className="text-green-600">{labelA}</span> vs <span className="text-red-600">{labelB}</span>
                </h3>
                <button
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  onClick={() => setDiffResult(null)}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-4">
                {/* Stats */}
                <div className="flex gap-4 mb-4 text-xs text-gray-500">
                  <span className="text-red-600 font-medium">− 删除 {diffResult.stats.modulesRemoved}</span>
                  <span className="text-green-600 font-medium">+ 新增 {diffResult.stats.modulesAdded}</span>
                  <span className="font-medium">修改 {diffResult.stats.modulesModified}</span>
                  <span className="text-gray-400">字段 {diffResult.stats.fieldsChanged}</span>
                </div>

                {(() => {
                  // 按当前激活快照决定 before/after 方向，预定向后交给 DiffView 渲染
                  const directed = diffResult.diffs.map((d) => {
                    const flip = activeSnapshotId === diffResult.snapshotA.id
                    return {
                      ...d,
                      before: flip ? String(d.after ?? '') : String(d.before ?? ''),
                      after: flip ? String(d.before ?? '') : String(d.after ?? ''),
                    }
                  })
                  return <DiffView diffs={directed} emptyHint="两个版本内容相同" />
                })()}
              </div>
            </div>
          </div>,
          document.body
        )
      })()}
    </div>
  )
}

export default CenterPanel
