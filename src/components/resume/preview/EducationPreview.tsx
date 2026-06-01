// ============================================================
// EducationPreview — 教育经历预览
// ============================================================

import React from 'react'
import { EducationItem } from '@/types/resume'
import ModuleSection from './ModuleSection'
import RichTextPreview from '../../common/RichTextPreview'
import { useI18n } from '@/hooks/useI18n'

interface EducationPreviewProps {
  items: EducationItem[]
  themeColor: string
  compact?: boolean
  title?: string
  moduleId?: string
}

const EducationPreview: React.FC<EducationPreviewProps> = ({ items, themeColor, compact = false, title = '教育经历', moduleId }) => {
  const { t, te } = useI18n()
  const validItems = items.filter((item) => item.school || item.major || item.schoolExperience)

  const formatDate = (date: string) => {
    if (!date) return ''
    if (date === '至今') return t('enum.present')
    const [year, month] = date.split('-')
    return `${year}.${month}`
  }

  const renderRange = (startDate: string, endDate: string) => {
    const start = formatDate(startDate)
    const end = formatDate(endDate) || (endDate ? '' : t('enum.present'))
    if (start) return `${start} — ${end}`
    return ''
  }

  return (
    <ModuleSection title={title} themeColor={themeColor} moduleId={moduleId}>
      {validItems.length === 0 ? (
        <p className="text-[9pt] text-gray-300 italic">{t('education.fillEducation')}</p>
      ) : (
        <div className={`space-y-2 ${compact ? '' : ''}`}>
          {validItems.map((item) => (
            <div key={item.id} className="relative">
              {/* 时间（右上角） */}
              <div className="absolute right-0 top-0 text-[9pt] text-gray-900 font-semibold">
                {renderRange(item.startDate, item.endDate)}
              </div>

              {/* 学校名 + 专业 + 学历（同一行） */}
              <p className="text-[10pt] font-semibold text-gray-800 pr-[80px]">
                {item.school || t('education.schoolNamePreview')}
                {item.major && (
                  <span className="font-normal text-gray-600 ml-2">/ {item.major}</span>
                )}
                {item.degree && (
                  <span className="font-normal text-gray-500 ml-2">· {te(item.degree)}</span>
                )}
              </p>

              {/* GPA / 荣誉 */}
              {(item.gpa || item.honors) && (
                <p className="text-[9pt] text-gray-400 mt-0.5">
                  {item.gpa && <span>GPA: {item.gpa}</span>}
                  {item.gpa && item.honors && <span> · </span>}
                  {item.honors && <span>{item.honors}</span>}
                </p>
              )}

              {item.schoolExperience && (
                <RichTextPreview
                  text={item.schoolExperience}
                  className="text-[9pt] text-gray-700 mt-1.5"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </ModuleSection>
  )
}

export default EducationPreview
