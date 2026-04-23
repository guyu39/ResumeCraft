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

interface AwardsFormProps {
  moduleId: string
  items: AwardItem[]
}

const AWARD_LEVEL_OPTIONS = [
  { label: '请选择等级', value: '' },
  { label: '院级', value: '院级' },
  { label: '校级', value: '校级' },
  { label: '市级', value: '市级' },
  { label: '省级', value: '省级' },
  { label: '国家级', value: '国家级' },
  { label: '国际级', value: '国际级' },
  { label: '其他', value: '其他' },
]

const AwardsForm: React.FC<AwardsFormProps> = ({ moduleId, items }) => {
  const { updateModuleData } = useResumeStore()
  const { requestDelete, deleteConfirmDialog } = useDeleteConfirm()

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
    update(items.map((item) => (item.id === id ? { ...item, ...partial } : item)))
  }

  return (
    <div className="editor-form-root space-y-5">
      {items.map((item, index) => (
        <div key={item.id} className="editor-block-card rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400">第 {index + 1} 条</span>
            {items.length > 1 && (
              <Button variant="danger" size="sm" onClick={() => removeItem(item.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
          <FormField label="奖项名称" required>
            <TextInput value={item.name} onChange={(v) => updateItem(item.id, { name: v })} placeholder="校级一等奖学金" />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="奖项等级">
              <Select
                value={item.level ?? ''}
                onChange={(v) => updateItem(item.id, { level: v })}
                options={AWARD_LEVEL_OPTIONS}
              />
            </FormField>
            <FormField label="获得时间" required>
              <YearMonthPicker value={item.date} onChange={(v) => updateItem(item.id, { date: v })} />
            </FormField>
          </div>
          <FormField label="说明">
            <TextInput value={item.description} onChange={(v) => updateItem(item.id, { description: v })} placeholder="全院前 5%" />
          </FormField>
        </div>
      ))}
      <Button variant="secondary" onClick={addItem} className="w-full">
        <Plus className="w-4 h-4" />
        添加奖项
      </Button>

      {deleteConfirmDialog}
    </div>
  )
}

export default AwardsForm