// ============================================================
// TokenUsage — AI 调用 token 用量小标签，统一展示「本次约 X tokens」
// ============================================================

import React from 'react'

interface TokenUsageProps {
  total?: number | null
  input?: number | null
  output?: number | null
  className?: string
}

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

const TokenUsage: React.FC<TokenUsageProps> = ({ total, input, output, className = '' }) => {
  if (!total || total <= 0) return null
  const title = input != null && output != null ? `输入 ${input} / 输出 ${output} tokens` : undefined
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 ${className}`}
    >
      本次约 {fmt(total)} tokens
    </span>
  )
}

export default TokenUsage
