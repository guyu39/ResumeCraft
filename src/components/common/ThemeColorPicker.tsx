// ============================================================
// ThemeColorPicker — 主题色选择器
// 6 套预设主题色
// ============================================================

import React from 'react'
import { THEME_COLORS, ThemeColorKey, ThemeColorPresetValue, ThemeColorValue } from '@/types/resume'

interface ThemeColorPickerProps {
  value: ThemeColorValue
  onChange: (color: ThemeColorValue) => void
}

const COLOR_LIST = Object.entries(THEME_COLORS) as [ThemeColorKey, ThemeColorPresetValue][]

const HEX_COLOR_REG = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

const normalizeHex = (input: string) => {
  const trimmed = input.trim()
  if (!trimmed) return ''
  const prefixed = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  return prefixed.toUpperCase()
}

const ThemeColorPicker: React.FC<ThemeColorPickerProps> = ({ value, onChange }) => {
  const isPresetColor = COLOR_LIST.some(([, color]) => color === value)
  const [mode, setMode] = React.useState<'preset' | 'custom'>(isPresetColor ? 'preset' : 'custom')
  const [customInput, setCustomInput] = React.useState(value)

  React.useEffect(() => {
    setCustomInput(value)
  }, [value])

  const commitCustomColor = () => {
    const next = normalizeHex(customInput)
    if (HEX_COLOR_REG.test(next)) {
      onChange(next)
      setCustomInput(next)
      return
    }
    setCustomInput(value)
  }

  return (
    <div className="space-y-2">
      <label className="block text-[13px] font-medium text-gray-700">主题色（{value}）</label>

      <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-white">
        <button
          type="button"
          onClick={() => setMode('preset')}
          className={`px-2.5 py-1 text-xs rounded-md transition-colors ${mode === 'preset' ? 'bg-primary/10 text-primary' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          预设
        </button>
        <button
          type="button"
          onClick={() => setMode('custom')}
          className={`px-2.5 py-1 text-xs rounded-md transition-colors ${mode === 'custom' ? 'bg-primary/10 text-primary' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          自定义
        </button>
      </div>

      {mode === 'preset' ? (
        <div className="flex flex-wrap items-center gap-2">
          {COLOR_LIST.map(([name, color]) => {
            const isActive = value === color
            return (
              <button
                key={color}
                type="button"
                title={name}
                onClick={() => onChange(color)}
                className={`
                  w-7 h-7 rounded-full transition-all duration-150 flex items-center justify-center
                  ${isActive ? 'ring-2 ring-offset-2' : 'hover:scale-110'}
                `}
                style={{
                  backgroundColor: color,
                }}
              >
                {isActive && (
                  <span className="text-white text-xs font-bold">✓</span>
                )}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={HEX_COLOR_REG.test(normalizeHex(value)) ? normalizeHex(value) : '#1A56DB'}
            onChange={(e) => {
              const next = e.target.value.toUpperCase()
              onChange(next)
              setCustomInput(next)
            }}
            className="w-9 h-9 p-1 border border-gray-200 rounded-full bg-white"
            title="自定义主题色"
          />
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onBlur={commitCustomColor}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitCustomColor()
              }
            }}
            className="flex-1 h-9 px-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="#1A56DB"
          />
        </div>
      )}

      {/* {mode === 'custom' && (
        <p className="text-[11px] text-gray-400">支持 3 位或 6 位十六进制颜色，例如 #09F / #1A56DB</p>
      )} */}

      <p className="text-[11px] text-gray-400">
        当前：{COLOR_LIST.find(([, c]) => c === value)?.[0] ?? '自定义'}
      </p>
    </div>
  )
}

export default ThemeColorPicker
