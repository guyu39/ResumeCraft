// ============================================================
// ProjectPreview — 项目经历预览
// ============================================================

import React from 'react'
import { ProjectItem } from '@/types/resume'
import ModuleSection from './ModuleSection'
import RichTextPreview from '../../common/RichTextPreview'

interface ProjectPreviewProps {
  items: ProjectItem[]
  themeColor: string
}

const formatDate = (date: string) => {
  if (!date) return ''
  if (date === '至今') return '至今'
  const [year, month] = date.split('-')
  return `${year}.${month}`
}

const ProjectPreview: React.FC<ProjectPreviewProps> = ({ items, themeColor }) => {
  const validItems = items.filter((item) => item.name || item.role)

  const renderRange = (startDate: string, endDate: string) => {
    const start = formatDate(startDate)
    if (!start) return ''
    const end = formatDate(endDate) || '至今'
    return `${start} — ${end}`
  }

  return (
    <ModuleSection title="项目经历" themeColor={themeColor}>
      {validItems.length === 0 ? (
        <p className="text-[9pt] text-gray-300 italic">请填写项目经历</p>
      ) : (
        <div className="space-y-2">
          {validItems.map((item) => (
            <div key={item.id} className="relative">
              {/* 时间和链接（右上） */}
              <div className="absolute right-0 top-0 text-[9pt] text-gray-900 font-semibold text-right leading-tight">
                <div>
                  {renderRange(item.startDate, item.endDate)}
                </div>
              </div>

              {/* 项目名 + 角色 */}
              <p className="text-[10pt] font-semibold text-gray-800 pr-[90px]">
                {item.name || '项目名称'}
                {item.role && (
                  <span className="font-normal text-gray-600"> / {item.role}</span>
                )}
                {item.link && (
                  <>
                    <span className="font-normal text-gray-600"> / </span>
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded px-1.5 py-[1px] text-[8.5pt] font-medium no-underline"
                      style={{ color: themeColor, backgroundColor: `${themeColor}14`, textDecoration: 'none' }}
                    >
                      项目链接
                    </a>
                  </>
                )}
              </p>

              {/* 技术栈 */}
              {item.techStack && item.techStack.length > 0 && (
                <p className="text-[8.8pt] text-gray-900 font-semibold mt-0.5">
                  {item.techStack.join(' · ')}
                </p>
              )}

              {/* 描述 */}
              {item.description && (
                <RichTextPreview
                  text={item.description}
                  className="text-[9.5pt] text-gray-700 mt-1.5"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </ModuleSection>
  )
}

export default ProjectPreview
