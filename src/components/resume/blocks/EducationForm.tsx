// ============================================================
// EducationForm — 教育经历编辑表单
// ============================================================

import React from 'react'
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { EducationItem, DEGREE_OPTIONS } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import FormField, { TextInput, Select, Button } from '@/components/common/FormField'
import YearMonthRangePicker from '@/components/common/YearMonthRangePicker'
import RichTextEditor from '@/components/common/RichTextEditor'
import useDeleteConfirm from '@/hooks/useDeleteConfirm'

interface EducationFormProps {
  moduleId: string
  items: EducationItem[]
}

const EDUCATION_HONOR_OPTIONS = [
  { label: '请选择（选填）', value: '' },
  { label: '院级', value: '院级' },
  { label: '校级', value: '校级' },
  { label: '市级', value: '市级' },
  { label: '省级', value: '省级' },
  { label: '国家级', value: '国家级' },
  { label: '国际级', value: '国际级' },
  { label: '其他', value: '其他' },
]

const EducationForm: React.FC<EducationFormProps> = ({ moduleId, items }) => {
  const { updateModuleData } = useResumeStore()
  const { requestDelete, deleteConfirmDialog } = useDeleteConfirm()

  const dateErrorById = items.reduce<Record<string, string>>((acc, item) => {
    if (item.startDate && item.endDate && item.endDate !== '至今' && item.startDate > item.endDate) {
      acc[item.id] = '结束时间不能早于开始时间'
    }
    return acc
  }, {})

  const update = (newItems: EducationItem[]) => {
    updateModuleData(moduleId, { items: newItems } as unknown as Partial<{ items: EducationItem[] }>)
  }

  const addItem = () => {
    update([
      ...items,
      { id: `edu-${Date.now()}`, school: '', major: '', degree: '本科', startDate: '', endDate: '', gpa: '', honors: '', schoolExperience: '' },
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

  const updateItem = (id: string, partial: Partial<EducationItem>) => {
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

          {/* 学校 - 专业 - 学历同一行 */}
          <div className="grid grid-cols-3 gap-x-4">
            <FormField label="学校名称" required>
              <TextInput value={item.school} onChange={(v) => updateItem(item.id, { school: v })} placeholder="清华大学" />
            </FormField>
            <FormField label="专业" required>
              <TextInput value={item.major} onChange={(v) => updateItem(item.id, { major: v })} placeholder="计算机科学与技术" />
            </FormField>
            <FormField label="学历" required>
              <Select value={item.degree} onChange={(v) => updateItem(item.id, { degree: v as typeof item.degree })} options={DEGREE_OPTIONS.map((d) => ({ label: d, value: d }))} />
            </FormField>
          </div>

          {/* 时间范围选择 */}
          <FormField label="在校时间" required>
            <YearMonthRangePicker
              startDate={item.startDate}
              endDate={item.endDate}
              onChange={(start, end) => handleDateRangeChange(item.id, start, end)}
              futureYears={10}
            />
            {dateErrorById[item.id] && (
              <p className="text-[12px] text-red-500 mt-1">{dateErrorById[item.id]}</p>
            )}
          </FormField>

          {/* GPA / 荣誉 */}
          <div className="grid grid-cols-2 gap-x-4">
            <FormField label="GPA / 排名">
              <TextInput value={item.gpa} onChange={(v) => updateItem(item.id, { gpa: v })} placeholder="3.8/4.0" />
            </FormField>
            <FormField label="荣誉 / 奖项">
              <Select
                value={item.honors}
                onChange={(v) => updateItem(item.id, { honors: v })}
                options={EDUCATION_HONOR_OPTIONS}
              />
            </FormField>
          </div>

          <FormField label="在校经历" hint="可填写学生组织、科研、竞赛、社会实践等经历">
            <RichTextEditor
              value={item.schoolExperience || ''}
              onChange={(v) => updateItem(item.id, { schoolExperience: v })}
              aiContext={{ moduleType: 'education', targetPosition: '在校经历', moduleInstanceId: item.id }}
              placeholder="例如：学生会技术部部长，组织校级活动 3 场，参与导师课题，负责数据清洗与分析"
              minRows={4}
            />
          </FormField>
        </div>
      ))}

      <Button variant="secondary" onClick={addItem} className="w-full">
        <Plus className="w-4 h-4" />
        添加教育经历
      </Button>

      {deleteConfirmDialog}
    </div>
  )
}

export default EducationForm