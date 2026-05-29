// ============================================================
// SkillsForm — 技能特长编辑表单
// ============================================================

import React from 'react'
import { SkillsData } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import FormField from '@/components/common/FormField'
import RichTextEditor from '@/components/common/RichTextEditor'
import { useI18n } from '@/hooks/useI18n'

interface SkillsFormProps {
  moduleId: string
  data: SkillsData
}

const SkillsForm: React.FC<SkillsFormProps> = ({ moduleId, data }) => {
  const { updateModuleData } = useResumeStore()
  const { t } = useI18n()
  const content = data.content ?? ''

  const updateContent = (next: string) => {
    updateModuleData(moduleId, { ...data, content: next } as unknown as Partial<SkillsData>)
  }

  return (
    <div className="editor-form-root space-y-5">
      <FormField
        label={t('skills.fillSkills')}
        required
        hint={t('skills.fillSkillsHint')}
      >
        <RichTextEditor
          value={content}
          onChange={updateContent}
          aiContext={{ moduleType: 'skills', targetPosition: t('skills.fillSkills'), moduleInstanceId: moduleId }}
          placeholder={t('skills.placeholder')}
          minRows={5}
          maxLength={1500}
        />
      </FormField>
    </div>
  )
}

export default SkillsForm
