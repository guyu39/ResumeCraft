// ============================================================
// PersonalForm — 个人信息编辑表单
// ============================================================

import React, { useState, useRef } from 'react'
import { Upload, X, User, Plus, Trash2 } from 'lucide-react'
import { PersonalData } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import FormField, { TextInput, Select } from '@/components/common/FormField'
import { WORK_YEARS_OPTIONS } from '@/types/resume'
import YearMonthPicker from '@/components/common/YearMonthPicker'
import { uploadAvatar } from '@/api/upload'
import { useI18n } from '@/hooks/useI18n'

interface PersonalFormProps {
  moduleId: string
  data: PersonalData
}

interface FieldErrors {
  name?: string
  targetPosition?: string
  phone?: string
  email?: string
  city?: string
  age?: string
  hometown?: string
}

const PersonalForm: React.FC<PersonalFormProps> = ({ moduleId, data }) => {
  const { updateModuleData } = useResumeStore()
  const { t, te } = useI18n()
  const [errors, setErrors] = useState<FieldErrors>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentYear = new Date().getFullYear()
  const avatarShape = data.avatarShape ?? 'circle'

  // i18n 下拉选项
  const POLITICS_OPTIONS = [
    { label: t('personal.selectPlaceholder'), value: '' },
    { label: t('enum.masses'), value: '群众' },
    { label: t('enum.leagueMember'), value: '共青团员' },
    { label: t('enum.partyMember'), value: '中共党员' },
    { label: t('enum.probationaryMember'), value: '中共预备党员' },
    { label: t('enum.democraticParty'), value: '民主党派' },
  ]

  const GENDER_OPTIONS = [
    { label: t('personal.selectOptional'), value: '' },
    { label: t('enum.male'), value: '男' },
    { label: t('enum.female'), value: '女' },
  ]

  const EDUCATION_OPTIONS = [
    { label: t('personal.selectOptional'), value: '' },
    { label: t('enum.juniorHigh'), value: '初中' },
    { label: t('enum.secondaryVocational'), value: '中专' },
    { label: t('enum.highSchool'), value: '高中' },
    { label: t('enum.associate'), value: '大专' },
    { label: t('enum.bachelor'), value: '本科' },
    { label: t('enum.master'), value: '硕士' },
    { label: t('enum.doctorate'), value: '博士' },
  ]

  const validateEmail = (v: string) =>
    !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : t('personal.invalidEmail')

  const validatePhone = (v: string) =>
    !v || /^1[3-9]\d{9}$/.test(v.replace(/\s|-/g, '')) ? null : t('personal.invalidPhone')

  const update = <K extends keyof PersonalData>(key: K, value: PersonalData[K]) => {
    updateModuleData(moduleId, { [key]: value } as Partial<PersonalData>)
  }

  const extraInfos = data.extraInfos ?? []

  const addExtraInfo = () => {
    // 使用函数式更新，基于 store 中最新 extraInfos 构造更新，避免陈旧闭包
    updateModuleData(moduleId, (prev) => {
      const prevExtra = (prev as PersonalData).extraInfos ?? []
      return { extraInfos: [...prevExtra, { id: `extra-${Date.now()}`, title: '', value: '' }] }
    })
  }

  const removeExtraInfo = (id: string) => {
    updateModuleData(moduleId, (prev) => {
      const prevExtra = (prev as PersonalData).extraInfos ?? []
      return { extraInfos: prevExtra.filter((item) => item.id !== id) }
    })
  }

  const updateExtraInfo = (id: string, partial: { title?: string; value?: string }) => {
    updateModuleData(moduleId, (prev) => {
      const prevExtra = (prev as PersonalData).extraInfos ?? []
      return { extraInfos: prevExtra.map((item) => (item.id === id ? { ...item, ...partial } : item)) }
    })
  }

  const handleBlur = (field: keyof FieldErrors) => {
    setTouched((t) => ({ ...t, [field]: true }))
    const validators: Record<string, () => string | null> = {
      name: () => null,
      targetPosition: () => null,
      email: () => validateEmail(data.email),
      phone: () => validatePhone(data.phone),
      age: () => null,
      hometown: () => null,
    }
    const fn = validators[field]
    if (fn) {
      const err = fn()
      setErrors((e) => ({ ...e, [field]: err ?? undefined }))
    }
  }

  const hasError = (field: keyof FieldErrors) =>
    touched[field] && !!errors[field]

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert(t('personal.selectImageFile'))
      return
    }
    if (file.size > 1 * 1024 * 1024) {
      try {
        const { avatarUrl } = await uploadAvatar(file)
        update('avatar', avatarUrl)
      } catch {
        alert(t('personal.avatarUploadFailed'))
      }
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result as string
      update('avatar', result)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="editor-form-root space-y-5">
      {/* 头像上传区 */}
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0">
          {data.avatar ? (
            <img
              src={data.avatar}
              alt={t('personal.avatar')}
              className={`w-24 h-24 object-cover border-2 border-gray-200 ${avatarShape === 'square' ? 'rounded-lg' : 'rounded-full'}`}
            />
          ) : (
            <div className={`w-24 h-24 bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300 ${avatarShape === 'square' ? 'rounded-lg' : 'rounded-full'}`}>
              <User className="w-8 h-8 text-gray-400" />
            </div>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center shadow-md hover:bg-primary/90"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
          {data.avatar && (
            <button
              type="button"
              onClick={() => update('avatar', '')}
              className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700">{t('personal.personalAvatar')}</p>
          <p className="text-xs text-gray-400 mt-0.5">{t('personal.avatarUploadHint')}</p>
          <div className="mt-2 inline-flex rounded-lg border border-gray-200 p-0.5 bg-white">
            <button
              type="button"
              onClick={() => update('avatarShape', 'circle')}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${avatarShape === 'circle' ? 'bg-primary/10 text-primary' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {t('personal.circle')}
            </button>
            <button
              type="button"
              onClick={() => update('avatarShape', 'square')}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${avatarShape === 'square' ? 'bg-primary/10 text-primary' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {t('personal.square')}
            </button>
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
      </div>

      {/* 基本信息 */}
      <div className="space-y-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('personal.basicInfo')}</h4>

        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('personal.name')} required error={hasError('name')}>
            <TextInput value={data.name} onChange={(v) => update('name', v)} onBlur={() => handleBlur('name')} placeholder={t('personal.namePlaceholder')} error={hasError('name')} maxLength={50} />
          </FormField>
          <FormField label={t('personal.jobIntention')} required error={hasError('targetPosition')}>
            <TextInput value={data.targetPosition} onChange={(v) => update('targetPosition', v)} onBlur={() => handleBlur('targetPosition')} placeholder={t('personal.jobIntentionPlaceholder')} error={hasError('targetPosition')} maxLength={100} />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('personal.birthDate')} required error={hasError('age')}>
            <div onBlur={() => handleBlur('age')}>
              <YearMonthPicker
                value={data.age}
                onChange={(v) => update('age', v)}
                placeholder={t('personal.birthDatePlaceholder')}
                maxYear={currentYear}
                minYear={1900}
              />
            </div>
          </FormField>
          <FormField label={t('personal.hometown')} required error={hasError('hometown')}>
            <TextInput value={data.hometown} onChange={(v) => update('hometown', v)} onBlur={() => handleBlur('hometown')} placeholder={t('personal.hometownPlaceholder')} error={hasError('hometown')} />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('personal.gender')}>
            <Select value={data.gender ?? ''} onChange={(v) => update('gender', v)} options={GENDER_OPTIONS} />
          </FormField>
          <FormField label={t('personal.education')}>
            <Select value={data.education ?? ''} onChange={(v) => update('education', v)} options={EDUCATION_OPTIONS} />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('personal.politics')}>
            <Select value={data.politics} onChange={(v) => update('politics', v)} options={POLITICS_OPTIONS} />
          </FormField>
          <FormField label={t('personal.workYears')}>
            <Select value={data.workYears} onChange={(v) => update('workYears', v)} options={[{ label: t('personal.selectOptional'), value: '' }, ...WORK_YEARS_OPTIONS.map((v) => ({ label: te(v), value: v }))]} />
          </FormField>
        </div>
      </div>

      {/* 联系方式 */}
      <div className="space-y-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('personal.contactInfo')}</h4>
        <FormField label={t('personal.phone')} required error={hasError('phone')}>
          <TextInput value={data.phone} onChange={(v) => update('phone', v)} onBlur={() => handleBlur('phone')} placeholder={t('personal.phonePlaceholder')} error={hasError('phone')} type="tel" />
        </FormField>
        <FormField label={t('personal.email')} required error={hasError('email')}>
          <TextInput value={data.email} onChange={(v) => update('email', v)} onBlur={() => handleBlur('email')} placeholder="example@email.com" error={hasError('email')} type="email" />
        </FormField>
        <FormField label={t('personal.personalAccount')}>
          <TextInput value={data.personalAccount ?? ''} onChange={(v) => update('personalAccount', v)} placeholder={t('personal.personalAccountPlaceholder')} />
        </FormField>
        <FormField label={t('personal.city')}>
          <TextInput value={data.city} onChange={(v) => update('city', v)} placeholder={t('personal.cityPlaceholder')} />
        </FormField>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('personal.otherInfo')}</h4>
          <button
            type="button"
            onClick={addExtraInfo}
            className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
          >
            <Plus className="w-3.5 h-3.5" /> {t('personal.add')}
          </button>
        </div>

        {extraInfos.length === 0 ? (
          <p className="text-xs text-gray-400">{t('personal.noOtherInfo')}</p>
        ) : (
          <div className="space-y-3">
            {extraInfos.map((item) => (
              <div key={item.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <TextInput
                  value={item.title}
                  onChange={(v) => updateExtraInfo(item.id, { title: v })}
                  placeholder={t('personal.otherTitlePlaceholder')}
                />
                <TextInput
                  value={item.value}
                  onChange={(v) => updateExtraInfo(item.id, { value: v })}
                  placeholder={t('personal.otherValuePlaceholder')}
                />
                <button
                  type="button"
                  onClick={() => removeExtraInfo(item.id)}
                  className="h-9 w-9 rounded-md border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200"
                  title={t('common.delete')}
                >
                  <Trash2 className="w-4 h-4 mx-auto" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {Object.values(errors).some(Boolean) && (
        <div className="rounded-lg bg-red-50 border border-red-100 p-3">
          <p className="text-xs text-red-500 font-medium mb-1">{t('personal.fixErrors')}</p>
          {Object.entries(errors).filter(([, v]) => v).map(([k]) => (
            <p key={k} className="text-xs text-red-400">· {errors[k as keyof FieldErrors]}</p>
          ))}
        </div>
      )}
    </div>
  )
}

export default PersonalForm
