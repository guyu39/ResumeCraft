// ============================================================
// PortfolioPreview — 作品集链接预览
// ============================================================

import React from 'react'
import { PortfolioItem } from '@/types/resume'
import ModuleSection from './ModuleSection'

interface PortfolioPreviewProps {
  items: PortfolioItem[]
  themeColor: string
}

const PortfolioPreview: React.FC<PortfolioPreviewProps> = ({ items, themeColor }) => {
  const validItems = items.filter((item) => item.title || item.url)

  return (
    <ModuleSection title="作品集" themeColor={themeColor}>
      {validItems.length === 0 ? (
        <p className="text-[9pt] text-gray-300 italic">请添加作品集链接</p>
      ) : (
        <div className="space-y-1.5">
          {validItems.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <span className="text-[9pt] text-gray-700 flex-1">🔗 {item.title || item.url}</span>
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded px-1.5 py-[1px] text-[8pt] font-medium flex-shrink-0 no-underline"
                  style={{ color: themeColor, backgroundColor: `${themeColor}14`, textDecoration: 'none' }}
                >
                  访问 ↗
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </ModuleSection>
  )
}

export default PortfolioPreview
