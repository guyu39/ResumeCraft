// ============================================================
// CustomPreview — 自定义模块预览
// ============================================================

import React from 'react'
import { CustomData } from '@/types/resume'
import ModuleSection from './ModuleSection'
import RichTextPreview from '../../common/RichTextPreview'
import { useI18n } from '@/hooks/useI18n'

interface CustomPreviewProps {
  data: CustomData
  themeColor: string
  title?: string
  moduleId?: string
  renderItemCommentIcon?: (itemIndex: number) => React.ReactNode
  renderItemCommentPanel?: (itemIndex: number) => React.ReactNode
}

const CustomPreview: React.FC<CustomPreviewProps> = ({ data, themeColor, title: moduleTitle, moduleId, renderItemCommentIcon, renderItemCommentPanel }) => {
  const { t } = useI18n()
  const { title: dataTitle, items } = data
  const displayTitle = moduleTitle || dataTitle || t('custom.fillCustom').replace('请添加内容', 'Custom')
  const validItems = items.filter((item) => item.title || item.content)

  return (
    <ModuleSection title={displayTitle} themeColor={themeColor} moduleId={moduleId}>
      {validItems.length === 0 ? (
        <p className="text-[9pt] text-gray-300 italic">{t('custom.fillCustom')}</p>
      ) : (
        <div className="space-y-3">
          {validItems.map((item, index) => (
            <div key={item.id}>
              <div className={renderItemCommentIcon ? "flex items-start gap-1.5" : ""}>
                {renderItemCommentIcon && (
                  <div className="flex-shrink-0 pt-0.5">{renderItemCommentIcon(index)}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[10pt] font-semibold text-gray-800">{item.title}</p>
                    {item.date && (
                      <span className="text-[9pt] text-gray-400 flex-shrink-0">{item.date}</span>
                    )}
                  </div>
                  {item.content && (
                    <RichTextPreview
                      text={item.content}
                      className="text-[9.5pt] text-gray-700 mt-0.5"
                    />
                  )}
                </div>
              </div>
              {renderItemCommentPanel?.(index)}
            </div>
          ))}
        </div>
      )}
    </ModuleSection>
  )
}

export default CustomPreview
