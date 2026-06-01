// ============================================================
// WorkPreview — 工作经历预览
// ============================================================

import React from 'react'
import { WorkItem } from '@/types/resume'
import ModuleSection from './ModuleSection'
import RichTextPreview from '../../common/RichTextPreview'
import { useI18n } from '@/hooks/useI18n'

interface WorkPreviewProps {
  items: WorkItem[]
  themeColor: string
  title?: string
  moduleId?: string
}

const WorkPreview: React.FC<WorkPreviewProps> = ({ items, themeColor, title = '工作经历', moduleId }) => {
  const { t, te } = useI18n()
  const validItems = items.filter((item) => item.company || item.position)

  const formatDate = (date: string) => {
    if (!date) return ''
    if (date === '至今') return t('enum.present')
    const [year, month] = date.split('-')
    return `${year}.${month}`
  }

  const renderRange = (startDate: string, endDate: string) => {
    const start = formatDate(startDate)
    if (!start) return ''
    const end = formatDate(endDate) || t('enum.present')
    return `${start} — ${end}`
  }

  return (
    <ModuleSection title={title} themeColor={themeColor} moduleId={moduleId}>
      {validItems.length === 0 ? (
        <p className="text-[9pt] text-gray-300 italic">{t('work.fillDescription')}</p>
      ) : (
        <div className="space-y-2">
          {validItems.map((item) => (
            <div key={item.id} className="relative">
              {/* 时间和公司规模（右上） */}
              <div className="absolute right-0 top-0 text-[9pt] text-gray-900 font-semibold text-right leading-tight">
                <div>{renderRange(item.startDate, item.endDate)}</div>
                {item.companySize && (
                  <div className="text-[8pt]">
                    {te(item.companySize)}
                  </div>
                )}
              </div>

              {/* 公司/部门/职位 */}
              <p className="text-[10pt] font-semibold text-gray-800 pr-[90px]">
                {item.company || t('work.companyNamePreview')}
                {item.department && (
                  <span className="font-normal text-gray-600"> / {item.department}</span>
                )}
                {item.position && (
                  <span className="font-normal text-gray-600"> / {item.position}</span>
                )}
              </p>

              {/* 描述 */}
              {item.description ? (
                <RichTextPreview
                  text={item.description}
                  className="mt-1.5 text-[9.5pt] text-gray-700"
                />
              ) : (
                <p className="text-[9pt] text-gray-300 italic mt-1">{t('work.fillDescription')}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </ModuleSection>
  )
}

export default WorkPreview
