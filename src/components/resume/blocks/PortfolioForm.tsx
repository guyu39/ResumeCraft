// ============================================================
// PortfolioForm — 作品链接编辑表单
// ============================================================

import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { PortfolioItem } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import FormField, { TextInput, Button } from '@/components/common/FormField'
import useDeleteConfirm from '@/hooks/useDeleteConfirm'
import { useI18n } from '@/hooks/useI18n'

interface PortfolioFormProps {
  moduleId: string
  items: PortfolioItem[]
}

const PortfolioForm: React.FC<PortfolioFormProps> = ({ moduleId, items }) => {
  const { updateModuleData } = useResumeStore()
  const { requestDelete, deleteConfirmDialog } = useDeleteConfirm()
  const { t } = useI18n()

  const update = (newItems: PortfolioItem[]) => {
    updateModuleData(moduleId, { items: newItems } as unknown as Partial<{ items: PortfolioItem[] }>)
  }

  const addItem = () => {
    update([...items, { id: `port-${Date.now()}`, title: '', url: '', description: '' }])
  }

  const removeItem = (id: string) => {
    requestDelete({
      onConfirm: () => update(items.filter((item) => item.id !== id)),
    })
  }

  const updateItem = (id: string, partial: Partial<PortfolioItem>) => {
    // 使用函数式更新，基于 store 中最新数据构造更新，避免陈旧闭包
    updateModuleData(moduleId, (prev) => ({
      items: ((prev as { items: PortfolioItem[] }).items ?? items).map((item) => (item.id === id ? { ...item, ...partial } : item)),
    }) as unknown as Partial<{ items: PortfolioItem[] }>)
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
          <FormField label={t('portfolio.title')} required>
            <TextInput value={item.title} onChange={(v) => updateItem(item.id, { title: v })} placeholder={t('portfolio.titlePlaceholder')} />
          </FormField>
          <FormField label={t('portfolio.link')} required>
            <TextInput value={item.url} onChange={(v) => updateItem(item.id, { url: v })} placeholder="https://yoursite.com" type="url" />
          </FormField>
          <FormField label={t('portfolio.description')}>
            <TextInput value={item.description} onChange={(v) => updateItem(item.id, { description: v })} placeholder={t('portfolio.descriptionPlaceholder')} />
          </FormField>
        </div>
      ))}
      <Button variant="secondary" onClick={addItem} className="w-full">
        <Plus className="w-4 h-4" />
        {t('portfolio.addLink')}
      </Button>

      {deleteConfirmDialog}
    </div>
  )
}

export default PortfolioForm
