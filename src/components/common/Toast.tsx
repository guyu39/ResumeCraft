import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, XCircle, X } from 'lucide-react'

export type ToastTone = 'success' | 'error'

interface ToastItem {
  id: string
  message: string
  tone: ToastTone
}

let addToastFn: ((msg: string, tone: ToastTone) => void) | null = null

export function toast(message: string, tone: ToastTone = 'error') {
  addToastFn?.(message, tone)
}

const ToastContainer: React.FC = () => {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    addToastFn = (msg: string, tone: ToastTone) => {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
      setItems((prev) => [...prev, { id, message: msg, tone }])
      setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== id))
      }, 3000)
    }
    return () => { addToastFn = null }
  }, [])

  if (items.length === 0) return null

  return createPortal(
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {items.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm animate-slide-in ${
            item.tone === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {item.tone === 'success' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{item.message}</span>
          <button
            onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
            className="ml-1 flex-shrink-0 hover:opacity-70"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>,
    document.body
  )
}

export default ToastContainer
