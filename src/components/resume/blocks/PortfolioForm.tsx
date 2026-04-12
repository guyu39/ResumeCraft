// ============================================================
// PortfolioForm — 作品集链接编辑表单
// ============================================================

import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { PortfolioItem } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import FormField, { TextInput, Button } from '@/components/common/FormField'
import useDeleteConfirm from '@/hooks/useDeleteConfirm'

interface PortfolioFormProps {
  moduleId: string
  items: PortfolioItem[]
}

const PortfolioForm: React.FC<PortfolioFormProps> = ({ moduleId, items }) => {
  const { updateModuleData } = useResumeStore()
  const { requestDelete, deleteConfirmDialog } = useDeleteConfirm()

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
          <FormField label="标题" required>
            <TextInput value={item.title} onChange={(v) => updateItem(item.id, { title: v })} placeholder="个人博客" />
          </FormField>
          <FormField label="链接" required>
            <TextInput value={item.url} onChange={(v) => updateItem(item.id, { url: v })} placeholder="https://yoursite.com" type="url" />
          </FormField>
          <FormField label="简短描述">
            <TextInput value={item.description} onChange={(v) => updateItem(item.id, { description: v })} placeholder="记录技术学习和项目总结" />
          </FormField>
        </div>
      ))}
      <Button variant="secondary" onClick={addItem} className="w-full">
        <Plus className="w-4 h-4" />
        添加链接
      </Button>

      {deleteConfirmDialog}
    </div>
  )
}

export default PortfolioForm