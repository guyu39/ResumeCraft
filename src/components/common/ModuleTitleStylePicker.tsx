// ============================================================
// ModuleTitleStylePicker — 模块标题样式可视化选择器
// 下划线位置（左/下/无）+ 左侧标记样式（竖线/圆角块/圆点/方块/无），
// 用带图形预览的分段按钮替代下拉，让用户直观看到差异。
// ============================================================

import React from 'react'
import type {
  ModuleTitleLinePosition,
  ModuleTitleMarkerStyle,
} from '@/types/resume'

interface ModuleTitleStylePickerProps {
  linePosition: ModuleTitleLinePosition
  markerStyle: ModuleTitleMarkerStyle
  markerVisible: boolean
  themeColor: string
  onChange: (next: {
    moduleTitleLinePosition?: ModuleTitleLinePosition
    moduleTitleMarkerStyle?: ModuleTitleMarkerStyle
    moduleTitleMarkerVisible?: boolean
  }) => void
}

const LINE_OPTIONS: Array<{ value: ModuleTitleLinePosition; label: string }> = [
  { value: 'left', label: '标题右侧' },
  { value: 'bottom', label: '标题下方' },
  { value: 'none', label: '不显示' },
]

const MARKER_OPTIONS: Array<{ value: ModuleTitleMarkerStyle | 'none'; label: string }> = [
  { value: 'bar', label: '竖线' },
  { value: 'pill', label: '圆角块' },
  { value: 'dot', label: '圆点' },
  { value: 'square', label: '方块' },
  { value: 'none', label: '不显示' },
]

// 标记图形预览（按 themeColor 着色）
const MarkerGlyph: React.FC<{ style: ModuleTitleMarkerStyle | 'none'; color: string }> = ({ style, color }) => {
  if (style === 'none') return <span className="text-[10px] text-gray-400">无</span>
  const base = { backgroundColor: color }
  switch (style) {
    case 'bar':
      return <span className="inline-block h-3.5 w-1 rounded-sm" style={base} />
    case 'pill':
      return <span className="inline-block h-3.5 w-1.5 rounded-full" style={base} />
    case 'dot':
      return <span className="inline-block h-2 w-2 rounded-full" style={base} />
    case 'square':
      return <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={base} />
    default:
      return null
  }
}

// 下划线位置预览：用一行小标题 + 线条位置示意
const LineGlyph: React.FC<{ position: ModuleTitleLinePosition; color: string }> = ({ position, color }) => {
  if (position === 'none') return <span className="text-[10px] text-gray-400">无</span>
  if (position === 'bottom') {
    return (
      <span className="inline-flex flex-col items-center gap-0.5">
        <span className="h-1 w-5 rounded-sm bg-gray-300" />
        <span className="h-[2px] w-5 rounded-sm" style={{ backgroundColor: color }} />
      </span>
    )
  }
  // left：标题后接横线
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1 w-3 rounded-sm bg-gray-300" />
      <span className="h-[2px] w-3 rounded-sm" style={{ backgroundColor: color }} />
    </span>
  )
}

const ModuleTitleStylePicker: React.FC<ModuleTitleStylePickerProps> = ({
  linePosition,
  markerStyle,
  markerVisible,
  themeColor,
  onChange,
}) => {
  const currentMarker: ModuleTitleMarkerStyle | 'none' = markerVisible === false ? 'none' : markerStyle
  const currentLine = linePosition ?? 'left'

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-700">标题分隔线</label>
        <div className="grid grid-cols-3 gap-1.5">
          {LINE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ moduleTitleLinePosition: opt.value })}
              className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[11px] transition-colors ${currentLine === opt.value
                ? 'border-primary bg-primary/5 text-primary font-medium'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
            >
              <span className="flex h-5 items-center"><LineGlyph position={opt.value} color={themeColor} /></span>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-700">标题左侧标记</label>
        <div className="grid grid-cols-5 gap-1.5">
          {MARKER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() =>
                onChange({
                  moduleTitleMarkerStyle: opt.value === 'none' ? markerStyle : (opt.value as ModuleTitleMarkerStyle),
                  moduleTitleMarkerVisible: opt.value !== 'none',
                })
              }
              className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[10px] transition-colors ${currentMarker === opt.value
                ? 'border-primary bg-primary/5 text-primary font-medium'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
            >
              <span className="flex h-4 items-center"><MarkerGlyph style={opt.value} color={themeColor} /></span>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ModuleTitleStylePicker
