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

interface CustomFormProps {
  moduleId: string
  data: CustomData
}

const CustomForm: React.FC<CustomFormProps> = ({ moduleId, data }) => {
  const { updateModuleData, updateModuleTitle } = useResumeStore()
  const { requestDelete, deleteConfirmDialog } = useDeleteConfirm()

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
      <FormField label="模块名称" hint="将显示在简历中，如「开源贡献」「志愿服务」等">
        <TextInput value={data.title} onChange={(v) => updateData({ title: v })} placeholder="自定义模块名称" />
      </FormField>

      {data.items.map((item, index) => (
        <div key={item.id} className="editor-block-card rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400">第 {index + 1} 条</span>
            {data.items.length > 1 && (
              <Button variant="danger" size="sm" onClick={() => removeItem(item.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
          <FormField label="标题">
            <TextInput value={item.title} onChange={(v) => updateItem(item.id, { title: v })} placeholder="条目标题" />
          </FormField>
          <FormField label="内容" hint="请简要描述该条目的相关信息，建议控制在 50-200 字之间">
            <RichTextEditor
              value={item.content}
              onChange={(v) => updateItem(item.id, { content: v })}
              aiContext={{ moduleType: 'custom', targetPosition: '自定义内容', moduleInstanceId: item.id }}
              placeholder="详细描述..."
              minRows={3}
            />
          </FormField>
        </div>
      ))}

      <Button variant="secondary" onClick={addItem} className="w-full">
        <Plus className="w-4 h-4" />
        添加条目
      </Button>

      {deleteConfirmDialog}
    </div>
  )
}

export default CustomForm