// ============================================================
// ShareViewPage — 分享简历 + 行级评论（响应式、移动端优化）
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, MessageSquare, Send, X, Eye, Menu } from 'lucide-react'
import { shareApi, type ShareResumeView, type ShareComment } from '@/api/resume'
import ClassicTemplate from '@/components/resume/preview/ClassicTemplate'
import { DEFAULT_RESUME_STYLE_SETTINGS, type Resume } from '@/types/resume'

/* === 常量 === */
const DESKTOP_GUTTER = 24
const DOT = 12
const MOBILE_BP = 768
const RESUME_W = 794

/* === helper === */
interface CommentTarget { moduleId: string; itemIndex: number; itemLabel: string }
interface Position { top: number; h: number }

function mkAnchor(mid: string, idx: number) { return `${mid}#${idx}` }

function extractTargets(modules: any[]): CommentTarget[] {
  const t: CommentTarget[] = []
  for (const mod of modules) {
    if (!mod.id || !mod.visible || mod.type === 'personal') continue
    const data = mod.data as any
    if (data?.items && Array.isArray(data.items)) {
      data.items.forEach((item: any, idx: number) => {
        t.push({ moduleId: mod.id, itemIndex: idx, itemLabel: item.company || item.companyName || item.school || item.schoolName || item.name || item.practice || item.practiceName || item.title || `#${idx}` })
      })
    } else if (mod.type === 'summary' || mod.type === 'skills') {
      // 无 items 数组的模块，作为一个整体目标
      t.push({ moduleId: mod.id, itemIndex: 0, itemLabel: mod.title || (mod.type === 'summary' ? '自我评价' : '专业技能') })
    }
  }
  return t
}

function measurePositions(el: HTMLElement, targets: CommentTarget[]): Map<string, Position> {
  const map = new Map<string, Position>()
  const cr = el.getBoundingClientRect()
  const byMod = new Map<string, CommentTarget[]>()
  for (const t of targets) {
    if (!byMod.has(t.moduleId)) byMod.set(t.moduleId, [])
    byMod.get(t.moduleId)!.push(t)
  }
  for (const [modId, items] of byMod) {
    const modEl = el.querySelector(`[data-module-id="${modId}"]`) as HTMLElement | null
    if (!modEl) continue
    const top = modEl.getBoundingClientRect().top - cr.top
    const h = modEl.getBoundingClientRect().height
    const per = h / Math.max(1, items.length)
    for (const t of items) {
      map.set(mkAnchor(t.moduleId, t.itemIndex), { top: top + per * t.itemIndex + per / 2, h: per })
    }
  }
  return map
}

/* === 评论指示圆点（PC 侧边栏使用） === */
const Dot: React.FC<{ count: number; active: boolean; size: number; onClick?: () => void }> =
  ({ count, active, size, onClick }) => {
    const inner = (
      <div className={`rounded-full flex items-center justify-center border-2 ${
        active ? 'bg-primary border-primary text-white scale-110 shadow-md' :
        count > 0 ? 'bg-amber-400 border-amber-400 text-white' :
        'border-gray-300 bg-white'
      }`} style={{ width: size, height: size }}>
        {count > 0 ? <span className="text-[0.55em] font-bold">{Math.min(count, 9)}</span> :
          <MessageSquare className="w-[55%] h-[55%] text-gray-300" />}
      </div>
    )
    return onClick ? <button onClick={onClick} className="flex-shrink-0 active:scale-95 transition-transform" style={{ minWidth: size, minHeight: size }}>{inner}</button> : <span className="flex-shrink-0">{inner}</span>
  }

