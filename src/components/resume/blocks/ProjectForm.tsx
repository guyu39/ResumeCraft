// ============================================================
// ProjectForm — 项目经历编辑表单
// ============================================================

import React from 'react'
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { ProjectItem } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import FormField, { TextInput, Button } from '@/components/common/FormField'
import YearMonthRangePicker from '@/components/common/YearMonthRangePicker'
import RichTextEditor from '@/components/common/RichTextEditor'
import useDeleteConfirm from '@/hooks/useDeleteConfirm'
import { useI18n } from '@/hooks/useI18n'

interface ProjectFormProps {
  moduleId: string
  items: ProjectItem[]
}

const ProjectForm: React.FC<ProjectFormProps> = ({ moduleId, items }) => {
  const { updateModuleData } = useResumeStore()
  const { requestDelete, deleteConfirmDialog } = useDeleteConfirm()
  const { t } = useI18n()

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
    // 使用函数式更新，基于 store 中最新数据构造更新，避免陈旧闭包
    updateModuleData(moduleId, (prev) => ({
      items: ((prev as { items: ProjectItem[] }).items ?? items).map((item) => (item.id === id ? { ...item, ...partial } : item)),
    }) as unknown as Partial<{ items: ProjectItem[] }>)
  }

  const handleDateRangeChange = (id: string, start: string, end: string) => {
    updateItem(id, { startDate: start, endDate: end })
  }

  const parseTechStack = (value: string) =>
    value
      .split('+')
      .map((item) => item.trim())
      .filter(Boolean)

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

          <div className="grid grid-cols-2 gap-x-4">
            <FormField label={t('project.projectName')} required>
              <TextInput value={item.name} onChange={(v) => updateItem(item.id, { name: v })} placeholder={t('project.projectNamePlaceholder')} />
            </FormField>
            <FormField label={t('project.role')} required>
              <TextInput value={item.role} onChange={(v) => updateItem(item.id, { role: v })} placeholder={t('project.rolePlaceholder')} />
            </FormField>
          </div>

          <FormField label={t('project.projectTime')} required>
            <YearMonthRangePicker
              startDate={item.startDate}
              endDate={item.endDate}
              onChange={(start, end) => handleDateRangeChange(item.id, start, end)}
            />
          </FormField>

          <FormField label={t('project.projectLink')}>
            <TextInput value={item.link} onChange={(v) => updateItem(item.id, { link: v })} placeholder="https://github.com/..." type="url" />
          </FormField>

          <FormField label={t('project.description')} required hint={t('project.descriptionHint')}>
            <RichTextEditor
              value={item.description}
              onChange={(v) => updateItem(item.id, { description: v })}
              aiContext={{ moduleType: 'project', targetPosition: t('project.description'), moduleInstanceId: item.id }}
              placeholder={t('project.descriptionPlaceholder')}
              minRows={4}
            />
          </FormField>

          <FormField label={t('project.techStack')} hint={t('project.techStackHint')}>
            <TextInput
              value={(item.techStack ?? []).join(' + ')}
              onChange={(v) => updateItem(item.id, { techStack: parseTechStack(v) })}
              placeholder="React + TypeScript + Vite"
            />
          </FormField>
        </div>
      ))}

      <Button variant="secondary" onClick={addItem} className="w-full">
        <Plus className="w-4 h-4" />
        {t('project.addProject')}
      </Button>

      {deleteConfirmDialog}
    </div>
  )
}

export default ProjectForm
