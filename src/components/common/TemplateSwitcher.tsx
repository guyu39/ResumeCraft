// ============================================================
// TemplateSwitcher — 模板切换器
// ============================================================

import React from 'react'
import { ResumeLocale, TemplateType } from '@/types/resume'

interface TemplateSwitcherProps {
  value: TemplateType
  locale?: ResumeLocale
  onChange: (t: TemplateType) => void
}

const TEMPLATES: Record<ResumeLocale, Array<{ id: TemplateType; label: string; desc: string }>> = {
  'zh-CN': [
    { id: 'classic', label: '经典单栏', desc: '传统行业适用' },
    { id: 'modern', label: '现代双栏', desc: '互联网科技公司' },
    { id: 'minimal', label: '简约极简', desc: '设计创意类岗位' },
  ],
  'en-US': [
    { id: 'classic', label: 'Classic', desc: 'General and formal roles' },
    { id: 'modern', label: 'Modern', desc: 'Tech and Internet jobs' },
    { id: 'minimal', label: 'Minimal', desc: 'Design and creative jobs' },
  ],
}

const TemplateSwitcher: React.FC<TemplateSwitcherProps> = ({ value, locale = 'zh-CN', onChange }) => {
  const templates = TEMPLATES[locale]

  return (
    <div className="space-y-2">
      <label className="block text-[13px] font-medium text-gray-700">
        {locale === 'en-US' ? 'Resume Template' : '简历模板'}
      </label>
      <div className="grid grid-cols-3 gap-2">
        {templates.map((t) => {
          const active = value === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={`
                w-full min-w-0 flex flex-col items-center gap-1.5 px-2 py-2 rounded-lg border text-center
                transition-all duration-150
                ${active
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }
              `}
            >
              {/* 模板预览缩略图 */}
              <div
                className={`
                  w-7 h-9 rounded border-2 flex-shrink-0 flex items-center justify-center
                  ${active ? 'border-primary' : 'border-gray-200'}
                `}
              >
                {t.id === 'classic' && (
                  <div className="w-full h-full p-0.5 flex flex-col gap-0.5">
                    <div className="h-1.5 bg-current rounded-sm opacity-30" />
                    <div className="flex-1 flex flex-col gap-0.5 px-0.5">
                      <div className="h-0.5 bg-current rounded-sm opacity-20" />
                      <div className="h-0.5 bg-current rounded-sm opacity-20" />
                      <div className="h-0.5 bg-current rounded-sm opacity-20" />
                    </div>
                  </div>
                )}
                {t.id === 'modern' && (
                  <div className="w-full h-full flex">
                    <div className="w-3 h-full bg-current opacity-20" />
                    <div className="flex-1 flex flex-col gap-0.5 p-0.5">
                      <div className="h-0.5 bg-current rounded-sm opacity-30" />
                      <div className="flex-1 flex flex-col gap-0.5 px-0.5">
                        <div className="h-0.5 bg-current rounded-sm opacity-20" />
                        <div className="h-0.5 bg-current rounded-sm opacity-20" />
                      </div>
                    </div>
                  </div>
                )}
                {t.id === 'minimal' && (
                  <div className="w-full h-full p-0.5 flex flex-col gap-0.5">
                    <div className="h-1.5 bg-current rounded-sm opacity-30 mx-auto w-1/2" />
                    <div className="flex-1 flex flex-col gap-0.5 px-0.5 mt-1">
                      <div className="h-0.5 bg-current rounded-sm opacity-15 mx-auto w-full" />
                      <div className="h-0.5 bg-current rounded-sm opacity-15 mx-auto w-4/5" />
                    </div>
                  </div>
                )}
              </div>

              {/* 标签 */}
              <div className="w-full min-w-0">
                <p className={`text-[11px] font-semibold truncate ${active ? '' : 'text-gray-700'}`}>
                  {t.label}
                </p>
                <p className={`text-[10px] truncate ${active ? 'text-primary/60' : 'text-gray-400'}`}>
                  {t.desc}
                </p>
              </div>

              {/* 选中标记 */}
              {active && (
                <span className="text-primary text-xs leading-none flex-shrink-0">✓</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default TemplateSwitcher
