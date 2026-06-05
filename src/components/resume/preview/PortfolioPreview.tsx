// ============================================================
// PortfolioPreview — 作品链接预览
// ============================================================

import React from 'react'
import { PortfolioItem } from '@/types/resume'
import ModuleSection from './ModuleSection'
import { useI18n } from '@/hooks/useI18n'

interface PortfolioPreviewProps {
  items: PortfolioItem[]
  themeColor: string
  title?: string
  moduleId?: string
  renderItemCommentIcon?: (itemIndex: number) => React.ReactNode
  renderItemCommentPanel?: (itemIndex: number) => React.ReactNode
}

const PortfolioPreview: React.FC<PortfolioPreviewProps> = ({ items, themeColor, title = '作品', moduleId, renderItemCommentIcon, renderItemCommentPanel }) => {
  const { t } = useI18n()
  const validItems = items.filter((item) => item.title || item.url)

  return (
    <ModuleSection title={title} themeColor={themeColor} moduleId={moduleId}>
      {validItems.length === 0 ? (
        <p className="text-[9pt] text-gray-300 italic">{t('portfolio.fillPortfolio')}</p>
      ) : (
        <div className="space-y-1.5">
          {validItems.map((item, index) => (
            <div key={item.id}>
              <div className="relative flex items-center gap-2">
                {renderItemCommentIcon && (
                  <div className="absolute -left-12 top-0">{renderItemCommentIcon(index)}</div>
                )}
                <span className="text-[9pt] text-gray-700 flex-1">🔗 {item.title || item.url}</span>
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded px-1.5 py-[1px] text-[8pt] font-medium flex-shrink-0 no-underline"
                    style={{ color: themeColor, backgroundColor: `${themeColor}14`, textDecoration: 'none' }}
                  >
                    {t('common.visitLink')}
                  </a>
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

export default PortfolioPreview
