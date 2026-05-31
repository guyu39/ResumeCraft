// ============================================================
// WorkForm — 工作经历编辑表单
// ============================================================

import React from 'react'
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { WorkItem } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import FormField, { TextInput, Select, Button } from '@/components/common/FormField'
import YearMonthRangePicker from '@/components/common/YearMonthRangePicker'
import RichTextEditor from '@/components/common/RichTextEditor'
import useDeleteConfirm from '@/hooks/useDeleteConfirm'
import { useI18n } from '@/hooks/useI18n'

interface WorkFormProps {
  moduleId: string
  items: WorkItem[]
}

const WorkForm: React.FC<WorkFormProps> = ({ moduleId, items }) => {
  const { resume, updateModuleData, updateModuleTitle } = useResumeStore()
  const { t } = useI18n()
  const { requestDelete, deleteConfirmDialog } = useDeleteConfirm()
  const currentModule = resume.modules.find((module) => module.id === moduleId)
  const isEn = resume.locale === 'en-US'
  const titleWork = isEn ? 'Work Experience' : '工作经历'
  const titleIntern = isEn ? 'Internship' : '实习经历'
  const currentTitle = currentModule?.title === titleIntern ? titleIntern : titleWork

  const COMPANY_SIZE_OPTIONS = [
    { label: t('personal.selectOptional'), value: '' },
    { label: t('enum.under15'), value: '少于15人' },
    { label: t('enum.15to50'), value: '15-50人' },
    { label: t('enum.50to150'), value: '50-150人' },
    { label: t('enum.150to500'), value: '150-500人' },
    { label: t('enum.500to2000'), value: '500-2000人' },
    { label: t('enum.2000to10000'), value: '2000-10000人' },
    { label: t('enum.over10000'), value: '10000人以上' },
  ]

  const update = (newItems: WorkItem[]) => {
    updateModuleData(moduleId, { items: newItems } as unknown as Partial<{ items: WorkItem[] }>)
  }

  const addItem = () => {
    update([
      ...items,
      { id: `work-${Date.now()}`, company: '', position: '', department: '', startDate: '', endDate: '', description: '', companySize: '' },
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

  const updateItem = (id: string, partial: Partial<WorkItem>) => {
    // 使用函数式更新，基于 store 中最新数据构造更新，避免陈旧闭包
    updateModuleData(moduleId, (prev) => ({
      items: ((prev as { items: WorkItem[] }).items ?? items).map((item) => (item.id === id ? { ...item, ...partial } : item)),
    }) as unknown as Partial<{ items: WorkItem[] }>)
  }

  const handleDateRangeChange = (id: string, start: string, end: string) => {
    updateItem(id, { startDate: start, endDate: end })
  }

  return (
    <div className="editor-form-root space-y-5">
      <FormField label={t('common.moduleName')}>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={currentTitle === titleWork ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => updateModuleTitle(moduleId, titleWork)}
          >
            {titleWork}
          </Button>
          <Button
            type="button"
            variant={currentTitle === titleIntern ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => updateModuleTitle(moduleId, titleIntern)}
          >
            {titleIntern}
          </Button>
        </div>
      </FormField>

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

          <div className="grid grid-cols-2 gap-x-4">
            <FormField label={t('work.companyName')} required>
              <TextInput value={item.company} onChange={(v) => updateItem(item.id, { company: v })} placeholder={t('work.companyNamePlaceholder')} />
            </FormField>
            <FormField label={t('work.positionName')} required>
              <TextInput value={item.position} onChange={(v) => updateItem(item.id, { position: v })} placeholder={t('work.positionPlaceholder')} />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-x-4">
            <FormField label={t('work.companySize')}>
              <Select
                value={item.companySize}
                onChange={(v) => updateItem(item.id, { companySize: v })}
                options={COMPANY_SIZE_OPTIONS}
              />
            </FormField>
            <FormField label={t('work.department')}>
              <TextInput value={item.department ?? ''} onChange={(v) => updateItem(item.id, { department: v })} placeholder={t('work.departmentPlaceholder')} />
            </FormField>
          </div>

          <FormField label={t('work.workTime')} required>
            <YearMonthRangePicker
              startDate={item.startDate}
              endDate={item.endDate}
              onChange={(start, end) => handleDateRangeChange(item.id, start, end)}
            />
          </FormField>

          <FormField label={t('work.description')} required hint={t('work.descriptionHint')}>
            <RichTextEditor
              value={item.description}
              onChange={(v) => updateItem(item.id, { description: v })}
              aiContext={{ moduleType: 'work', targetPosition: t('work.description'), moduleInstanceId: item.id }}
              placeholder={t('work.descriptionPlaceholder')}
              minRows={5}
            />
          </FormField>
        </div>
      ))}

      <Button variant="secondary" onClick={addItem} className="w-full">
        <Plus className="w-4 h-4" />
        {t('work.addItem')}{currentTitle}
      </Button>

      {deleteConfirmDialog}
    </div>
  )
}

export default WorkForm
