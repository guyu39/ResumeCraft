// ============================================================
// ShareViewPage — 分享页（PC 评论侧边栏 + 移动端内联）
// ============================================================
// 变更记录：
// 2026-06-05 PC 端评论改为右侧边栏；移动端保持原有内联逻辑

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, MessageSquare, Send, X, Eye, Menu, Trash2 } from 'lucide-react'
import { shareApi, type ShareComment, type ShareResumeView } from '@/api/resume'
import { getVisitorId } from '@/utils/visitor'
import { DEFAULT_RESUME_STYLE_SETTINGS, type Resume } from '@/types/resume'
import ClassicTemplate from '@/components/resume/preview/ClassicTemplate'

/* === 常量 === */
const RESUME_W = 794
const PC_BREAKPOINT = 1200

/* === 工具 === */
const mkAnchor = (moduleId: string, itemIndex: number) => `${moduleId}#${itemIndex}`

/* ============ PC 端评论侧边面板 ============ */
interface CommentSidebarProps {
  comments: ShareComment[]
  onClose: () => void
  onSubmit: (text: string, name: string) => void
  sending: boolean
  onDeleteComment?: (commentId: string) => void
}

const CommentSidebar: React.FC<CommentSidebarProps> = ({
  comments, onClose, onSubmit, sending, onDeleteComment,
}) => {
  const [text, setText] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const send = () => {
    if (text.trim() && !sending) { onSubmit(text, '匿名'); setText('') }
  }

  const handleDelete = async (commentId: string) => {
    if (!onDeleteComment) return
    setDeletingId(commentId)
    try { await onDeleteComment(commentId) } catch { /* ignore */ }
    setDeletingId(null)
  }

  return (
    <div className="w-[320px] flex-shrink-0 bg-white rounded-2xl border border-gray-200 shadow-lg flex flex-col overflow-hidden sticky top-8" style={{ maxHeight: 'calc(100vh - 64px)' }}>
      {/* 标题栏 */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800">{comments.length} 条评论</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 评论列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {comments.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">暂无评论，写第一条</p>
        ) : (
          comments.map(c => (
            <div key={c.id} className="group">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-medium text-gray-700">{c.authorName}</span>
                <span className="text-[10px] text-gray-400">
                  {c.createdAt ? new Date(c.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
                {onDeleteComment && (
                  <button
                    onClick={() => handleDelete(c.id)}
                    disabled={deletingId === c.id}
                    className="ml-auto p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"
                    title="删除评论"
                  >
                    {deletingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">{c.content}</p>
            </div>
          ))
        )}
      </div>

      {/* 底部输入区 */}
      <div className="flex-shrink-0 border-t border-gray-100 px-4 py-3 bg-gray-50/50">
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="输入评论..."
            maxLength={500}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 placeholder:text-gray-300"
          />
          <button
            onClick={send}
            disabled={!text.trim() || sending}
            className="flex items-center justify-center w-[52px] h-[38px] rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ============ 移动端内联评论面板 ============ */
const InlineCommentPanel: React.FC<{
  comments: ShareComment[]; onSubmit: (t: string, n: string) => void; sending: boolean
  onDeleteComment?: (commentId: string) => void
}> = ({ comments, onSubmit, sending, onDeleteComment }) => {
  const [text, setText] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const send = () => { if (text.trim() && !sending) { onSubmit(text, '匿名'); setText('') } }

  const handleDelete = async (commentId: string) => {
    if (!onDeleteComment) return
    setDeletingId(commentId)
    try { await onDeleteComment(commentId) } catch { /* ignore */ }
    setDeletingId(null)
  }

  return (
    <div className="mt-2 ml-6 bg-gray-50 rounded-lg border border-gray-200 p-3" data-comment-panel>
      <div className="max-h-40 overflow-y-auto space-y-2 mb-3">
        {comments.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">暂无评论，写第一条</p>
        ) : (
          comments.map(c => (
            <div key={c.id} className="text-xs group">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-medium text-gray-700">{c.authorName}</span>
                <span className="text-gray-400 text-[10px]">
                  {c.createdAt ? new Date(c.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
                {onDeleteComment && (
                  <button
                    onClick={() => handleDelete(c.id)}
                    disabled={deletingId === c.id}
                    className="ml-auto p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"
                    title="删除评论"
                  >
                    {deletingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  </button>
                )}
              </div>
              <p className="text-gray-600 leading-relaxed">{c.content}</p>
            </div>
          ))
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="输入评论..."
          maxLength={500}
          className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-primary/30 placeholder:text-gray-300"
        />
        <button
          onClick={send}
          disabled={!text.trim() || sending}
          className="flex-shrink-0 p-1.5 rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-40 transition-colors"
        >
          {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
        </button>
      </div>
    </div>
  )
}

const ShareViewPage: React.FC = () => {
  const token = useMemo(() => window.location.pathname.split('/share/')[1]?.split('/')[0] || '', [])
  const visitorId = useMemo(() => getVisitorId(token), [token])
  const [data, setData] = useState<ShareResumeView | null>(null)
  const [comments, setComments] = useState<ShareComment[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [active, setActive] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isPC, setIsPC] = useState(window.innerWidth >= PC_BREAKPOINT)
  const mobileContentRef = useRef<HTMLDivElement>(null)

  // 响应式检测
  useEffect(() => {
    const onResize = () => setIsPC(window.innerWidth >= PC_BREAKPOINT)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 按模块+条目聚合
  const grouped = useMemo(() => {
    const map = new Map<string, ShareComment[]>()
    for (const c of comments) {
      const key = mkAnchor(c.moduleId || '', c.itemIndex || 0)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(c)
    }
    return map
  }, [comments])

  const total = comments.length

  // 加载简历数据 + 评论
  useEffect(() => {
    if (!token) return
    shareApi.view(token).then(viewRes => {
      setData(viewRes)
      return shareApi.listComments(token, visitorId, viewRes.latestSnapshotId || undefined)
    }).then(commentsRes => {
      setComments(commentsRes.items || [])
    }).catch(() => {
      if (!data) setErr('分享链接无效或已过期')
    }).finally(() => setLoading(false))
  }, [token, visitorId])

  const handleSubmit = useCallback(async (text: string, name: string) => {
    if (!active) return; setSending(true); const [mid, idx] = active.split('#')
    try { const c = await shareApi.addComment(token, text, name, mid, Number(idx), visitorId, data?.latestSnapshotId || undefined); setComments(p => [...p, c]) } catch { /* */ }
    setSending(false)
  }, [active, token, visitorId, data?.latestSnapshotId])

  const handleDeleteComment = useCallback(async (commentId: string) => {
    try { await shareApi.deleteComment(token, commentId); setComments(p => p.filter(c => c.id !== commentId)) } catch { /* ignore */ }
  }, [token])

  // 渲染每个 item 左侧的评论图标（始终显示，count=0 时显示灰色图标）
  const renderItemCommentIcon = useCallback((moduleId: string, itemIndex: number) => {
    const key = mkAnchor(moduleId, itemIndex)
    const count = (grouped.get(key) || []).length
    const isActive = active === key
    return (
      <button data-no-export
        onClick={(e) => {
          e.stopPropagation()
          setActive(prev => prev === key ? null : key)
        }}
        className={`flex items-center justify-center rounded-full border transition-colors cursor-pointer ${isActive
            ? 'bg-amber-200 border-amber-300 text-amber-800'
            : count > 0
              ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
              : 'border-gray-200 bg-white text-gray-400 hover:border-primary/40 hover:text-primary'
          }`}
        style={{ minWidth: 22, height: 22, fontSize: '10px', fontWeight: 600, lineHeight: 1, padding: '0 5px' }}
        title={count > 0 ? `${count} 条评论` : '添加评论'}
      >
        {count > 0 ? count : <MessageSquare className="w-3 h-3" />}
      </button>
    )
  }, [grouped, active])

  // 渲染每个 item 下方的评论面板
  const renderItemCommentPanel = useCallback((moduleId: string, itemIndex: number) => {
    if (isPC) return null // PC 端用模态弹窗
    const key = mkAnchor(moduleId, itemIndex)
    if (active !== key) return null
    const itemComments = grouped.get(key) || []
    return <InlineCommentPanel comments={itemComments} onSubmit={handleSubmit} sending={sending} onDeleteComment={handleDeleteComment} />
  }, [isPC, active, grouped, handleSubmit, sending, handleDeleteComment])

  // PC 端侧边面板数据
  const sidebarTarget = useMemo(() => {
    if (!isPC || !active) return null
    const itemComments = grouped.get(active) || []
    return { comments: itemComments }
  }, [isPC, active, grouped])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (err || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 px-4">
        <p className="text-base text-gray-500">{err || '加载失败'}</p>
        <a href="/" className="text-sm text-primary hover:underline">返回首页</a>
      </div>
    )
  }

  const resume = { id: '', title: data.title, locale: data.locale as any, themeColor: data.themeColor, modules: data.modules as any, styleSettings: DEFAULT_RESUME_STYLE_SETTINGS, template: 'classic' } as unknown as Resume

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* ======== PC Header ======== */}
      <header className="hidden md:flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-sm font-semibold truncate max-w-[300px]">{data.title}</h1>
          <span className="text-[10px] text-gray-400 flex items-center gap-1 flex-shrink-0"><Eye className="w-3 h-3" />{data.shareInfo?.viewCount || 0}</span>
          {data.latestSnapshotId && (
            <span className="text-[10px] text-gray-400 px-1.5 py-0.5 rounded bg-gray-100">{data.latestSnapshotId.slice(0, 8)}</span>
          )}
        </div>
        <span className="text-[10px] text-gray-300">{total > 0 ? `${total} 条评论` : '点击图标评论'}</span>
      </header>

      {/* ======== Mobile Header (fixed) ======== */}
      <header className="md:hidden fixed top-0 inset-x-0 z-50 bg-white border-b border-gray-200 share-mobile-header">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-sm font-semibold truncate max-w-[140px]">{data.title}</h1>
            {data.latestSnapshotId && (
              <span className="text-[10px] text-gray-400 px-1.5 py-0.5 rounded bg-gray-100 flex-shrink-0">{data.latestSnapshotId.slice(0, 8)}</span>
            )}
          </div>
          <button onClick={() => setMenuOpen(!menuOpen)} className="p-1.5">
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        {menuOpen && (
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
            <span className="text-[10px] text-gray-400"><Eye className="w-3 h-3 inline mr-1" />{data.shareInfo?.viewCount || 0}</span>
            <span className="text-[10px] text-gray-400">{total > 0 ? `${total} 条评论` : '点击图标评论'}</span>
          </div>
        )}
        <span
          className="absolute inset-x-0 -bottom-4 h-4 bg-gradient-to-b from-white/80 to-transparent pointer-events-none share-mobile-header-fade"
          aria-hidden
        />
      </header>

      {/* ======== PC Layout: 简历 + 评论侧边栏 ======== */}
      <div className="hidden md:flex md:flex-1 justify-center py-8 px-4 gap-6 items-start">
        <div style={{ width: RESUME_W }} className="flex-shrink-0">
          <ClassicTemplate
            resume={resume}
            renderItemCommentIcon={renderItemCommentIcon}
            renderItemCommentPanel={renderItemCommentPanel}
          />
        </div>
        {sidebarTarget && (
          <CommentSidebar
            comments={sidebarTarget.comments}
            onClose={() => setActive(null)}
            onSubmit={handleSubmit}
            sending={sending}
            onDeleteComment={handleDeleteComment}
          />
        )}
      </div>

      {/* ======== Mobile Layout ======== */}
      <div className="md:hidden flex-1 pt-[48px]" ref={mobileContentRef}>
        <div className="p-2">
          <ClassicTemplate
            resume={resume}
            renderItemCommentIcon={renderItemCommentIcon}
            renderItemCommentPanel={renderItemCommentPanel}
          />
        </div>
      </div>
    </div>
  )
}

export default ShareViewPage
