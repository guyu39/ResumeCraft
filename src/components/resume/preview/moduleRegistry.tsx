// ============================================================
// moduleRegistry — 简历模块统一渲染入口
// 把原本在三套模板里逐字复制的 type→组件 switch 收敛到一处。
// 模板只需调用 renderResumeModule(module, ctx)，新增模块类型只改这里。
// ============================================================

import React from 'react'
import {
  Module,
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

export interface ModuleRenderContext {
  themeColor: string
  // 评论回调：仅 Classic 模板（编辑页/分享页批注）会传入，其余模板不传
  renderItemCommentIcon?: (moduleId: string, itemIndex: number) => React.ReactNode
  renderItemCommentPanel?: (moduleId: string, itemIndex: number) => React.ReactNode
}

// 渲染单个模块。ctx 含主题色与可选评论回调（无则等价于不传，行为同旧逻辑）。
// personal 模块由各模板自行处理（布局差异大），此处不负责。
export function renderResumeModule(module: Module, ctx: ModuleRenderContext): React.ReactNode {
  const { type, id, data, title } = module
  const { themeColor } = ctx
  // 评论回调按 moduleId 绑定；ctx 未传时为 undefined，等价于旧模板不透传
  const icon = ctx.renderItemCommentIcon ? (idx: number) => ctx.renderItemCommentIcon!(id, idx) : undefined
  const panel = ctx.renderItemCommentPanel ? (idx: number) => ctx.renderItemCommentPanel!(id, idx) : undefined

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