/* === 项目行内评论图标按钮 === */
const ItemCommentIcon: React.FC<{
  count: number; active: boolean; onClick: () => void
}> = ({ count, active, onClick }) => (
  <button
    data-comment-icon
    onClick={(e) => { e.stopPropagation(); onClick() }}
    className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center border transition-all active:scale-95 ${
      active ? 'bg-primary border-primary text-white shadow-sm scale-110' :
      count > 0 ? 'bg-amber-400 border-amber-400 text-white' :
      'border-gray-300 bg-white hover:border-primary/50'
    }`}
    style={{ minWidth: 20, minHeight: 20 }}
  >
    {count > 0 ? (
      <span className="text-[9px] font-bold leading-none">{Math.min(count, 9)}</span>
    ) : (
      <MessageSquare className="w-3 h-3 text-gray-400" />
    )}
  </button>
)

/* === 桌面端评论输入 === */
const DesktopInput: React.FC<{ sending: boolean; onSubmit: (t: string, n: string) => void }> = ({ sending, onSubmit }) => {
  const [text, setText] = useState(''); const [name, setName] = useState('')
  const send = () => { if (text.trim() && !sending) { onSubmit(text, name || '匿名'); setText('') } }
  return (
    <div className="border-t border-gray-100 p-2.5">
      <input value={name} onChange={e => setName(e.target.value)} placeholder="你的名字"
        className="w-full mb-2 px-2 py-1 text-[11px] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary/30" />
      <div className="flex gap-1.5">
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} autoFocus
          placeholder="评论（Enter 发送）..." className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary/30" />
        <button onClick={send} disabled={sending || !text.trim()} className="p-1.5 rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-40"
          style={{ minWidth: 32, minHeight: 32 }}>
          {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
        </button>
      </div>
    </div>
  )
}

/* === 移动端内联评论面板 === */
const InlineCommentPanel: React.FC<{
  comments: ShareComment[]; onSubmit: (t: string, n: string) => void; sending: boolean
}> = ({ comments, onSubmit, sending }) => {
  const [text, setText] = useState('')
  const send = () => { if (text.trim() && !sending) { onSubmit(text, '匿名'); setText('') } }

  return (
    <div className="mt-2 ml-6 bg-gray-50 rounded-lg border border-gray-200 p-3" data-comment-panel>
      <div className="max-h-40 overflow-y-auto space-y-2 mb-3">
        {comments.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">暂无评论，写第一条</p>
        ) : (
          comments.map(c => (
            <div key={c.id} className="text-xs">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-medium text-gray-700">{c.authorName}</span>
                <span className="text-gray-400 text-[10px]">
                  {c.createdAt ? new Date(c.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
              <p className="text-gray-600 leading-relaxed">{c.content}</p>
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="添加评论..."
          autoFocus
          className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="px-3 py-1.5 rounded-md bg-primary text-white text-xs hover:bg-primary/90 disabled:opacity-40 flex items-center gap-1 flex-shrink-0 active:scale-95"
          style={{ minWidth: 44, minHeight: 32 }}
        >
          {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Send className="w-3 h-3" />发送</>}
        </button>
      </div>
    </div>
  )
}

/* ==================== 主组件 ==================== */
const ShareViewPage: React.FC = () => {
  const token = window.location.pathname.replace('/share/', '')
  const pcContentRef = useRef<HTMLDivElement>(null)
  const mobileContentRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ShareResumeView | null>(null)
  const [err, setErr] = useState('')
  const [comments, setComments] = useState<ShareComment[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [pos, setPos] = useState<Map<string, Position>>(new Map())
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BP)
  const [menuOpen, setMenuOpen] = useState(false)
  const contentRef = isMobile ? mobileContentRef : pcContentRef

  useEffect(() => { const c = () => setIsMobile(window.innerWidth < MOBILE_BP); window.addEventListener('resize', c); return () => window.removeEventListener('resize', c) }, [])
  useEffect(() => { if (!token) return; shareApi.view(token).then(r => { setData(r); setComments(r.comments || []) }).catch(() => setErr('分享链接无效或已过期')).finally(() => setLoading(false)) }, [token])

  // 移动端：点击评论面板外部收起
  useEffect(() => {
    if (!active || !isMobile) return
    const handler = (e: MouseEvent) => {
      const panel = (e.target as HTMLElement).closest('[data-comment-panel]')
      const icon = (e.target as HTMLElement).closest('[data-comment-icon]')
      if (!panel && !icon) setActive(null)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [active, isMobile])

  const targets = useMemo(() => data ? extractTargets(data.modules) : [], [data])

  useEffect(() => {
    const el = contentRef.current; if (!el || targets.length === 0) return
    const m = () => setPos(measurePositions(el, targets))
    m(); const ro = new ResizeObserver(m); ro.observe(el); return () => ro.disconnect()
  }, [targets, data])

  const grouped = useMemo(() => {
    const m = new Map<string, ShareComment[]>()
    for (const c of comments) { const k = mkAnchor(c.moduleId, c.itemIndex); m.set(k, [...(m.get(k) || []), c]) }
    return m
  }, [comments])

  const total = useMemo(() => { let n = 0; for (const v of grouped.values()) n += v.length; return n }, [grouped])

  const handleSubmit = useCallback(async (text: string, name: string) => {
    if (!active) return; setSending(true); const [mid, idx] = active.split('#')
    try { const c = await shareApi.addComment(token, text, name, mid, Number(idx)); setComments(p => [...p, c]) } catch { /* */ }
    setSending(false)
  }, [active, token])

  // 通用：渲染每个 item 左侧的评论图标
  const renderItemCommentIcon = useCallback((moduleId: string, itemIndex: number) => {
    const key = mkAnchor(moduleId, itemIndex)
    const cnt = (grouped.get(key) || []).length
    return (
      <ItemCommentIcon
        count={cnt}
        active={active === key}
        onClick={() => setActive(prev => prev === key ? null : key)}
      />
    )
  }, [grouped, active])

  // 移动端：渲染每个 item 下方的评论面板
  const renderItemCommentPanel = useCallback((moduleId: string, itemIndex: number) => {
    if (!isMobile) return null
    const key = mkAnchor(moduleId, itemIndex)
    if (active !== key) return null
    const itemComments = grouped.get(key) || []
    return <InlineCommentPanel comments={itemComments} onSubmit={handleSubmit} sending={sending} />
  }, [isMobile, active, grouped, handleSubmit, sending])

  if (loading) return <div className="flex items-center justify-center min-h-screen bg-gray-50"><Loader2 className="w-8 h-8 animate-spin text-gray-300" /></div>
  if (err || !data) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 text-gray-500 gap-3">
      <p className="text-sm">{err || '加载失败'}</p>
      <button onClick={() => window.location.reload()} className="px-4 py-2 text-xs bg-white border rounded-lg active:bg-gray-50" style={{ minWidth: 44, minHeight: 44 }}>重试</button>
    </div>
  )

  const resume = { id: '', title: data.title, locale: data.locale as any, themeColor: data.themeColor, modules: data.modules as any, styleSettings: DEFAULT_RESUME_STYLE_SETTINGS, template: 'classic' } as unknown as Resume
  const aComments = active ? (grouped.get(active) || []) : []
  const aTarget = targets.find(t => mkAnchor(t.moduleId, t.itemIndex) === active)
  const aPos = active ? pos.get(active) : null

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col share-page">
      {/* ======== PC Header ======== */}
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-2.5 flex items-center justify-between flex-shrink-0 hidden md:flex">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <h1 className="text-sm font-semibold truncate">{data.title}</h1>
          <span className="text-[10px] text-gray-400 flex items-center gap-1 flex-shrink-0"><Eye className="w-3 h-3" />{data.shareInfo.viewCount}</span>
        </div>
        <span className="text-[10px] text-gray-300">{total > 0 ? `${total} 条评论` : '点击图标评论'}</span>
      </header>

      {/* ======== Mobile Header (fixed) ======== */}
      <header className="md:hidden fixed top-0 inset-x-0 z-50 bg-white border-b border-gray-200 share-mobile-header">
        <div className="flex items-center justify-between px-4 py-2.5">
          <h1 className="text-sm font-semibold truncate max-w-[180px]">{data.title}</h1>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded-lg active:bg-gray-100"
            style={{ minWidth: 44, minHeight: 44 }}
            aria-label="菜单"
          >
            {menuOpen ? <X className="w-5 h-5 text-gray-600" /> : <Menu className="w-5 h-5 text-gray-600" />}
          </button>
        </div>
        {menuOpen && (
          <div className="px-4 py-3 border-t border-gray-100 bg-white shadow-sm space-y-2">
            <p className="text-xs text-gray-500 flex items-center gap-1.5">
              <Eye className="w-3 h-3" />{data.shareInfo.viewCount} 次浏览
            </p>
            <p className="text-xs text-gray-500 flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3" />{total} 条评论
            </p>
          </div>
        )}
      </header>

      {/* ======== PC Layout ======== */}
      <div className="hidden md:flex md:flex-1 justify-center py-8 px-4" ref={pcContentRef}>
        <div className="flex relative" style={{ width: RESUME_W + DESKTOP_GUTTER }}>
          {/* Gutter dots */}
          <div className="flex-shrink-0 relative" style={{ width: DESKTOP_GUTTER }}>
            {Array.from(pos.entries()).map(([k, v]) =>
              <div key={k} className="absolute" style={{ top: v.top, right: 4, transform: 'translateY(-50%)' }}>
                <Dot count={(grouped.get(k) || []).length} active={k === active} size={DOT} onClick={() => setActive(k === active ? null : k)} />
              </div>
            )}
          </div>
          <div style={{ width: RESUME_W }}>
            <ClassicTemplate
              resume={resume}
              renderItemCommentIcon={renderItemCommentIcon}
            />
          </div>
          {/* Floating card */}
          {active && aTarget && aPos && !isMobile && (
            <div className="absolute z-30" style={{ left: DESKTOP_GUTTER + RESUME_W + 24, top: aPos.top }}>
              <svg className="absolute -left-[20px] top-4 overflow-visible" width="20" height="2"><line x1="0" y1="1" x2="20" y2="1" className="stroke-primary/40" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
              <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-[280px]">
                <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-t-xl border-b border-gray-100">
                  <span className="text-[11px] font-medium truncate max-w-[180px]">{aTarget.itemLabel}</span>
                  <button onClick={() => setActive(null)} className="p-0.5 hover:bg-gray-200 rounded"><X className="w-3 h-3 text-gray-400" /></button>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {aComments.length === 0 ? <p className="text-[11px] text-gray-400 text-center py-6">暂无评论</p> :
                    aComments.map(c => (
                      <div key={c.id} className="px-3 py-2.5 border-b border-gray-50 last:border-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><span className="text-[9px] font-bold text-primary">{c.authorName.charAt(0).toUpperCase()}</span></div>
                          <span className="text-[11px] font-medium text-gray-700">{c.authorName}</span>
                          <span className="text-[10px] text-gray-400 ml-auto">{c.createdAt ? new Date(c.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                        </div>
                        <p className="text-xs text-gray-600 pl-7">{c.content}</p>
                      </div>
                    ))}
                </div>
                <DesktopInput onSubmit={handleSubmit} sending={sending} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ======== Mobile Layout ======== */}
      <div className="md:hidden flex-1 overflow-y-auto share-mobile-content" style={{ scrollBehavior: 'smooth', paddingTop: 56 }} ref={mobileContentRef}>
        <ClassicTemplate
          resume={resume}
          renderItemCommentIcon={renderItemCommentIcon}
          renderItemCommentPanel={renderItemCommentPanel}
          className="mobile-resume-template"
          overrideMinHeight="auto"
        />
      </div>
    </div>
  )
}

export default ShareViewPage
