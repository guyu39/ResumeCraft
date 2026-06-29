// ============================================================
// InlineError — 面板/表单内联错误提示（统一风格）
// 收敛此前各 AI 面板散落的「裸红字 / 红框 / 带图标色块」三种写法。
// 用于：与具体面板上下文强绑定、需用户边看边改的错误。
// 瞬时操作结果用 toast；工作区级状态用 NoticeCenter。
// ============================================================

import React from 'react'
import { AlertTriangle } from 'lucide-react'

interface InlineErrorProps {
  message?: string | null
  className?: string
  // 可选的附加操作（如重试按钮），渲染在消息下方
  children?: React.ReactNode
}

const InlineError: React.FC<InlineErrorProps> = ({ message, className = '', children }) => {
  if (!message) return null
  return (
    <div className={`flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-600 ${className}`}>
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="break-words">{message}</span>
        {children}
      </div>
    </div>
  )
}

export default InlineError
