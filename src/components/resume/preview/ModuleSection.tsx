// ============================================================
// ModuleSection — 简历模块通用标题栏
// ============================================================

import React from 'react'

interface ModuleSectionProps {
  title: string
  themeColor: string
  children: React.ReactNode
}

const ModuleSection: React.FC<ModuleSectionProps> = ({ title, themeColor, children }) => (
  <div data-page-break-candidate style={{ marginBottom: 'var(--module-spacing, 20px)' }}>
    {/* 模块标题 */}
    <div className="flex items-center gap-2 mb-2.5">
      <div
        className="w-1 h-4 rounded-full flex-shrink-0"
        style={{ backgroundColor: themeColor }}
      />
      <h4
        className="m-0 text-[11pt] font-bold uppercase tracking-wider leading-[1.1] text-gray-700"
        style={{ color: themeColor }}
      >
        {title}
      </h4>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
    {/* 内容 */}
    <div className="pl-1">
      {children}
    </div>
  </div>
)

export default ModuleSection
