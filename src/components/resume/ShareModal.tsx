// ============================================================
// ShareModal — 简历分享弹窗
// ============================================================

import React, { useEffect, useState } from 'react'
import { X, Link2, Copy, Trash2, Loader2, Check } from 'lucide-react'
import { shareApi, type ShareLink } from '@/api/resume'

interface Props {
  resumeId: string
  open: boolean
  onClose: () => void
}

const EXPIRY_OPTIONS = [
  { label: '永不过期', value: 0 },
  { label: '7 天', value: 7 },
  { label: '30 天', value: 30 },
  { label: '90 天', value: 90 },
]

const ShareModal: React.FC<Props> = ({ resumeId, open, onClose }) => {
  const [links, setLinks] = useState<ShareLink[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [expiry, setExpiry] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)

  const loadLinks = async () => {
    setLoading(true)
    try {
      const res = await shareApi.list(resumeId)
      setLinks(res.items || [])
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => {
    if (open) loadLinks()
  }, [open, resumeId])

  const handleCreate = async () => {
    setCreating(true)
    try {
      await shareApi.create(resumeId, expiry)
      await loadLinks()
    } catch { /* ignore */ }
    setCreating(false)
  }

  const handleDeactivate = async (shareId: string) => {
    await shareApi.deactivate(resumeId, shareId)
    await loadLinks()
  }

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url)
    setCopied(url)
    setTimeout(() => setCopied(null), 2000)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" />分享简历
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4 text-gray-400" /></button>
        </div>

        {/* 创建新链接 */}
        <div className="flex items-center gap-2 mb-5">
          <select
            value={expiry}
            onChange={e => setExpiry(Number(e.target.value))}
            className="h-9 rounded-lg border border-gray-200 px-2.5 text-xs text-gray-700 bg-white"
          >
            {EXPIRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="h-9 px-4 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
          >
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            生成分享链接
          </button>
        </div>

        {/* 已有链接列表 */}
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
        ) : links.filter(l => l.isActive).length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">暂无有效分享链接</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto no-scrollbar">
            {links.filter(l => l.isActive).map(link => (
              <div key={link.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                <div className="flex-1 min-w-0">
                  <a
                    href={link.shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 truncate block hover:underline"
                  >
                    {link.shareUrl || `...${link.token.slice(0, 12)}`}
                  </a>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                    <span>{link.viewCount} 次浏览</span>
                    {link.expiresAt && <span>· {new Date(link.expiresAt).toLocaleDateString('zh-CN')} 到期</span>}
                  </div>
                </div>
                <button
                  onClick={() => handleCopy(link.shareUrl || '')}
                  className="p-1.5 rounded-md hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                  title="复制链接"
                >
                  {copied === link.shareUrl ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => handleDeactivate(link.id)}
                  className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500"
                  title="停用"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ShareModal
