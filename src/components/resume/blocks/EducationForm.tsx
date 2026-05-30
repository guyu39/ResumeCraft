// ============================================================
// EducationForm — 教育经历编辑表单
// ============================================================

import React from 'react'
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { EducationItem, DEGREE_OPTIONS } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import FormField, { TextInput, Select, Button } from '@/components/common/FormField'
import YearMonthRangePicker from '@/components/common/YearMonthRangePicker'
import RichTextEditor from '@/components/common/RichTextEditor'
import useDeleteConfirm from '@/hooks/useDeleteConfirm'
import { useI18n } from '@/hooks/useI18n'

interface EducationFormProps {
  moduleId: string
  items: EducationItem[]
}

const EducationForm: React.FC<EducationFormProps> = ({ moduleId, items }) => {
  const { updateModuleData } = useResumeStore()
  const { requestDelete, deleteConfirmDialog } = useDeleteConfirm()
  const { t, te } = useI18n()

  const EDUCATION_HONOR_OPTIONS = [
    { label: t('personal.selectOptional'), value: '' },
    { label: t('enum.collegeLevel'), value: '院级' },
    { label: t('enum.universityLevel'), value: '校级' },
    { label: t('enum.cityLevel'), value: '市级' },
    { label: t('enum.provincialLevel'), value: '省级' },
    { label: t('enum.nationalLevel'), value: '国家级' },
    { label: t('enum.internationalLevel'), value: '国际级' },
    { label: t('enum.otherLevel'), value: '其他' },
  ]

  const DEGREE_SELECT_OPTIONS = DEGREE_OPTIONS.map((d) => ({
    label: te(d), value: d
  }))

  const update = (newItems: EducationItem[]) => {
    updateModuleData(moduleId, { items: newItems } as unknown as Partial<{ items: EducationItem[] }>)
  }

  const addItem = () => {
    update([
      ...items,
      { id: `edu-${Date.now()}`, school: '', major: '', degree: '本科', startDate: '', endDate: '', gpa: '', honors: '', schoolExperience: '' },
    ])
  }

  const removeItem = (id: string) => {
    if (items.length <= 1) return
    requestDelete({
      onConfirm: () => update(items.filter((item) => item.id !== id)),
    })
  }

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= items.length) return

    const newItems = [...items]
    const [current] = newItems.splice(index, 1)
    newItems.splice(targetIndex, 0, current)
    update(newItems)
  }

  const updateItem = (id: string, partial: Partial<EducationItem>) => {
    update(items.map((item) => (item.id === id ? { ...item, ...partial } : item)))
  }

  const handleDateRangeChange = (id: string, start: string, end: string) => {
    updateItem(id, { startDate: start, endDate: end })
  }

  return (
    <div className="editor-form-root space-y-5">
      {items.map((item, index) => (
        <div key={item.id} className="editor-block-card rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400">{t('common.itemN', { n: index + 1 })}</span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => moveItem(index, 'up')}
                disabled={index === 0}
              >
                <ArrowUp className="w-3.5 h-3.5" />
                {t('common.moveUp')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => moveItem(index, 'down')}
                disabled={index === items.length - 1}
              >
                <ArrowDown className="w-3.5 h-3.5" />
                {t('common.moveDown')}
              </Button>
              {items.length > 1 && (
                <Button variant="danger" size="sm" onClick={() => removeItem(item.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('common.delete')}
                </Button>
              )}
            </div>
          </div>

          {/* 学校 - 专业 - 学历同一行 */}
          <div className="grid grid-cols-3 gap-x-4">
            <FormField label={t('education.schoolName')} required>
              <TextInput value={item.school} onChange={(v) => updateItem(item.id, { school: v })} placeholder={t('education.schoolNamePlaceholder')} />
            </FormField>
            <FormField label={t('education.major')} required>
              <TextInput value={item.major} onChange={(v) => updateItem(item.id, { major: v })} placeholder={t('education.majorPlaceholder')} />
            </FormField>
            <FormField label={t('education.degree')} required>
              <Select value={item.degree} onChange={(v) => updateItem(item.id, { degree: v as typeof item.degree })} options={DEGREE_SELECT_OPTIONS} />
            </FormField>
          </div>

          {/* 时间范围选择 */}
          <FormField label={t('education.schoolTime')} required>
            <YearMonthRangePicker
              startDate={item.startDate}
              endDate={item.endDate}
              onChange={(start, end) => handleDateRangeChange(item.id, start, end)}
              futureYears={10}
            />
          </FormField>

          {/* GPA / 荣誉 */}
          <div className="grid grid-cols-2 gap-x-4">
            <FormField label={t('education.gpaRank')}>
              <TextInput value={item.gpa} onChange={(v) => updateItem(item.id, { gpa: v })} placeholder="3.8/4.0" />
            </FormField>
            <FormField label={t('education.honors')}>
              <Select
                value={item.honors}
                onChange={(v) => updateItem(item.id, { honors: v })}
                options={EDUCATION_HONOR_OPTIONS}
              />
            </FormField>
          </div>

          <FormField label={t('education.schoolExp')} hint={t('education.schoolExpHint')}>
            <RichTextEditor
              value={item.schoolExperience || ''}
              onChange={(v) => updateItem(item.id, { schoolExperience: v })}
              aiContext={{ moduleType: 'education', targetPosition: t('education.schoolExp'), moduleInstanceId: item.id }}
              placeholder={t('education.schoolExpPlaceholder')}
              minRows={4}
            />
          </FormField>
        </div>
      ))}

      <Button variant="secondary" onClick={addItem} className="w-full">
        <Plus className="w-4 h-4" />
        {t('education.addEducation')}
      </Button>

      {deleteConfirmDialog}
    </div>
  )
}

export default EducationForm
