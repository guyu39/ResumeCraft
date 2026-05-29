// ============================================================
// AwardsPreview — 荣誉奖项预览
// ============================================================

import React from 'react'
import { AwardItem } from '@/types/resume'
import ModuleSection from './ModuleSection'
import { useI18n } from '@/hooks/useI18n'

interface AwardsPreviewProps {
  items: AwardItem[]
  themeColor: string
  title?: string
}

const AwardsPreview: React.FC<AwardsPreviewProps> = ({ items, themeColor, title = '荣誉奖项' }) => {
  const { t, te } = useI18n()
  const validItems = items.filter((item) => item.name)

  return (
    <ModuleSection title={title} themeColor={themeColor}>
      {validItems.length === 0 ? (
        <p className="text-[9pt] text-gray-300 italic">{t('awards.fillAwards')}</p>
      ) : (
        <div className="space-y-2">
          {validItems.map((item) => (
            <div key={item.id} className="flex items-start gap-3">
              {/* 奖项名称 */}
              <div className="flex-1 text-[9.5pt] text-gray-700">
                <span className="font-medium">🏆 </span>
                {item.name}
                {item.level && (
                  <span className="ml-1 text-[9pt] text-gray-500">（{te(item.level)}）</span>
                )}
              </div>
              {/* 日期 */}
              {item.date && (
                <span className="text-[9pt] text-gray-900 font-semibold flex-shrink-0">
                  {item.date}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </ModuleSection>
  )
}

export default AwardsPreview
