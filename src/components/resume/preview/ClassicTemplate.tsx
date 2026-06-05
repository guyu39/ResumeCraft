// ============================================================
// ClassicTemplate — 经典单栏模板
// ============================================================

import React, { useCallback } from 'react'
import {
  Resume,
  DEFAULT_RESUME_STYLE_SETTINGS,
  PersonalData,
  EducationItem,
  WorkItem,
  ProjectItem,
  SkillsData,
  AwardItem,
  SummaryData,
  CertificateItem,
  PortfolioItem,
  LanguageItem,
  CustomData,
  AIEngineeringData,
} from '@/types/resume'
import { useAdminCommentContext } from '@/contexts/AdminCommentContext'
import PersonalPreview from './PersonalPreview'
import EducationPreview from './EducationPreview'
import WorkPreview from './WorkPreview'
import ProjectPreview from './ProjectPreview'
import SkillsPreview from './SkillsPreview'
import AwardsPreview from './AwardsPreview'
import SummaryPreview from './SummaryPreview'
import CertificatesPreview from './CertificatesPreview'
import PortfolioPreview from './PortfolioPreview'
import LanguagesPreview from './LanguagesPreview'
import CustomPreview from './CustomPreview'
import AIEngineeringPreview from './AIEngineeringPreview'

interface ClassicTemplateProps {
  resume: Resume
  renderItemCommentIcon?: (moduleId: string, itemIndex: number) => React.ReactNode
  renderItemCommentPanel?: (moduleId: string, itemIndex: number) => React.ReactNode
  className?: string
  overrideMinHeight?: string
}

/** 格式化相对时间 */
function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 30) return `${days}天前`
  return new Date(ts).toLocaleDateString('zh-CN')
}

