// ============================================================
// ProjectPreview — 项目经历预览
// ============================================================

import React from 'react'
import { ProjectItem } from '@/types/resume'
import ModuleSection from './ModuleSection'
import RichTextPreview from '../../common/RichTextPreview'
import { useI18n } from '@/hooks/useI18n'

interface ProjectPreviewProps {
  items: ProjectItem[]
  themeColor: string
  title?: string
  moduleId?: string
  renderItemCommentIcon?: (itemIndex: number) => React.ReactNode
  renderItemCommentPanel?: (itemIndex: number) => React.ReactNode
}

const ProjectPreview: React.FC<ProjectPreviewProps> = ({ items, themeColor, title = '项目经历', moduleId, renderItemCommentIcon, renderItemCommentPanel }) => {
  const { t } = useI18n()
  const validItems = items.filter((item) => item.name || item.role)

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

  const renderItemContent = (item: ProjectItem) => (
    <>
      {/* 时间和链接（右上） */}
      <div className="absolute right-0 top-0 text-[9pt] text-gray-900 font-semibold text-right leading-tight">
        <div>
          {renderRange(item.startDate, item.endDate)}
        </div>
      </div>

      {/* 项目名 + 角色 */}
      <p className="text-[10pt] font-semibold text-gray-800 pr-[90px]">
        {item.name || t('project.projectNamePreview')}
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
              className="inline-block max-w-[280px] truncate align-bottom text-[8.5pt] underline decoration-dotted underline-offset-4"
              style={{ color: themeColor }}
            >
              {item.link}
            </a>
          </>
        )}
      </p>

      {/* 技术栈 */}
      {item.techStack && item.techStack.length > 0 && (
        <p className="text-[9pt] text-gray-900 font-semibold mt-0.5">
          {t('label.techStack')}：{item.techStack.join(' + ')}
        </p>
      )}

      {/* 描述 */}
      {item.description && (
        <RichTextPreview
          text={item.description}
          className="text-[9.5pt] text-gray-700 mt-1.5"
        />
      )}
    </>
  )

  return (
    <ModuleSection title={title} themeColor={themeColor} moduleId={moduleId}>
      {validItems.length === 0 ? (
        <p className="text-[9pt] text-gray-300 italic">{t('project.fillProject')}</p>
      ) : (
        <div className="space-y-2">
          {validItems.map((item, index) => (
            <div key={item.id}>
              <div className="relative">
                {renderItemCommentIcon && (
                  <div className="absolute -left-6 sm:-left-8 md:-left-12 top-0.5">{renderItemCommentIcon(index)}</div>
                )}
                <div>
                  {renderItemContent(item)}
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

export default ProjectPreview
