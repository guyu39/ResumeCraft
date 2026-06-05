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
  renderItemCommentIcon?: (itemIndex: number) => React.ReactNode
  renderItemCommentPanel?: (itemIndex: number) => React.ReactNode
}

const LanguagesPreview: React.FC<LanguagesPreviewProps> = ({ items, themeColor, title = '语言能力', moduleId, renderItemCommentIcon, renderItemCommentPanel }) => {
  const { t, te } = useI18n()
  const validItems = items.filter((item) => item.language)

  return (
    <ModuleSection title={title} themeColor={themeColor} moduleId={moduleId}>
      {validItems.length === 0 ? (
        <p className="text-[9pt] text-gray-300 italic">{t('languages.fillLanguages')}</p>
      ) : (
        <div className="space-y-1.5">
          {validItems.map((item, index) => (
            <div key={item.id}>
              <div className="relative flex items-center gap-2">
                {renderItemCommentIcon && (
                  <div className="absolute -left-6 sm:-left-8 md:-left-12 top-0">{renderItemCommentIcon(index)}</div>
                )}
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
              {renderItemCommentPanel?.(index)}
            </div>
          ))}
        </div>
      )}
    </ModuleSection>
  )
}

export default LanguagesPreview
