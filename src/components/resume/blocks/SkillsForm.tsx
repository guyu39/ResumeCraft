// ============================================================
// SkillsForm — 技能特长编辑表单
// ============================================================

import React from 'react'
import { SkillsData } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import FormField from '@/components/common/FormField'
import RichTextEditor from '@/components/common/RichTextEditor'

interface SkillsFormProps {
  moduleId: string
  data: SkillsData
}

const SkillsForm: React.FC<SkillsFormProps> = ({ moduleId, data }) => {
  const { updateModuleData } = useResumeStore()
  const content = data.content ?? ''

  const updateContent = (next: string) => {
    updateModuleData(moduleId, { ...data, content: next } as unknown as Partial<SkillsData>)
  }

  return (
    <div className="editor-form-root space-y-5">
      <FormField
        label="专业技能"
        required
        hint="可输入技术栈、熟练方向和能力亮点"
      >
        <RichTextEditor
          value={content}
          onChange={updateContent}
          aiContext={{ moduleType: 'skills', targetPosition: '专业技能' }}
          placeholder="例如：熟练掌握 React、TypeScript、Vite，熟悉组件化、状态管理、工程化配置，具备性能优化与复杂页面开发经验"
          minRows={5}
          maxLength={1500}
        />
      </FormField>
    </div>
  )
}

export default SkillsForm