// ============================================================
// ShareModal — 简历分享弹窗（优化样式版本）
// ============================================================

import React, { useEffect, useState } from "react"
import { X, Link2, Copy, Trash2, Loader2, Check, Clock, Globe, CalendarDays, Infinity, Eye } from "lucide-react"
import { shareApi, type ShareLink } from "@/api/resume"

interface ShareModalProps {
  resumeId: string
  snapshotId?: string
  snapshotLabel?: string
  open: boolean
  onClose: () => void
}

interface ExpiryOption {
  label: string
  value: number
  icon: React.ReactNode
}

const EXPIRY_OPTIONS: ExpiryOption[] = [
  { label: "永不过期", value: 0, icon: <Infinity className="w-3.5 h-3.5" /> },
  { label: "7 天", value: 7, icon: <Clock className="w-3.5 h-3.5" /> },
  { label: "30 天", value: 30, icon: <CalendarDays className="w-3.5 h-3.5" /> },
  { label: "90 天", value: 90, icon: <CalendarDays className="w-3.5 h-3.5" /> },
]

const ShareModal: React.FC<ShareModalProps> = ({ resumeId, snapshotId, snapshotLabel, open, onClose }) => {
  const [links, setLinks] = useState<ShareLink[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [expiry, setExpiry] = useState(7)
  const [copied, setCopied] = useState<string | null>(null)

  const loadLinks = React.useCallback(async () => {
    setLoading(true)
    try { const res = await shareApi.list(resumeId); setLinks(res.items || []) } catch { /* ignore */ }
    setLoading(false)
  }, [resumeId])

  useEffect(() => {
    if (open) loadLinks()
  }, [open, resumeId, loadLinks])

  const handleCreate = async () => {
    setCreating(true)
    try {
      await shareApi.create(resumeId, expiry, snapshotId)
      await loadLinks()
    } catch { /* ignore */ }
    setCreating(false)
  }

  const handleDeactivate = async (shareId: string) => {
    try { await shareApi.deactivate(resumeId, shareId); await loadLinks() } catch { /* ignore */ }
  }

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url)
    setCopied(url)
    setTimeout(() => setCopied(null), 2000)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Link2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800">分享简历</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {snapshotId ? `基于快照「${snapshotLabel || snapshotId.slice(0, 8) + '...'}」创建分享` : '生成链接，分享给他人查看'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Expiry selection */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-2.5 block">有效期</label>
            <div className="grid grid-cols-4 gap-1.5">
              {EXPIRY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setExpiry(opt.value)}
                  className={`flex flex-col items-center justify-center gap-1 py-2.5 px-1 rounded-xl border text-xs font-medium transition-all ${
                    expiry === opt.value
                      ? "border-primary bg-primary/5 text-primary shadow-sm"
                      : "border-gray-100 text-gray-500 hover:border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <span className={expiry === opt.value ? "text-primary" : "text-gray-400"}>{opt.icon}</span>
                  <span className="text-[10px]">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={handleCreate}
            disabled={creating}
            className="w-full h-10 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-sm shadow-primary/20"
          >
            {creating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> 生成中...</>
            ) : (
              <><Link2 className="w-4 h-4" /> 生成分享链接</>
            )}
          </button>

          {/* Active links */}
          {loading ? (
            <div className="flex justify-center py-5"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
          ) : links.filter(l => l.isActive).length === 0 ? (
            <div className="flex flex-col items-center py-5 text-gray-400">
              <Globe className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">暂无有效分享链接</p>
              <p className="text-[10px] mt-1 opacity-60">点击上方按钮生成新链接</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto no-scrollbar -mx-1 px-1">
              {links.filter(l => l.isActive).map(link => (
                <div key={link.id} className="group flex items-center gap-2.5 p-3 rounded-xl bg-gray-50/70 border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-all">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <a
                        href={link.shareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-primary font-medium truncate hover:underline"
                      >
                        {link.shareUrl || `...${link.token.slice(0, 14)}`}
                      </a>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{link.viewCount}</span>
                      {link.expiresAt && (
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(link.expiresAt).toLocaleDateString("zh-CN")}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleCopy(link.shareUrl || "")}
                      className="p-2 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                      title="复制链接"
                    >
                      {copied === link.shareUrl ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => handleDeactivate(link.id)}
                      className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                      title="停用"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ShareModal

