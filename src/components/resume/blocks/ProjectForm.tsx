// ============================================================
// ProjectForm — 项目经历编辑表单
// ============================================================

import React from 'react'
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { ProjectItem } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import FormField, { TextInput, Button } from '@/components/common/FormField'
import ModernDateRangePicker from '@/components/common/ModernDateRangePicker'
import TagInput from '@/components/common/TagInput'
import RichTextEditor from '@/components/common/RichTextEditor'
import useDeleteConfirm from '@/hooks/useDeleteConfirm'

interface ProjectFormProps {
  moduleId: string
  items: ProjectItem[]
}

const ProjectForm: React.FC<ProjectFormProps> = ({ moduleId, items }) => {
  const { updateModuleData } = useResumeStore()
  const { requestDelete, deleteConfirmDialog } = useDeleteConfirm()

  const update = (newItems: ProjectItem[]) => {
    updateModuleData(moduleId, { items: newItems } as unknown as Partial<{ items: ProjectItem[] }>)
  }

  const addItem = () => {
    update([
      ...items,
      { id: `proj-${Date.now()}`, name: '', role: '', startDate: '', endDate: '', description: '', link: '', techStack: [] },
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

  const updateItem = (id: string, partial: Partial<ProjectItem>) => {
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
            <span className="text-xs font-medium text-gray-400">第 {index + 1} 条</span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => moveItem(index, 'up')}
                disabled={index === 0}
              >
                <ArrowUp className="w-3.5 h-3.5" />
                上移
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => moveItem(index, 'down')}
                disabled={index === items.length - 1}
              >
                <ArrowDown className="w-3.5 h-3.5" />
                下移
              </Button>
              {items.length > 1 && (
                <Button variant="danger" size="sm" onClick={() => removeItem(item.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                  删除
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4">
            <FormField label="项目名称" required>
              <TextInput value={item.name} onChange={(v) => updateItem(item.id, { name: v })} placeholder="企业内部管理系统" />
            </FormField>
            <FormField label="担任角色" required>
              <TextInput value={item.role} onChange={(v) => updateItem(item.id, { role: v })} placeholder="前端负责人" />
            </FormField>
          </div>

          <FormField label="项目时间" required>
            <ModernDateRangePicker
              startDate={item.startDate}
              endDate={item.endDate}
              onChange={(start, end) => handleDateRangeChange(item.id, start, end)}
            />
          </FormField>

          <FormField label="项目链接">
            <TextInput value={item.link} onChange={(v) => updateItem(item.id, { link: v })} placeholder="https://github.com/..." type="url" />
          </FormField>

          <FormField label="项目描述" required hint="请简要描述项目背景、你的职责和取得的成果">
            <RichTextEditor
              value={item.description}
              onChange={(v) => updateItem(item.id, { description: v })}
              aiContext={{ moduleType: 'project', targetPosition: '项目描述' }}
              placeholder="描述项目背景、你的职责和取得的成果"
              minRows={4}
            />
          </FormField>

          <div onClick={(e) => e.stopPropagation()}>
            <FormField label="技术栈">
              <TagInput value={item.techStack} onChange={(v) => updateItem(item.id, { techStack: v })} placeholder="React, TypeScript" />
            </FormField>
          </div>
        </div>
      ))}

      <Button variant="secondary" onClick={addItem} className="w-full">
        <Plus className="w-4 h-4" />
        添加一个项目
      </Button>

      {deleteConfirmDialog}
    </div>
  )
}

export default ProjectForm