// ============================================================
// LanguagesForm — 语言能力编辑表单
// ============================================================

import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { LanguageItem } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import FormField, { TextInput, Button } from '@/components/common/FormField'
import useDeleteConfirm from '@/hooks/useDeleteConfirm'
import { useI18n } from '@/hooks/useI18n'

interface LanguagesFormProps {
  moduleId: string
  items: LanguageItem[]
}

const COMMON_LEVELS = ['CET-4', 'CET-6', '雅思 6.0', '雅思 6.5', '雅思 7.0+', '托福 80+', '托福 100+', 'TEM-4', 'TEM-8', '口语流畅', '口语良好', '口语一般']

const LEVEL_I18N_KEYS: Record<string, string> = {
  'CET-4': 'enum.cet4',
  'CET-6': 'enum.cet6',
  '雅思 6.0': 'enum.ielts60',
  '雅思 6.5': 'enum.ielts65',
  '雅思 7.0+': 'enum.ielts70',
  '托福 80+': 'enum.toefl80',
  '托福 100+': 'enum.toefl100',
  'TEM-4': 'enum.tem4',
  'TEM-8': 'enum.tem8',
  '口语流畅': 'enum.fluent',
  '口语良好': 'enum.good',
  '口语一般': 'enum.average',
}

const LanguagesForm: React.FC<LanguagesFormProps> = ({ moduleId, items }) => {
  const { updateModuleData } = useResumeStore()
  const { requestDelete, deleteConfirmDialog } = useDeleteConfirm()
  const { t, te } = useI18n()

  const update = (newItems: LanguageItem[]) => {
    updateModuleData(moduleId, { items: newItems } as unknown as Partial<{ items: LanguageItem[] }>)
  }

  const addItem = () => {
    update([...items, { id: `lang-${Date.now()}`, language: '', level: '' }])
  }

  const removeItem = (id: string) => {
    if (items.length <= 1) return
    requestDelete({
      onConfirm: () => update(items.filter((item) => item.id !== id)),
    })
  }

  const updateItem = (id: string, partial: Partial<LanguageItem>) => {
    update(items.map((item) => (item.id === id ? { ...item, ...partial } : item)))
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
          <div className="grid grid-cols-2 gap-4">
            <FormField label={t('languages.language')} required>
              <TextInput value={item.language} onChange={(v) => updateItem(item.id, { language: v })} placeholder={t('languages.languagePlaceholder')} />
            </FormField>
            <FormField label={t('languages.proficiency')} required>
              <TextInput value={item.level} onChange={(v) => updateItem(item.id, { level: v })} placeholder="CET-6" />
            </FormField>
          </div>
          <div className="flex flex-wrap gap-1">
            {COMMON_LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => updateItem(item.id, { level: l })}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${item.level === l ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
              >
                {te(LEVEL_I18N_KEYS[l]) ? t(LEVEL_I18N_KEYS[l]) : l}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Button variant="secondary" onClick={addItem} className="w-full">
        <Plus className="w-4 h-4" />
        {t('languages.addLanguage')}
      </Button>

      {deleteConfirmDialog}
    </div>
  )
}

export default LanguagesForm
