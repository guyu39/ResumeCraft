// ============================================================
// LanguagesPreview — 语言能力预览
// ============================================================

import React from 'react'
import { LanguageItem } from '@/types/resume'
import ModuleSection from './ModuleSection'
import { useI18n } from '@/hooks/useI18n'

interface LanguagesPreviewProps {
  items: LanguageItem[]
  themeColor: string
  title?: string
  moduleId?: string
}

const LanguagesPreview: React.FC<LanguagesPreviewProps> = ({ items, themeColor, title = '语言能力', moduleId }) => {
  const { t, te } = useI18n()
  const validItems = items.filter((item) => item.language)

  return (
    <ModuleSection title={title} themeColor={themeColor} moduleId={moduleId}>
      {validItems.length === 0 ? (
        <p className="text-[9pt] text-gray-300 italic">{t('languages.fillLanguages')}</p>
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
                  {te(item.level)}
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
