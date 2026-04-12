// ============================================================
// PersonalForm — 个人信息编辑表单
// ============================================================

import React, { useState, useRef } from 'react'
import { Upload, X, User, Plus, Trash2 } from 'lucide-react'
import { PersonalData } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import FormField, { TextInput, Select } from '@/components/common/FormField'
import { WORK_YEARS_OPTIONS } from '@/types/resume'
import ModernDatePicker from '@/components/common/ModernDatePicker'

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

const POLITICS_OPTIONS = [
  { label: '请选择', value: '' },
  { label: '群众', value: '群众' },
  { label: '共青团员', value: '共青团员' },
  { label: '中共党员', value: '中共党员' },
  { label: '中共预备党员', value: '中共预备党员' },
  { label: '民主党派', value: '民主党派' },
]

const GENDER_OPTIONS = [
  { label: '请选择（选填）', value: '' },
  { label: '男', value: '男' },
  { label: '女', value: '女' },
]

const EDUCATION_OPTIONS = [
  { label: '请选择（选填）', value: '' },
  { label: '初中', value: '初中' },
  { label: '中专', value: '中专' },
  { label: '高中', value: '高中' },
  { label: '大专', value: '大专' },
  { label: '本科', value: '本科' },
  { label: '硕士', value: '硕士' },
  { label: '博士', value: '博士' },
]

const validateEmail = (v: string) =>
  !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : '请输入有效的邮箱地址'

const validatePhone = (v: string) =>
  !v || /^1[3-9]\d{9}$/.test(v.replace(/\s|-/g, '')) ? null : '请输入有效的手机号'

