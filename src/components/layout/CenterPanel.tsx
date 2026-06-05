// ============================================================
// CenterPanel — 中栏简历实时预览区
// ============================================================

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { useResumeStore } from '@/store/resumeStore'
import PagedResumePaper, { A4_HEIGHT_PX, A4_WIDTH_PX } from '@/components/resume/PagedResumePaper'
import SnapshotTimeline from '@/components/common/SnapshotTimeline'
import type { NoticeItem } from '@/components/common/NoticeCenter'
import { resumeApi, type SnapshotListItem, type DiffResult, type AdminCommentItem } from '@/api/resume'
import { AdminCommentProvider } from '@/contexts/AdminCommentContext'
import type { Resume } from '@/types/resume'

const FIT_PADDING_PX = 24
const FIT_BOOST_RATIO = 1.3
const MAX_PREVIEW_SCALE = 1.3
const MIN_READABLE_SCALE = 0.6 // 低于此阈值提示用户折叠侧栏

interface CenterPanelProps {
  workspaceNotices?: NoticeItem[]
}

/** 提取文本行（处理 HTML）：优先按 <li> 拆分，否则按换行 */
function extractLines(html: string): { lines: string[]; isList: boolean; wrapper: string[] } {
  const str = html || ''
  const ulMatch = str.match(/<ul[^>]*>([\s\S]*)<\/ul>/i) || str.match(/<ol[^>]*>([\s\S]*)<\/ol>/i)
  if (ulMatch) {
    const prefix = str.slice(0, str.indexOf(ulMatch[0]))
    const suffix = str.slice(str.indexOf(ulMatch[0]) + ulMatch[0].length)
    const items: string[] = []
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi
    let m: RegExpExecArray | null
    while ((m = liRegex.exec(ulMatch[1])) !== null) {
      items.push(m[0])
    }
    return { lines: items, isList: true, wrapper: [prefix, `<ul>`, `</ul>`, suffix] }
  }
  // 纯文本：按行拆分
  const textLines = str.split(/\n/).filter((l) => l.trim() !== '')
  return { lines: textLines.length > 0 ? textLines : [str], isList: false, wrapper: [str] }
}

