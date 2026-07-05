// ============================================================
// StyledSelect — 基于 Headless UI Listbox 的统一下拉选择器
// 替代原生 <select>，控制展开后面板的圆角、间距、hover 样式
// ============================================================

import React from 'react'
import { Listbox, Transition } from '@headlessui/react'
import { ChevronDown, Check } from 'lucide-react'

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
}) => {
  const selected = options.find((o) => o.value === value) ?? null

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
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
          <Listbox.Options className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-xl shadow-slate-950/8 outline-none thin-scrollbar">
            {options.map((opt) => (
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
            ))}
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  )
}

export default StyledSelect
