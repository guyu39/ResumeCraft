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
    <div className="resume-module-title mb-2.5">
      <div
        className="resume-module-title-marker w-1 h-4 rounded-full flex-shrink-0"
        style={{ ['--module-title-color' as string]: themeColor }}
      />
      <h4
        className="resume-module-title-text m-0 font-bold uppercase tracking-wider leading-[1.1] text-gray-700"
        style={{
          color: themeColor,
          fontFamily: 'var(--module-title-font-family)',
          fontSize: 'var(--module-title-font-size)',
        }}
      >
        {title}
      </h4>
      <div className="resume-module-title-line flex-1 h-px bg-gray-200" />
    </div>
    <div className="pl-1">
      {children}
    </div>
  </div>
)

export default ModuleSection
