// ============================================================
// ResumePreview — 简历实时预览（支持三模板）
// ============================================================

import React from 'react'
import { Resume } from '@/types/resume'
import ClassicTemplate from './preview/ClassicTemplate'
import ModernTemplate from './preview/ModernTemplate'
import MinimalTemplate from './preview/MinimalTemplate'

interface ResumePreviewProps {
  resume: Resume
}

const ResumePreview: React.FC<ResumePreviewProps> = ({ resume }) => {
  const { template } = resume

  switch (template) {
    case 'modern':
      return <ModernTemplate resume={resume} />
    case 'minimal':
      return <MinimalTemplate resume={resume} />
    case 'classic':
    default:
      return <ClassicTemplate resume={resume} />
  }
}

export default ResumePreview