const PersonalForm: React.FC<PersonalFormProps> = ({ moduleId, data }) => {
  const { updateModuleData } = useResumeStore()
  const [errors, setErrors] = useState<FieldErrors>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const 当前年份 = new Date().getFullYear()
  const avatarShape = data.avatarShape ?? 'circle'

  const update = <K extends keyof PersonalData>(key: K, value: PersonalData[K]) => {
    updateModuleData(moduleId, { [key]: value } as Partial<PersonalData>)
  }

  const extraInfos = data.extraInfos ?? []

  const addExtraInfo = () => {
    update('extraInfos', [...extraInfos, { id: `extra-${Date.now()}`, title: '', value: '' }])
  }

  const removeExtraInfo = (id: string) => {
    update('extraInfos', extraInfos.filter((item) => item.id !== id))
  }

  const updateExtraInfo = (id: string, partial: { title?: string; value?: string }) => {
    update(
      'extraInfos',
      extraInfos.map((item) => (item.id === id ? { ...item, ...partial } : item))
    )
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

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件')
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
              alt="头像"
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
          <p className="text-sm font-medium text-gray-700">个人头像</p>
          <p className="text-xs text-gray-400 mt-0.5">点击按钮上传，支持 JPG/PNG</p>
          <div className="mt-2 inline-flex rounded-lg border border-gray-200 p-0.5 bg-white">
            <button
              type="button"
              onClick={() => update('avatarShape', 'circle')}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${avatarShape === 'circle' ? 'bg-primary/10 text-primary' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              圆形
            </button>
            <button
              type="button"
              onClick={() => update('avatarShape', 'square')}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${avatarShape === 'square' ? 'bg-primary/10 text-primary' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              方形
            </button>
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
      </div>

      {/* 基本信息 */}
      <div className="space-y-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">基本信息</h4>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="姓名" required error={hasError('name')}>
            <TextInput value={data.name} onChange={(v) => update('name', v)} onBlur={() => handleBlur('name')} placeholder="张三" error={hasError('name')} maxLength={50} />
          </FormField>
          <FormField label="求职意向" required error={hasError('targetPosition')}>
            <TextInput value={data.targetPosition} onChange={(v) => update('targetPosition', v)} onBlur={() => handleBlur('targetPosition')} placeholder="前端开发工程师" error={hasError('targetPosition')} maxLength={100} />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="出生年月" required error={hasError('age')}>
            <div onBlur={() => handleBlur('age')}>
              <ModernDatePicker
                value={data.age}
                onChange={(v) => update('age', v)}
                placeholder="选择出生年月"
                maxYear={当前年份}
                minYear={1900}
                showPresentOption={false}
              />
            </div>
          </FormField>
          <FormField label="籍贯" required error={hasError('hometown')}>
            <TextInput value={data.hometown} onChange={(v) => update('hometown', v)} onBlur={() => handleBlur('hometown')} placeholder="北京市海淀区" error={hasError('hometown')} />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="性别">
            <Select value={data.gender ?? ''} onChange={(v) => update('gender', v)} options={GENDER_OPTIONS} />
          </FormField>
          <FormField label="学历">
            <Select value={data.education ?? ''} onChange={(v) => update('education', v)} options={EDUCATION_OPTIONS} />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="政治面貌">
            <Select value={data.politics} onChange={(v) => update('politics', v)} options={POLITICS_OPTIONS} />
          </FormField>
          <FormField label="工作年限">
            <Select value={data.workYears} onChange={(v) => update('workYears', v)} options={[{ label: '请选择（选填）', value: '' }, ...WORK_YEARS_OPTIONS.map((v) => ({ label: v, value: v }))]} />
          </FormField>
        </div>
      </div>

      {/* 联系方式 */}
      <div className="space-y-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">联系方式</h4>
        <FormField label="手机号" required error={hasError('phone')}>
          <TextInput value={data.phone} onChange={(v) => update('phone', v)} onBlur={() => handleBlur('phone')} placeholder="138-0000-0000" error={hasError('phone')} type="tel" />
        </FormField>
        <FormField label="邮箱" required error={hasError('email')}>
          <TextInput value={data.email} onChange={(v) => update('email', v)} onBlur={() => handleBlur('email')} placeholder="example@email.com" error={hasError('email')} type="email" />
        </FormField>
        <FormField label="所在城市（选填）">
          <TextInput value={data.city} onChange={(v) => update('city', v)} placeholder="北京市" />
        </FormField>
      </div>

      {/* 个人链接 */}
      {/* <div className="space-y-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">个人链接（选填）</h4>
        <FormField label="个人网站">
          <TextInput value={data.website} onChange={(v) => update('website', v)} placeholder="https://yoursite.com" type="url" />
        </FormField>
        <FormField label="GitHub">
          <TextInput value={data.github} onChange={(v) => update('github', v)} placeholder="https://github.com/username" type="url" />
        </FormField>
        <FormField label="LinkedIn">
          <TextInput value={data.linkedin} onChange={(v) => update('linkedin', v)} placeholder="https://linkedin.com/in/username" type="url" />
        </FormField>
      </div> */}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">补充其他信息（标题：值）</h4>
          <button
            type="button"
            onClick={addExtraInfo}
            className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
          >
            <Plus className="w-3.5 h-3.5" /> 添加
          </button>
        </div>

        {extraInfos.length === 0 ? (
          <p className="text-xs text-gray-400">暂无补充信息，可添加如：期望薪资、到岗时间、婚姻状况等</p>
        ) : (
          <div className="space-y-3">
            {extraInfos.map((item) => (
              <div key={item.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <TextInput
                  value={item.title}
                  onChange={(v) => updateExtraInfo(item.id, { title: v })}
                  placeholder="标题，如：期望薪资"
                />
                <TextInput
                  value={item.value}
                  onChange={(v) => updateExtraInfo(item.id, { value: v })}
                  placeholder="值，如：20k-30k"
                />
                <button
                  type="button"
                  onClick={() => removeExtraInfo(item.id)}
                  className="h-9 w-9 rounded-md border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200"
                  title="删除"
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
          <p className="text-xs text-red-500 font-medium mb-1">请修正以下问题：</p>
          {Object.entries(errors).filter(([, v]) => v).map(([k]) => (
            <p key={k} className="text-xs text-red-400">· {errors[k as keyof FieldErrors]}</p>
          ))}
        </div>
      )}
    </div>
  )
}

export default PersonalForm