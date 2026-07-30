// ============================================================
// StyledSelect — 基于 Headless UI Listbox 的统一下拉选择器
// 替代原生 <select>，控制展开后面板的圆角、间距、hover 样式
// ============================================================

import React, { useState } from 'react'
import { Listbox, Transition } from '@headlessui/react'
import { ChevronDown, Check, Search } from 'lucide-react'

export interface SelectOption {
  label: string
  value: string
  disabled?: boolean
}

interface StyledSelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  /** 尺寸：默认 h-10 rounded-xl；compact = h-8 rounded-lg */
  size?: 'default' | 'compact'
  /** 额外追加到按钮上的 className（用于行内状态选择器的彩色 ring 等） */
  buttonClassName?: string
  /** 面板对齐方向，默认与按钮同宽 */
  className?: string
  /** 下拉展开方向：bottom（默认，向下）/ top（向上，避免被 overflow-hidden 容器裁切） */
  direction?: 'bottom' | 'top'
  /** 启用面板内搜索（适用于选项较多的场景，如行业 / 类型枚举） */
  searchable?: boolean
  /** 搜索框占位文案 */
  searchPlaceholder?: string
  /** 是否启用 Headless UI 的模态行为，默认启用 */
  modal?: boolean
}

const SIZE_BUTTON: Record<string, string> = {
  default: 'h-10 rounded-xl px-3 pr-9 text-sm',
  compact: 'h-8 rounded-lg px-2 pr-8 text-xs',
}

const SIZE_OPTION: Record<string, string> = {
  default: 'px-3 py-2 text-sm',
  compact: 'px-2.5 py-1.5 text-xs',
}

const StyledSelect: React.FC<StyledSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = '请选择',
  disabled = false,
  size = 'default',
  buttonClassName = '',
  className = '',
  direction = 'bottom',
  searchable = false,
  searchPlaceholder = '搜索...',
  modal = true,
}) => {
  const [query, setQuery] = useState('')
  const selected = options.find((o) => o.value === value) ?? null
  // 展开方向：bottom 向下（mt-1）；top 向上（bottom-full mb-1），用于靠近容器底部时避免被裁切
  const panelPosition = direction === 'top' ? 'bottom-full mb-1' : 'mt-1'

  const filtered = searchable && query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options

  return (
    <Listbox
      value={value}
      onChange={(v) => {
        onChange(v)
        setQuery('')
      }}
      disabled={disabled}
    >
      <div className={`relative ${className}`}>
        <Listbox.Button
          className={`relative w-full cursor-pointer border border-slate-200 bg-white text-left text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-50 ${SIZE_BUTTON[size]} ${buttonClassName}`}
        >
          <span className={`block truncate ${!selected ? 'text-slate-400' : ''}`}>
            {selected ? selected.label : placeholder}
          </span>
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5">
            <ChevronDown
              className="h-4 w-4 text-slate-400 transition-transform ui-open:rotate-180"
              aria-hidden="true"
            />
          </span>
        </Listbox.Button>
        <Transition
          as={React.Fragment}
          leave="transition ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Listbox.Options
            modal={modal}
            className={`absolute z-50 ${panelPosition} max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-xl shadow-slate-950/8 outline-none thin-scrollbar`}
          >
            {searchable && (
              <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-2 pb-1.5 pt-1.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder={searchPlaceholder}
                    className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-7 pr-2 text-xs text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                  />
                </div>
              </div>
            )}
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-center text-xs text-slate-400">无匹配项</div>
            ) : (
              filtered.map((opt) => (
                <Listbox.Option
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.disabled}
                  className={({ active, selected }) =>
                    `relative flex cursor-pointer items-center justify-between ${SIZE_OPTION[size]} ${
                      active ? 'bg-blue-50 text-blue-700' : 'text-slate-700'
                    } ${selected ? 'font-medium' : ''} ${opt.disabled ? 'cursor-not-allowed opacity-40' : ''}`
                  }
                >
                  {({ selected }) => (
                    <>
                      <span className="block truncate">{opt.label}</span>
                      {selected && <Check className="ml-2 h-3.5 w-3.5 flex-shrink-0 text-blue-600" />}
                    </>
                  )}
                </Listbox.Option>
              ))
            )}
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  )
}

export default StyledSelect