/** 管理员评论徽章 */
const AdminCommentBadge: React.FC<{ moduleId: string; itemIndex: number }> = ({ moduleId, itemIndex }) => {
  const ctx = useAdminCommentContext()
  if (!ctx) return null
  const count = ctx.getCommentCount(moduleId, itemIndex)
  if (count === 0) return null
  const key = `${moduleId}#${itemIndex}`
  const isExpanded = ctx.expandedKey === key

  return (
    <button data-no-export
      onClick={(e) => {
        e.stopPropagation()
        ctx.setExpandedKey(key)
      }}
      className={`flex items-center justify-center rounded-full border transition-colors cursor-pointer ${isExpanded
          ? 'bg-amber-200 border-amber-300 text-amber-800'
          : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
        }`}
      style={{
        minWidth: 22,
        height: 22,
        fontSize: '10px',
        fontWeight: 600,
        lineHeight: 1,
        padding: '0 5px',
      }}
      title={`${count} 条评论`}
    >
      {count}
    </button>
  )
}
/** 评论详情（展开在气泡下方，不影响简历内容）*/
const AdminCommentPanel: React.FC<{ moduleId: string; itemIndex: number }> = ({ moduleId, itemIndex }) => {
  const ctx = useAdminCommentContext()
  if (!ctx) return null
  const key = `${moduleId}#${itemIndex}`
  if (ctx.expandedKey !== key) return null

  const comments = ctx.getCommentsForItem(moduleId, itemIndex)
  if (comments.length === 0) return null

  return (
    <div
      className="rounded-lg border border-amber-200 bg-white shadow-xl p-3 space-y-2.5"
      style={{ width: '320px', marginTop: '8px' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-amber-700">{comments.length} 条评论</span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            ctx.setExpandedKey(key)
          }}
          className="text-gray-400 hover:text-gray-600 text-base leading-none px-1"
        >
          ×
        </button>
      </div>
      {comments.map((c) => (
        <div key={c.id} className="flex gap-2 items-start">
          <span
            className="flex-shrink-0 w-2 h-2 rounded-full mt-1"
            style={{ backgroundColor: ctx.getVisitorColor(c.visitorId) }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <span className="text-[10px] font-medium text-gray-700">{c.authorName}</span>
              <span className="text-[9px] text-gray-400">{formatRelativeTime(c.createdAt)}</span>
            </div>
            <p className="text-[11px] text-gray-600 leading-relaxed break-words">{c.content}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

const ClassicTemplate: React.FC<ClassicTemplateProps> = ({
  resume,
  renderItemCommentIcon,
  renderItemCommentPanel,
  className = "",
  overrideMinHeight,
}) => {
  const adminCtx = useAdminCommentContext()
  const { modules, themeColor } = resume
  const styleSettings = resume.styleSettings ?? DEFAULT_RESUME_STYLE_SETTINGS
  const visibleModules = modules.filter((m) => m.visible)
  const personalModule = visibleModules.find((m) => m.type === "personal")
  const otherModules = visibleModules.filter((m) => m.type !== "personal")

  // 管理员模式下自动生成 icon/panel renderer
  const getIconRenderer = useCallback(
    (moduleId: string) => {
      if (renderItemCommentIcon) {
        return (idx: number) => renderItemCommentIcon(moduleId, idx)
      }
      if (adminCtx) {
        return (idx: number) => {
          return (<><AdminCommentBadge moduleId={moduleId} itemIndex={idx} /><AdminCommentPanel moduleId={moduleId} itemIndex={idx} /></>)
        }
      }
      return undefined
    },
    [renderItemCommentIcon, adminCtx]
  )

  const getPanelRenderer = useCallback(
    (moduleId: string) => {
      if (renderItemCommentPanel) {
        return (idx: number) => renderItemCommentPanel(moduleId, idx)
      }
      return undefined
    },
    [renderItemCommentPanel]
  )

  const renderModule = (module: typeof visibleModules[number]) => {
    const { type, id, data, title } = module
    const icon = getIconRenderer(id)
    const panel = getPanelRenderer(id)

    switch (type) {
      case 'education':
        return <EducationPreview key={id} moduleId={id} items={(data as { items: EducationItem[] }).items} themeColor={themeColor} title={title} renderItemCommentIcon={icon} renderItemCommentPanel={panel} />
      case 'work':
        return <WorkPreview key={id} moduleId={id} items={(data as { items: WorkItem[] }).items} themeColor={themeColor} title={title} renderItemCommentIcon={icon} renderItemCommentPanel={panel} />
      case 'project':
        return <ProjectPreview key={id} moduleId={id} items={(data as { items: ProjectItem[] }).items} themeColor={themeColor} title={title} renderItemCommentIcon={icon} renderItemCommentPanel={panel} />
      case 'skills':
        return <SkillsPreview key={id} moduleId={id} data={data as SkillsData} themeColor={themeColor} title={title} renderItemCommentIcon={icon} renderItemCommentPanel={panel} />
      case 'awards':
        return <AwardsPreview key={id} moduleId={id} items={(data as { items: AwardItem[] }).items} themeColor={themeColor} title={title} renderItemCommentIcon={icon} renderItemCommentPanel={panel} />
      case 'summary':
        return <SummaryPreview key={id} moduleId={id} data={data as SummaryData} themeColor={themeColor} title={title} renderItemCommentIcon={icon} renderItemCommentPanel={panel} />
      case 'certificates':
        return <CertificatesPreview key={id} moduleId={id} items={(data as { items: CertificateItem[] }).items} themeColor={themeColor} title={title} renderItemCommentIcon={icon} renderItemCommentPanel={panel} />
      case 'portfolio':
        return <PortfolioPreview key={id} moduleId={id} items={(data as { items: PortfolioItem[] }).items} themeColor={themeColor} title={title} renderItemCommentIcon={icon} renderItemCommentPanel={panel} />
      case 'languages':
        return <LanguagesPreview key={id} moduleId={id} items={(data as { items: LanguageItem[] }).items} themeColor={themeColor} title={title} renderItemCommentIcon={icon} renderItemCommentPanel={panel} />
      case 'custom':
        return <CustomPreview key={id} moduleId={id} data={data as CustomData} themeColor={themeColor} title={title} renderItemCommentIcon={icon} renderItemCommentPanel={panel} />
      case 'ai-engineering':
        return <AIEngineeringPreview key={id} moduleId={id} data={data as AIEngineeringData} themeColor={themeColor} title={title} renderItemCommentIcon={icon} renderItemCommentPanel={panel} />
      default:
        return null
    }
  }

  return (
    <div
      className={`w-full bg-white resume-preview-content ${className}`}
      data-module-title-line-position={styleSettings.moduleTitleLinePosition ?? 'left'}
      data-module-title-marker-style={styleSettings.moduleTitleMarkerStyle ?? 'bar'}
      data-module-title-marker-visible={styleSettings.moduleTitleMarkerVisible === false ? 'false' : 'true'}
      style={{
        minHeight: overrideMinHeight ?? '842px',
        padding: `${styleSettings.pagePaddingVertical}px ${styleSettings.pagePaddingHorizontal}px`,
        fontFamily: styleSettings.fontFamily,
        fontSize: `${styleSettings.fontSize}pt`,
        color: styleSettings.textColor,
        lineHeight: styleSettings.lineHeight,
        ['--module-spacing' as string]: `${styleSettings.moduleSpacing}px`,
        ['--paragraph-spacing' as string]: `${styleSettings.paragraphSpacing}px`,
        ['--resume-font-family' as string]: styleSettings.fontFamily,
        ['--resume-text-color' as string]: styleSettings.textColor,
        ['--resume-font-scale' as string]: String(styleSettings.fontSize / DEFAULT_RESUME_STYLE_SETTINGS.fontSize),
        ['--module-title-font-family' as string]: styleSettings.moduleTitleFontFamily ?? styleSettings.fontFamily,
        ['--module-title-font-size' as string]: `${styleSettings.moduleTitleFontSize ?? styleSettings.fontSize + 2}pt`,
        ['--module-title-color' as string]: themeColor,
      }}
    >
      {personalModule && (
        <PersonalPreview moduleId={personalModule.id} data={personalModule.data as PersonalData} themeColor={themeColor} />
      )}
      {otherModules.map(renderModule)}
    </div>
  )
}

export default ClassicTemplate
