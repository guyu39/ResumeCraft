import React, { useState, useRef, useEffect } from 'react'
import { Download, FileText, FileJson, File, ChevronDown } from 'lucide-react'
import type { ExportFormat } from '@/api/types'

interface ExportMenuItem {
  format: ExportFormat
  label: string
  icon: React.ReactNode
  description: string
}

const EXPORT_ITEMS: ExportMenuItem[] = [
  {
    format: 'pdf',
    label: 'PDF',
    icon: <FileText className="w-3.5 h-3.5" />,
    description: ""
  },
  {
    format: 'markdown',
    label: 'Markdown',
    icon: <File className="w-3.5 h-3.5" />,
    description: ""
  },
  {
    format: 'json',
    label: 'JSON',
    icon: <FileJson className="w-3.5 h-3.5"/>,
    description: ""
  },
]

interface ExportMenuProps {
  exporting: boolean
  disabled?: boolean
  onExport: (format: ExportFormat) => void
}

const ExportMenu: React.FC<ExportMenuProps> = ({ exporting, disabled, onExport }) => {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleSelect = (format: ExportFormat) => {
    setOpen(false)
    onExport(format)
  }

  return (
    <div className="relative" ref={menuRef}>
      <div className="flex">
        <button
          onClick={() => handleSelect('pdf')}
          disabled={exporting || disabled}
          title={disabled ? '请先修正日期范围错误' : exporting ? '导出中...' : '导出 PDF'}
          className={`flex-shrink-0 px-2 py-2 rounded-l-xl transition-colors ${disabled
            ? 'cursor-not-allowed bg-slate-300 text-slate-500'
            : 'bg-primary text-white shadow-[0_10px_20px_rgba(37,99,235,0.24)] hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60'
            }`}
        >
          <Download className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setOpen(!open)}
          disabled={exporting || disabled}
          className={`flex-shrink-0 px-1 py-2 rounded-r-xl border-l border-white/20 transition-colors ${disabled
            ? 'cursor-not-allowed bg-slate-300 text-slate-500'
            : 'bg-primary text-white shadow-[0_10px_20px_rgba(37,99,235,0.24)] hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60'
            }`}
        >
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-50">
          {EXPORT_ITEMS.map((item) => (
            <button
              key={item.format}
              onClick={() => handleSelect(item.format)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span className="text-gray-400">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
              <span className="text-[11px] text-gray-400 ml-auto">{item.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default ExportMenu
