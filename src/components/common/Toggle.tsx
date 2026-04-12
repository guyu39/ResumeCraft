// ============================================================
// Toggle — 显示/隐藏开关
// ============================================================

import React from 'react'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  size?: 'sm' | 'md'
  disabled?: boolean
}

const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  size = 'sm',
  disabled = false,
}) => {
  const sizeClass = size === 'sm' ? 'w-8 h-4' : 'w-10 h-5'
  const thumbClass = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`
        relative inline-flex items-center rounded-full transition-colors duration-200
        focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-1
        ${sizeClass}
        ${checked ? 'bg-primary' : 'bg-gray-300'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span
        className={`
          inline-block rounded-full bg-white shadow-sm transform transition-transform duration-200
          ${thumbClass}
          ${checked ? 'translate-x-4' : 'translate-x-1'}
        `}
      />
    </button>
  )
}

export default Toggle
