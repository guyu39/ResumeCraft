// ============================================================
// AwardsForm — 荣誉奖项编辑表单
// ============================================================

import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { AwardItem } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import FormField, { TextInput, Select, Button } from '@/components/common/FormField'
import YearMonthPicker from '@/components/common/YearMonthPicker'
import useDeleteConfirm from '@/hooks/useDeleteConfirm'
import { useI18n } from '@/hooks/useI18n'

interface AwardsFormProps {
  moduleId: string
  items: AwardItem[]
}

const AwardsForm: React.FC<AwardsFormProps> = ({ moduleId, items }) => {
  const { updateModuleData } = useResumeStore()
  const { requestDelete, deleteConfirmDialog } = useDeleteConfirm()
  const { t } = useI18n()

  const AWARD_LEVEL_OPTIONS = [
    { label: t('enum.selectLevel'), value: '' },
    { label: t('enum.collegeLevel'), value: '院级' },
    { label: t('enum.schoolLevel'), value: '校级' },
    { label: t('enum.cityLevel'), value: '市级' },
    { label: t('enum.provinceLevel'), value: '省级' },
    { label: t('enum.nationalLevel'), value: '国家级' },
    { label: t('enum.internationalLevel'), value: '国际级' },
    { label: t('enum.otherLevel'), value: '其他' },
  ]

  const update = (newItems: AwardItem[]) => {
    updateModuleData(moduleId, { items: newItems } as unknown as Partial<{ items: AwardItem[] }>)
  }

  const addItem = () => {
    update([...items, { id: `award-${Date.now()}`, name: '', level: '', date: '', description: '' }])
  }

  const removeItem = (id: string) => {
    requestDelete({
      onConfirm: () => update(items.filter((item) => item.id !== id)),
    })
  }

  const updateItem = (id: string, partial: Partial<AwardItem>) => {
    // 使用函数式更新，基于 store 中最新数据构造更新，避免陈旧闭包
    updateModuleData(moduleId, (prev) => ({
      items: ((prev as { items: AwardItem[] }).items ?? items).map((item) => (item.id === id ? { ...item, ...partial } : item)),
    }) as unknown as Partial<{ items: AwardItem[] }>)
  }

  return (
    <div className="editor-form-root space-y-5">
      {items.map((item, index) => (
        <div key={item.id} className="editor-block-card rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400">{t('common.itemN', { n: index + 1 })}</span>
            {items.length > 1 && (
              <Button variant="danger" size="sm" onClick={() => removeItem(item.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
          <FormField label={t('awards.awardName')} required>
            <TextInput value={item.name} onChange={(v) => updateItem(item.id, { name: v })} placeholder={t('awards.awardNamePlaceholder')} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label={t('awards.awardLevel')}>
              <Select
                value={item.level ?? ''}
                onChange={(v) => updateItem(item.id, { level: v })}
                options={AWARD_LEVEL_OPTIONS}
              />
            </FormField>
            <FormField label={t('awards.awardTime')} required>
              <YearMonthPicker value={item.date} onChange={(v) => updateItem(item.id, { date: v })} />
            </FormField>
          </div>
          <FormField label={t('awards.description')}>
            <TextInput value={item.description} onChange={(v) => updateItem(item.id, { description: v })} placeholder={t('awards.descriptionPlaceholder')} />
          </FormField>
        </div>
      ))}
      <Button variant="secondary" onClick={addItem} className="w-full">
        <Plus className="w-4 h-4" />
        {t('awards.addAward')}
      </Button>

      {deleteConfirmDialog}
    </div>
  )
}

export default AwardsForm
