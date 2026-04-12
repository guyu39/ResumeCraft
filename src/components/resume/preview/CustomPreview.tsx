// ============================================================
// CustomPreview — 自定义模块预览
// ============================================================

import React from 'react'
import { CustomData } from '@/types/resume'
import ModuleSection from './ModuleSection'
import RichTextPreview from '../../common/RichTextPreview'

interface CustomPreviewProps {
  data: CustomData
  themeColor: string
}

const CustomPreview: React.FC<CustomPreviewProps> = ({ data, themeColor }) => {
  const { title, items } = data
  const validItems = items.filter((item) => item.title || item.content)

  return (
    <ModuleSection title={title || '自定义模块'} themeColor={themeColor}>
      {validItems.length === 0 ? (
        <p className="text-[9pt] text-gray-300 italic">请添加内容</p>
      ) : (
        <div className="space-y-3">
          {validItems.map((item) => (
            <div key={item.id}>
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
          ))}
        </div>
      )}
    </ModuleSection>
  )
}

export default CustomPreview
