// ============================================================
// LanguagesPreview — 语言能力预览
// ============================================================

import React from 'react'
import { LanguageItem } from '@/types/resume'
import ModuleSection from './ModuleSection'

interface LanguagesPreviewProps {
  items: LanguageItem[]
  themeColor: string
}

const LanguagesPreview: React.FC<LanguagesPreviewProps> = ({ items, themeColor }) => {
  const validItems = items.filter((item) => item.language)

  return (
    <ModuleSection title="语言能力" themeColor={themeColor}>
      {validItems.length === 0 ? (
        <p className="text-[9pt] text-gray-300 italic">请填写语言能力</p>
      ) : (
        <div className="space-y-1.5">
          {validItems.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <span className="text-[9.5pt] text-gray-700 w-20 flex-shrink-0">🌐 {item.language}</span>
              {item.level && (
                <span
                  className="text-[9pt] px-2 py-0.5 rounded"
                  style={{ backgroundColor: `${themeColor}18`, color: themeColor }}
                >
                  {item.level}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </ModuleSection>
  )
}

export default LanguagesPreview
