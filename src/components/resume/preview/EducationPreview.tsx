// ============================================================
// EducationPreview — 教育经历预览
// ============================================================

import React from 'react'
import { EducationItem } from '@/types/resume'
import ModuleSection from './ModuleSection'
import RichTextPreview from '../../common/RichTextPreview'

interface EducationPreviewProps {
  items: EducationItem[]
  themeColor: string
  compact?: boolean
}

const formatDate = (date: string) => {
  if (!date) return ''
  if (date === '至今') return '至今'
  // YYYY-MM → YYYY.MM
  const [year, month] = date.split('-')
  return `${year}.${month}`
}

const EducationPreview: React.FC<EducationPreviewProps> = ({ items, themeColor, compact = false }) => {
  const validItems = items.filter((item) => item.school || item.major || item.schoolExperience)

  const renderRange = (startDate: string, endDate: string) => {
    const start = formatDate(startDate)
    const end = formatDate(endDate || '至今')
    if (start) return `${start} — ${end}`
    if (endDate || endDate === '') return end
    return ''
  }

  return (
    <ModuleSection title="教育经历" themeColor={themeColor}>
      {validItems.length === 0 ? (
        <p className="text-[9pt] text-gray-300 italic">请填写教育经历</p>
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
                {item.school || '学校名称'}
                {item.major && (
                  <span className="font-normal text-gray-600 ml-2">/ {item.major}</span>
                )}
                {item.degree && (
                  <span className="font-normal text-gray-500 ml-2">· {item.degree}</span>
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
