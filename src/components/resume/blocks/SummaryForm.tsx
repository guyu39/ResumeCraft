// ============================================================
// SummaryForm — 自我评价编辑表单
// ============================================================

import React from 'react'
import { SummaryData } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import FormField from '@/components/common/FormField'
import RichTextEditor from '@/components/common/RichTextEditor'

interface SummaryFormProps {
  moduleId: string
  data: SummaryData
}

const SummaryForm: React.FC<SummaryFormProps> = ({ moduleId, data }) => {
  const { updateModuleData } = useResumeStore()

  const update = (content: string) => {
    updateModuleData(moduleId, { content } as unknown as Partial<SummaryData>)
  }

  const charCount = data.content.length

  return (
    <div className="editor-form-root space-y-5">
      <FormField
        label="自我评价"
        required
        hint="请简要描述你的职业背景、核心能力和职业亮点，建议控制在 50-200 字之间">
        <RichTextEditor
          value={data.content}
          onChange={update}
          aiContext={{ moduleType: 'summary', targetPosition: '自我评价', moduleInstanceId: moduleId }}
          placeholder="例：拥有 3 年前端开发经验，擅长 React 技术栈，曾主导多个中大型项目的技术选型与架构设计。"
          minRows={6}
          maxLength={1000}
        />
      </FormField>
      <div className="flex items-center justify-between text-xs">
        <span className={charCount < 50 ? 'text-amber-500' : 'text-gray-400'}>
          {charCount === 0 ? '请填写自我评价' : charCount < 50 ? '字数较少，建议补充更多细节' : '内容已保存'}
        </span>
        <span className="text-gray-300">{charCount} / 1000</span>
      </div>
    </div>
  )
}

export default SummaryForm