/** 简单的文本标准化（用于比较去重） */
function norm(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

/** 生成 git 风格统一 diff HTML（+ 新增绿色，- 删除红色） */
function renderUnifiedDiffHtml(before: string, after: string): string {
  const a = extractLines(before)
  const b = extractLines(after)

  // 比较行并生成 diff
  const aNorm = a.lines.map(norm)
  const bNorm = b.lines.map(norm)
  const usedB = new Set<number>()
  const pairs: Array<{ type: '-' | '+' | '='; line: string }> = []

  // 匹配共同行
  const matchedA = new Set<number>()
  for (let i = 0; i < aNorm.length; i++) {
    for (let j = 0; j < bNorm.length; j++) {
      if (!usedB.has(j) && aNorm[i] === bNorm[j]) {
        matchedA.add(i)
        usedB.add(j)
        break
      }
    }
  }

  // 生成 diff：当前快照的行
  for (let i = 0; i < a.lines.length; i++) {
    if (matchedA.has(i)) {
      // 找到匹配的 B 行
      for (let j = 0; j < b.lines.length; j++) {
        if (aNorm[i] === bNorm[j]) {
          pairs.push({ type: '=', line: a.lines[i] })
          break
        }
      }
    } else {
      pairs.push({ type: '-', line: a.lines[i] })
    }
  }
  // 新增的行
  for (let j = 0; j < b.lines.length; j++) {
    if (!usedB.has(j)) {
      pairs.push({ type: '+', line: b.lines[j] })
    }
  }

  // 渲染为 HTML
  if (a.isList) {
    const diffParts = pairs.map((p) => {
      const color = p.type === '-' ? '#fecaca' : p.type === '+' ? '#bbf7d0' : 'transparent'
      const prefix = p.type === '-' ? '<span style="color:#dc2626;font-weight:bold;margin-right:4px">−</span>' :
        p.type === '+' ? '<span style="color:#16a34a;font-weight:bold;margin-right:4px">+</span>' : ''
      return `<li style="background:${color};padding:1px 4px;border-radius:2px;margin:1px 0">${prefix}${p.line.replace(/<\/?li[^>]*>/gi, '')}</li>`
    })
    return a.wrapper[0] + a.wrapper[1] + diffParts.join('') + a.wrapper[2] + (a.wrapper[3] || '')
  }

  // 纯文本 diff
  return pairs
    .map((p) => {
      const color = p.type === '-' ? 'background:#fecaca;' : p.type === '+' ? 'background:#bbf7d0;' : ''
      const prefix = p.type === '-' ? '<b style="color:#dc2626">− </b>' : p.type === '+' ? '<b style="color:#16a34a">+ </b>' : '  '
      return `<div style="${color}padding:1px 4px;border-radius:2px;margin:1px 0;font-family:monospace;white-space:pre-wrap">${prefix}${escapeHtml(p.line)}</div>`
    })
    .join('')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const CenterPanel: React.FC<CenterPanelProps> = ({ workspaceNotices = [] }) => {
  const { resume, initResume, setActiveModule, setActiveSnapshotId, setBasedOnSnapshotId, activeSnapshotId, basedOnSnapshotId, snapshotVersion, isDirty, setSnapshots: setStoreSnapshots } = useResumeStore()
  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
  const [snapshots, setSnapshots] = useState<SnapshotListItem[]>([])
  const [, setSnapshotsLoaded] = useState(false)
  const [adminComments, setAdminComments] = useState<AdminCommentItem[]>([])
  const [, setAdminCommentsLoading] = useState(false)
  const isServerResume = resume?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resume.id)

  const displayResume = resume

  // 当前活跃快照的标签名（仅在有快照数据时显示）
  const activeSnapshotLabel = activeSnapshotId && snapshots.length > 0
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
  const headerNotices = useMemo(() => {
    const list = [...workspaceNotices]
    if (list.length === 0 && finalScale < MIN_READABLE_SCALE) {
      list.push({
        id: 'preview-scale-warning',
        tone: 'warning' as const,
        title: `预览区偏窄（${Math.round(finalScale * 100)}%）`,
        description: '建议折叠一侧边栏',
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
      // 注意：不调用 markClean()！
      // isDirty 跟踪的是"相对于云端的修改"，保存到 localStorage 草稿不等于同步到云端
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
  }, [resume, initResume, setActiveSnapshotId, setBasedOnSnapshotId, activeSnapshotId, isDirty])

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

      // 无论 currentValid 是否为 true，都尝试加载本地草稿（刷新后云数据可能过期）
      const draftKey = `resumecraft_snapshot_draft_${targetId}`
      try {
        const raw = localStorage.getItem(draftKey)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed.modules) {
            const current = useResumeStore.getState()
            current.initResume({
              ...current.resume,
              modules: parsed.modules as Resume['modules'],
              themeColor: (parsed.themeColor as Resume['themeColor']) ?? current.resume.themeColor,
              styleSettings: (parsed.styleSettings as Resume['styleSettings']) ?? current.resume.styleSettings,
            })
          }
        }
      } catch { /* ignore */ }
    }
  }, [activeSnapshotId, basedOnSnapshotId, setActiveSnapshotId, setBasedOnSnapshotId, setStoreSnapshots])

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
        <div className="text-xs text-gray-500">
          实际 {Math.round(finalScale * 100)}% · A4 纸张
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
      {diffResult && (() => {
        const labelA = activeSnapshotId === diffResult.snapshotA.id
          ? (diffResult.snapshotA.label || `v${diffResult.snapshotA.versionNo}`)
          : (diffResult.snapshotB.label || `v${diffResult.snapshotB.versionNo}`)
        const labelB = activeSnapshotId === diffResult.snapshotA.id
          ? (diffResult.snapshotB.label || `v${diffResult.snapshotB.versionNo}`)
          : (diffResult.snapshotA.label || `v${diffResult.snapshotA.versionNo}`)
        return createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30" onClick={() => setDiffResult(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-[640px] max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-xl">
                <h3 className="text-base font-semibold text-gray-800">
                  对比：「<span className="text-green-600">{labelA}</span>」vs 「<span className="text-red-600">{labelB}</span>」
                </h3>
                <button className="text-gray-400 hover:text-gray-600 text-lg" onClick={() => setDiffResult(null)}>✕</button>
              </div>
              <div className="px-6 py-4">
                <div className="flex gap-4 mb-3 text-xs text-gray-500">
                  <span style={{ color: '#dc2626' }}>− 删除 {diffResult.stats.modulesRemoved}</span>
                  <span style={{ color: '#16a34a' }}>+ 新增 {diffResult.stats.modulesAdded}</span>
                  <span>修改 {diffResult.stats.modulesModified}</span>
                  <span>字段 {diffResult.stats.fieldsChanged}</span>
                </div>

                {diffResult.diffs.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">两个版本内容相同</p>
                ) : (
                  <div className="space-y-3">
                    {diffResult.diffs.map((d, i) => {
                      // before = 对比快照（旧），after = 当前快照（新）→ + 绿底 = 当前新增
                      const before = activeSnapshotId === diffResult.snapshotA.id ? String(d.after ?? '') : String(d.before ?? '')
                      const after = activeSnapshotId === diffResult.snapshotA.id ? String(d.before ?? '') : String(d.after ?? '')
                      return (
                        <div key={i} className="border border-gray-100 rounded-lg p-3 text-sm">
                          <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                            <span className="font-medium text-gray-600">{d.moduleType}</span><span>·</span><span>{d.field}</span>
                          </div>
                          <div className="diff-content text-xs" dangerouslySetInnerHTML={{ __html: renderUnifiedDiffHtml(before, after) }} />
                        </div>
                      )
                    })}
                  </div>
                )}
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
