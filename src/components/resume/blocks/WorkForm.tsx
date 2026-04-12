// ============================================================
// WorkForm — 工作经历编辑表单
// ============================================================

import React from 'react'
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { WorkItem } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import FormField, { TextInput, Select, Button } from '@/components/common/FormField'
import ModernDateRangePicker from '@/components/common/ModernDateRangePicker'
import RichTextEditor from '@/components/common/RichTextEditor'
import useDeleteConfirm from '@/hooks/useDeleteConfirm'

const COMPANY_SIZE_OPTIONS = [
  { label: '请选择（选填）', value: '' },
  { label: '少于15人', value: '少于15人' },
  { label: '15-50人', value: '15-50人' },
  { label: '50-150人', value: '50-150人' },
  { label: '150-500人', value: '150-500人' },
  { label: '500-2000人', value: '500-2000人' },
  { label: '2000-10000人', value: '2000-10000人' },
  { label: '10000人以上', value: '10000人以上' },
]

interface WorkFormProps {
  moduleId: string
  items: WorkItem[]
}

const WorkForm: React.FC<WorkFormProps> = ({ moduleId, items }) => {
  const { resume, updateModuleData, updateModuleTitle } = useResumeStore()
  const { requestDelete, deleteConfirmDialog } = useDeleteConfirm()
  const currentModule = resume.modules.find((module) => module.id === moduleId)
  const currentTitle = currentModule?.title === '实习经历' ? '实习经历' : '工作经历'

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
    update(items.map((item) => (item.id === id ? { ...item, ...partial } : item)))
  }

  const handleDateRangeChange = (id: string, start: string, end: string) => {
    updateItem(id, { startDate: start, endDate: end })
  }

  return (
    <div className="editor-form-root space-y-5">
      <FormField label="模块名称">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={currentTitle === '工作经历' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => updateModuleTitle(moduleId, '工作经历')}
          >
            工作经历
          </Button>
          <Button
            type="button"
            variant={currentTitle === '实习经历' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => updateModuleTitle(moduleId, '实习经历')}
          >
            实习经历
          </Button>
        </div>
      </FormField>

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
            <FormField label="公司名称" required>
              <TextInput value={item.company} onChange={(v) => updateItem(item.id, { company: v })} placeholder="腾讯科技" />
            </FormField>
            <FormField label="职位名称" required>
              <TextInput value={item.position} onChange={(v) => updateItem(item.id, { position: v })} placeholder="高级前端开发工程师" />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-x-4">
            <FormField label="公司规模">
              <Select
                value={item.companySize}
                onChange={(v) => updateItem(item.id, { companySize: v })}
                options={COMPANY_SIZE_OPTIONS}
              />
            </FormField>
            <FormField label="部门名称">
              <TextInput value={item.department ?? ''} onChange={(v) => updateItem(item.id, { department: v })} placeholder="技术研发部（选填）" />
            </FormField>
          </div>

          <FormField label="工作时间" required>
            <ModernDateRangePicker
              startDate={item.startDate}
              endDate={item.endDate}
              onChange={(start, end) => handleDateRangeChange(item.id, start, end)}
            />
          </FormField>

          <FormField label="工作描述" required hint="请简要描述你的工作内容、职责和成就，建议使用项目符号分点描述">
            <RichTextEditor
              value={item.description}
              onChange={(v) => updateItem(item.id, { description: v })}
              aiContext={{ moduleType: 'work', targetPosition: '工作描述' }}
              placeholder="负责公司核心产品的前端架构设计与开发"
              minRows={5}
            />
          </FormField>
        </div>
      ))}

      <Button variant="secondary" onClick={addItem} className="w-full">
        <Plus className="w-4 h-4" />
        添加一条{currentTitle}
      </Button>

      {deleteConfirmDialog}
    </div>
  )
}

export default WorkForm