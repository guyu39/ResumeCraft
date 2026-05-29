// ============================================================
// SummaryForm — 自我评价编辑表单
// ============================================================

import React from 'react'
import { SummaryData } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import FormField from '@/components/common/FormField'
import RichTextEditor from '@/components/common/RichTextEditor'
import { useI18n } from '@/hooks/useI18n'

interface SummaryFormProps {
  moduleId: string
  data: SummaryData
}

const SummaryForm: React.FC<SummaryFormProps> = ({ moduleId, data }) => {
  const { updateModuleData } = useResumeStore()
  const { t } = useI18n()

  const update = (content: string) => {
    updateModuleData(moduleId, { content } as unknown as Partial<SummaryData>)
  }

  const charCount = data.content.length

  const getStatusText = () => {
    if (charCount === 0) return t('summary.statusEmpty')
    if (charCount < 50) return t('summary.statusShort')
    return t('summary.statusSaved')
  }

  return (
    <div className="editor-form-root space-y-5">
      <FormField
        label={t('summary.fillSummary')}
        required
        hint={t('summary.summaryHint')}
      >
        <RichTextEditor
          value={data.content}
          onChange={update}
          aiContext={{ moduleType: 'summary', targetPosition: t('summary.fillSummary'), moduleInstanceId: moduleId }}
          placeholder={t('summary.placeholder')}
          minRows={6}
          maxLength={1000}
        />
      </FormField>
      <div className="flex items-center justify-between text-xs">
        <span className={charCount < 50 ? 'text-amber-500' : 'text-gray-400'}>
          {getStatusText()}
        </span>
        <span className="text-gray-300">{charCount} / 1000</span>
      </div>
    </div>
  )
}

export default SummaryForm
