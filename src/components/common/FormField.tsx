// ============================================================
// FormField — 通用表单项封装
// 遵循 PRD 4.4 表单组件通用规范
// ============================================================

import React, { useRef, useState } from 'react'
import { getAutoFixEnabled, inspectClipboardText } from '@/utils/textGuard'

interface FormFieldProps {
  label: string
  required?: boolean
  error?: boolean | string
  hint?: string
  children: React.ReactNode
  className?: string
}

const FormField: React.FC<FormFieldProps> = ({
  label,
  required = false,
  error,
  hint,
  children,
  className = '',
}) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Label */}
      <label className="block text-[13px] font-medium text-gray-700 leading-none">
        {label}
        {required ? <span className="text-red-500 ml-0.5">*</span> : null}
      </label>

      {/* 输入控件 */}
      {children}

      {/* 错误提示：支持 boolean 或 string */}
      {typeof error === 'string' && error ? (
        <p className="text-[12px] text-red-500 flex items-center gap-1">
          <span>⚠</span> {error}
        </p>
      ) : error === true ? (
        <p className="text-[12px] text-red-500 flex items-center gap-1">
          <span>⚠</span> 请检查此字段
        </p>
      ) : null}

      {/* 辅助提示：仅在无错误时显示 */}
      {!error && hint ? (
        <p className="text-[12px] text-gray-400">{hint}</p>
      ) : null}
    </div>
  )
}

// ---------- TextInput ----------
interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string
  onChange: (value: string) => void
  error?: boolean
}

export const TextInput: React.FC<TextInputProps> = ({
  value,
  onChange,
  error = false,
  className = '',
  onPaste,
  ...props
}) => {
  const [clipboardHint, setClipboardHint] = useState<string | null>(null)
  const hintTimerRef = useRef<number | null>(null)

  const showClipboardHint = (message: string | null) => {
    if (hintTimerRef.current) {
      window.clearTimeout(hintTimerRef.current)
      hintTimerRef.current = null
    }
    setClipboardHint(message)
    if (message) {
      hintTimerRef.current = window.setTimeout(() => setClipboardHint(null), 1000)
    }
  }
  return (
    <div className="space-y-1">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(event) => {
          const text = event.clipboardData?.getData('text') ?? ''
          const result = inspectClipboardText(text, getAutoFixEnabled())
          showClipboardHint(result.message)

          if (result.nextText !== text) {
            event.preventDefault()
            const target = event.currentTarget
            const start = target.selectionStart ?? target.value.length
            const end = target.selectionEnd ?? target.value.length
            const nextValue = value.slice(0, start) + result.nextText + value.slice(end)
            onChange(nextValue)
            const caret = start + result.nextText.length
            requestAnimationFrame(() => target.setSelectionRange(caret, caret))
          }

          onPaste?.(event)
        }}
        className={`
          w-full h-9 px-3 text-sm text-gray-800
          border rounded-md bg-white
          outline-none transition-all duration-150
          placeholder:text-gray-300
          ${error
            ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100'
            : 'border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10'
          }
          ${className}
        `}
        {...props}
      />
      {clipboardHint && (
        <p className="text-[12px] text-amber-600">{clipboardHint}</p>
      )}
    </div>
  )
}

// ---------- TextArea ----------
interface TextAreaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  value: string
  onChange: (value: string) => void
  error?: boolean
  minRows?: number
}

export const TextArea: React.FC<TextAreaProps> = ({
  value,
  onChange,
  error = false,
  minRows = 3,
  className = '',
  onPaste,
  ...props
}) => {
  const [clipboardHint, setClipboardHint] = useState<string | null>(null)
  const hintTimerRef = useRef<number | null>(null)

  const showClipboardHint = (message: string | null) => {
    if (hintTimerRef.current) {
      window.clearTimeout(hintTimerRef.current)
      hintTimerRef.current = null
    }
    setClipboardHint(message)
    if (message) {
      hintTimerRef.current = window.setTimeout(() => setClipboardHint(null), 1000)
    }
  }
  return (
    <div className="space-y-1">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(event) => {
          const text = event.clipboardData?.getData('text') ?? ''
          const result = inspectClipboardText(text, getAutoFixEnabled())
          showClipboardHint(result.message)

          if (result.nextText !== text) {
            event.preventDefault()
            const target = event.currentTarget
            const start = target.selectionStart ?? target.value.length
            const end = target.selectionEnd ?? target.value.length
            const nextValue = value.slice(0, start) + result.nextText + value.slice(end)
            onChange(nextValue)
            const caret = start + result.nextText.length
            requestAnimationFrame(() => target.setSelectionRange(caret, caret))
          }

          onPaste?.(event)
        }}
        rows={minRows}
        className={`
          w-full px-3 py-2 text-sm text-gray-800
          border rounded-md bg-white resize-y
          outline-none transition-all duration-150
          placeholder:text-gray-300
          ${error
            ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100'
            : 'border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10'
          }
          ${className}
        `}
        {...props}
      />
      {clipboardHint && (
        <p className="text-[12px] text-amber-600">{clipboardHint}</p>
      )}
    </div>
  )
}

// ---------- Select ----------
interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  value: string
  onChange: (value: string) => void
  options: { label: string; value: string }[]
  error?: boolean
}

export const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  options,
  error = false,
  className = '',
  ...props
}) => {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`
        w-full h-9 px-3 text-sm text-gray-800
        border rounded-md bg-white
        outline-none transition-all duration-150
        ${error
          ? 'border-red-400 focus:border-red-500'
          : 'border-gray-200 focus:border-primary'
        }
        ${className}
      `}
      {...props}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

// ---------- Button ----------
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
  children: React.ReactNode
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  ...props
}) => {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed'

  const variantClass = {
    primary: 'bg-primary text-white hover:bg-primary/90 focus:ring-primary',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-300',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 focus:ring-red-200',
    ghost: 'bg-transparent text-gray-500 hover:bg-gray-100 focus:ring-gray-200',
  }[variant]

  const sizeClass =
    size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-2 text-sm h-9'

  return (
    <button
      className={`${base} ${variantClass} ${sizeClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export { FormField }
export default FormField
