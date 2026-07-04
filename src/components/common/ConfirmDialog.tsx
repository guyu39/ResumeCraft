// ============================================================
// ConfirmDialog — 通用二次确认弹窗（全局单例，替代 window.confirm）
// ============================================================

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'

interface ConfirmRequest {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  resolve: (confirmed: boolean) => void
}

let showFn: ((req: ConfirmRequest) => void) | null = null

export interface ConfirmOptions {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

// 供调用方触发确认弹窗，返回用户是否确认（未挂载时返回 false）。
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!showFn) {
      resolve(false)
      return
    }
    showFn({ ...options, resolve })
  })
}

const ConfirmDialog: React.FC = () => {
  const [req, setReq] = useState<ConfirmRequest | null>(null)

  useEffect(() => {
    showFn = (r: ConfirmRequest) => setReq(r)
    return () => { showFn = null }
  }, [])

  if (!req) return null

  const choose = (confirmed: boolean) => {
    req.resolve(confirmed)
    setReq(null)
  }

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/35" onClick={() => choose(false)} />
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl">
        <div className="flex items-start gap-2.5 p-5 pb-4">
          <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${req.danger ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-base font-semibold text-gray-800">{req.title}</h4>
            {req.description && <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{req.description}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/60 p-4">
          <button
            type="button"
            onClick={() => choose(false)}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-100"
          >
            {req.cancelText || '取消'}
          </button>
          <button
            type="button"
            onClick={() => choose(true)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-lg transition ${req.danger ? 'bg-red-600 shadow-red-600/20 hover:bg-red-700' : 'bg-blue-600 shadow-blue-600/20 hover:bg-blue-700'}`}
          >
            {req.confirmText || '确认'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ConfirmDialog
