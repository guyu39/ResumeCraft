// ============================================================
// CertificatesForm — 证书资质编辑表单
// ============================================================

import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { CertificateItem } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import FormField, { TextInput, Button } from '@/components/common/FormField'
import YearMonthPicker from '@/components/common/YearMonthPicker'
import useDeleteConfirm from '@/hooks/useDeleteConfirm'

interface CertificatesFormProps {
  moduleId: string
  items: CertificateItem[]
}

const CertificatesForm: React.FC<CertificatesFormProps> = ({ moduleId, items }) => {
  const { updateModuleData } = useResumeStore()
  const { requestDelete, deleteConfirmDialog } = useDeleteConfirm()

  const update = (newItems: CertificateItem[]) => {
    updateModuleData(moduleId, { items: newItems } as unknown as Partial<{ items: CertificateItem[] }>)
  }

  const addItem = () => {
    update([...items, { id: `cert-${Date.now()}`, name: '', date: '', issuer: '' }])
  }

  const removeItem = (id: string) => {
    requestDelete({
      onConfirm: () => update(items.filter((item) => item.id !== id)),
    })
  }

  const updateItem = (id: string, partial: Partial<CertificateItem>) => {
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
          <FormField label="证书名称" required>
            <TextInput value={item.name} onChange={(v) => updateItem(item.id, { name: v })} placeholder="AWS Solutions Architect" />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="获得时间" required>
              <YearMonthPicker value={item.date} onChange={(v) => updateItem(item.id, { date: v })} />
            </FormField>
            <FormField label="颁发机构">
              <TextInput value={item.issuer} onChange={(v) => updateItem(item.id, { issuer: v })} placeholder="AWS 官方" />
            </FormField>
          </div>
        </div>
      ))}
      <Button variant="secondary" onClick={addItem} className="w-full">
        <Plus className="w-4 h-4" />
        添加证书
      </Button>

      {deleteConfirmDialog}
    </div>
  )
}

export default CertificatesForm