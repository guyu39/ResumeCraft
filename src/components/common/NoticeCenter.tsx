import React from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'

export type NoticeTone = 'info' | 'success' | 'warning' | 'error'

export interface NoticeItem {
  id: string
  tone: NoticeTone
  title: string
  description?: string
  details?: string[]
  actionLabel?: string
  onAction?: () => void
  onClose?: () => void
}

interface NoticeCenterProps {
  title?: string
  items: NoticeItem[]
  compact?: boolean
  className?: string
}

const toneStyleMap: Record<NoticeTone, {
  wrapper: string
  icon: React.ReactNode
  iconWrap: string
  title: string
  description: string
  button: string
}> = {
  info: {
    wrapper: 'border-sky-200/80 bg-sky-50/80',
    icon: <Info className="h-4 w-4" />,
    iconWrap: 'bg-sky-100 text-sky-700',
    title: 'text-sky-900',
    description: 'text-sky-700/90',
    button: 'border-sky-200 text-sky-700 hover:bg-sky-100/80',
  },
  success: {
    wrapper: 'border-emerald-200/80 bg-emerald-50/80',
    icon: <CheckCircle2 className="h-4 w-4" />,
    iconWrap: 'bg-emerald-100 text-emerald-700',
    title: 'text-emerald-900',
    description: 'text-emerald-700/90',
    button: 'border-emerald-200 text-emerald-700 hover:bg-emerald-100/80',
  },
  warning: {
    wrapper: 'border-amber-200/80 bg-amber-50/85',
    icon: <AlertTriangle className="h-4 w-4" />,
    iconWrap: 'bg-amber-100 text-amber-700',
    title: 'text-amber-900',
    description: 'text-amber-700/90',
    button: 'border-amber-200 text-amber-700 hover:bg-amber-100/80',
  },
  error: {
    wrapper: 'border-rose-200/80 bg-rose-50/85',
    icon: <XCircle className="h-4 w-4" />,
    iconWrap: 'bg-rose-100 text-rose-700',
    title: 'text-rose-900',
    description: 'text-rose-700/90',
    button: 'border-rose-200 text-rose-700 hover:bg-rose-100/80',
  },
}

const NoticeCenter: React.FC<NoticeCenterProps> = ({
  title,
  items,
  compact = false,
  className = '',
}) => {
  if (items.length === 0) return null

  return (
    <section className={`${compact ? 'space-y-2' : 'space-y-3'} ${className}`}>
      {title && (
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{title}</p>
          <span className="rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 text-[10px] font-medium text-slate-500">
            {items.length}
          </span>
        </div>
      )}

      <div className={`grid gap-2 ${compact ? '' : 'md:grid-cols-2'}`}>
        {items.map((item) => {
          const toneStyle = toneStyleMap[item.tone]

          return (
            <article
              key={item.id}
              className={`rounded-${compact ? '[18px]' : '2xl'} border ${compact ? 'px-3 py-2.5' : 'px-4 py-3.5'} shadow-[0_8px_24px_rgba(15,23,42,0.05)] backdrop-blur ${toneStyle.wrapper}`}
            >
              <div className={`flex items-start ${compact ? 'gap-2.5' : 'gap-3'}`}>
                <div className={`mt-0.5 flex ${compact ? 'h-7 w-7 rounded-lg' : 'h-8 w-8 rounded-xl'} flex-shrink-0 items-center justify-center ${toneStyle.iconWrap}`}>
                  {toneStyle.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`${compact ? 'text-xs' : 'text-sm'} font-semibold ${toneStyle.title}`}>{item.title}</p>
                      {item.description && (
                        <p className={`mt-1 text-xs ${compact ? 'leading-4' : 'leading-5'} ${toneStyle.description}`}>{item.description}</p>
                      )}
                    </div>
                    {item.onClose && (
                      <button
                        type="button"
                        onClick={item.onClose}
                        className="rounded-lg px-1.5 py-1 text-[10px] text-slate-400 transition hover:bg-white/70 hover:text-slate-600"
                      >
                        关闭
                      </button>
                    )}
                  </div>

                  {item.details && item.details.length > 0 && (
                    <ul className={`mt-2 space-y-1 ${toneStyle.description}`}>
                      {item.details.map((detail, index) => (
                        <li key={`${item.id}-${index}`} className="text-xs leading-5">
                          {detail}
                        </li>
                      ))}
                    </ul>
                  )}

                  {item.onAction && item.actionLabel && (
                    <div className={`${compact ? 'mt-2' : 'mt-3'}`}>
                      <button
                        type="button"
                        onClick={item.onAction}
                        className={`rounded-xl border bg-white/75 ${compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'} font-medium transition ${toneStyle.button}`}
                      >
                        {item.actionLabel}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default NoticeCenter
