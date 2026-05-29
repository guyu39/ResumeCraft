// ============================================================
// CustomForm — 自定义模块编辑表单
// ============================================================

import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { CustomData, CustomItem } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import FormField, { TextInput, Button } from '@/components/common/FormField'
import RichTextEditor from '@/components/common/RichTextEditor'
import useDeleteConfirm from '@/hooks/useDeleteConfirm'
import { useI18n } from '@/hooks/useI18n'

interface CustomFormProps {
  moduleId: string
  data: CustomData
}

const CustomForm: React.FC<CustomFormProps> = ({ moduleId, data }) => {
  const { updateModuleData, updateModuleTitle } = useResumeStore()
  const { requestDelete, deleteConfirmDialog } = useDeleteConfirm()
  const { t } = useI18n()

  const buildCustomModuleTitle = (name: string) => name.trim() || '自定义模块'

  const updateData = (partial: Partial<CustomData>) => {
    const nextData = { ...data, ...partial }
    updateModuleData(moduleId, nextData as unknown as Partial<CustomData>)
    if (typeof partial.title === 'string') {
      updateModuleTitle(moduleId, buildCustomModuleTitle(partial.title))
    }
  }

  const updateItem = (id: string, partial: Partial<CustomItem>) => {
    updateData({ items: data.items.map((item) => (item.id === id ? { ...item, ...partial } : item)) })
  }

  const addItem = () => {
    updateData({ items: [...data.items, { id: `custom-${Date.now()}`, title: '', content: '', date: '' }] })
  }

  const removeItem = (id: string) => {
    if (data.items.length <= 1) return
    requestDelete({
      onConfirm: () => updateData({ items: data.items.filter((item) => item.id !== id) }),
    })
  }

  return (
    <div className="editor-form-root space-y-5">
      <FormField label={t('common.moduleName')} hint={t('custom.moduleNameHint')}>
        <TextInput value={data.title} onChange={(v) => updateData({ title: v })} placeholder={t('custom.moduleNamePlaceholder')} />
      </FormField>

      {data.items.map((item, index) => (
        <div key={item.id} className="editor-block-card rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400">{t('common.itemN', { n: index + 1 })}</span>
            {data.items.length > 1 && (
              <Button variant="danger" size="sm" onClick={() => removeItem(item.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
          <FormField label={t('custom.itemTitle')}>
            <TextInput value={item.title} onChange={(v) => updateItem(item.id, { title: v })} placeholder={t('custom.itemTitlePlaceholder')} />
          </FormField>
          <FormField label={t('custom.content')} hint={t('custom.contentHint')}>
            <RichTextEditor
              value={item.content}
              onChange={(v) => updateItem(item.id, { content: v })}
              aiContext={{ moduleType: 'custom', targetPosition: t('custom.content'), moduleInstanceId: item.id }}
              placeholder={t('custom.contentPlaceholder')}
              minRows={3}
            />
          </FormField>
        </div>
      ))}

      <Button variant="secondary" onClick={addItem} className="w-full">
        <Plus className="w-4 h-4" />
        {t('custom.addItem')}
      </Button>

      {deleteConfirmDialog}
    </div>
  )
}

export default CustomForm
