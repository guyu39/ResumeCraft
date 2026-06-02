// ============================================================
// AIEngineeringForm — AI 工程编辑表单（多项目支持）
// ============================================================

import React, { useCallback, useState } from 'react'
import { Plus, X, Sparkles, ShieldCheck, RefreshCw, Trash2 } from 'lucide-react'
import { useResumeStore } from '@/store/resumeStore'
import RichTextEditor from '@/components/common/RichTextEditor'
import YearMonthRangePicker from '@/components/common/YearMonthRangePicker'
import type { AIEngineeringData, AIEngineeringItem, AIStandard, AIEfficiencyMetric } from '@/types/resume'
import { AI_STANDARD_OPTIONS, AI_PRACTICE_PLACEHOLDER, AI_TOOLCHAIN_PLACEHOLDER } from '@/types/resume'

interface Props { moduleId: string; data: AIEngineeringData }

/** 时间格式化辅助函数 */
function parseTimeRangeStart(tr: string) { const m = tr.match(/^(\d{4}\.\d{2})/); return m ? m[1].replace('.', '-') : '' }
function parseTimeRangeEnd(tr: string) { if (tr.includes('至今')) return ''; const m = tr.match(/- (\d{4}\.\d{2})/); return m ? m[1].replace('.', '-') : '' }
function formatTimeRange(start: string, end: string) { return `${start.replace('-', '.')} - ${end ? end.replace('-', '.') : '至今'}` }

const AIEngineeringForm: React.FC<Props> = ({ moduleId, data }) => {
  const items: AIEngineeringItem[] = data?.items?.length ? data.items : [{
    id: crypto.randomUUID(), practiceName: '', role: '', timeRange: '', projectUrl: '',
    toolchain: [], standards: ['doc-first'], scenario: '', efficiency: [{ label: '', value: '' }], assets: [],
  }]
  const [activeIdx, setActiveIdx] = useState(0)
  const item = items[activeIdx] || items[0]

  const { updateModuleData } = useResumeStore()

  const saveItems = useCallback((next: AIEngineeringItem[]) => {
    updateModuleData(moduleId, () => ({ items: next } as AIEngineeringData))
  }, [moduleId, updateModuleData])

  const updateItem = (partial: Partial<AIEngineeringItem>) => {
    saveItems(items.map((it, i) => i === activeIdx ? { ...it, ...partial } : it))
  }

  const addItem = () => {
    const newItem: AIEngineeringItem = {
      id: crypto.randomUUID(), practiceName: '', role: '', timeRange: '', projectUrl: '',
      toolchain: [], standards: ['doc-first'], scenario: '', efficiency: [{ label: '', value: '' }], assets: [],
    }
    saveItems([...items, newItem]); setActiveIdx(items.length)
  }

  const removeItem = (idx: number) => {
    if (items.length <= 1) return
    const next = items.filter((_, i) => i !== idx)
    saveItems(next); setActiveIdx(Math.min(idx, next.length - 1))
  }

  // ---- toolchain ----
  const [toolInput, setToolInput] = useState('')
  const addTool = () => { const v = toolInput.trim(); if (!v || item.toolchain.includes(v)) return; updateItem({ toolchain: [...item.toolchain, v] }); setToolInput('') }
  const removeTool = (idx: number) => updateItem({ toolchain: item.toolchain.filter((_, i) => i !== idx) })

  // ---- standards ----
  const toggleStandard = (s: AIStandard) => {
    if (s === 'doc-first') return
    const next = item.standards.includes(s) ? item.standards.filter(x => x !== s) : [...item.standards, s]
    updateItem({ standards: next })
  }

  // ---- efficiency ----
  const updateMetric = (idx: number, field: keyof AIEfficiencyMetric, val: string) => {
    updateItem({ efficiency: item.efficiency.map((m, i) => i === idx ? { ...m, [field]: val } : m) })
  }
  const addMetric = () => updateItem({ efficiency: [...item.efficiency, { label: '', value: '' }] })
  const removeMetric = (idx: number) => updateItem({ efficiency: item.efficiency.filter((_, i) => i !== idx) })

  // ---- assets ----
  const [assetInput, setAssetInput] = useState('')
  const addAsset = () => { const v = assetInput.trim(); if (!v || item.assets.includes(v)) return; updateItem({ assets: [...item.assets, v] }); setAssetInput('') }
  const removeAsset = (idx: number) => updateItem({ assets: item.assets.filter((_, i) => i !== idx) })

  // ---- AI magic ----
  const [aiBusy, setAiBusy] = useState<'metrics' | 'risk' | 'star' | null>(null)
  const handleMagic = (a: typeof aiBusy) => { setAiBusy(a); console.log(`[AI Magic] ${a}`, item.scenario); setTimeout(() => setAiBusy(null), 800) }

  return (
    <div className="editor-form-root space-y-4">
      {/* 项目切换 */}
      <div className="flex items-center gap-1 flex-wrap">
        {items.map((it, i) => (
          <button key={it.id}
            onClick={() => setActiveIdx(i)}
            className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${i === activeIdx ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {it.practiceName || `项目 ${i + 1}`}
          </button>
        ))}
        <button onClick={addItem} className="px-2 py-1 text-xs border border-dashed border-gray-300 rounded-lg text-gray-400 hover:border-primary/40 hover:text-primary">
          <Plus className="w-3 h-3 inline mr-0.5" />添加
        </button>
      </div>

      {/* ======== 一、基础信息区 ======== */}
      <section className="space-y-3">
        <h5 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">1</span>基础信息
          {items.length > 1 && (
            <button onClick={() => removeItem(activeIdx)} className="ml-auto text-xs text-red-400 hover:text-red-600 flex items-center gap-0.5"><Trash2 className="w-3 h-3" />删除此项目</button>
          )}
        </h5>

        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">AI 实践命名 <span className="text-red-400">*</span></label>
          <input type="text" value={item.practiceName} onChange={e => updateItem({ practiceName: e.target.value })} placeholder={AI_PRACTICE_PLACEHOLDER} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs font-medium text-gray-700 mb-1 block">角色</label><input type="text" value={item.role} onChange={e => updateItem({ role: e.target.value })} placeholder="AI 应用开发" className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30" /></div>
          <div><label className="text-xs font-medium text-gray-700 mb-1 block">项目地址</label><input type="text" value={item.projectUrl} onChange={e => updateItem({ projectUrl: e.target.value })} placeholder="https://github.com/..." className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30" /></div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">时间</label>
          <YearMonthRangePicker startDate={parseTimeRangeStart(item.timeRange)} endDate={parseTimeRangeEnd(item.timeRange)} onChange={(s, e) => updateItem({ timeRange: formatTimeRange(s, e) })} />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">AI 工具链 / 技术栈</label>
          <div className="flex flex-wrap gap-1 mb-1.5">{item.toolchain.map((t, i) => (<span key={i} className="inline-flex items-center gap-0.5 px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-full">{t}<button onClick={() => removeTool(i)} className="hover:text-red-500"><X className="w-2.5 h-2.5" /></button></span>))}</div>
          <div className="flex gap-1"><input type="text" value={toolInput} onChange={e => setToolInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTool() } }} placeholder={AI_TOOLCHAIN_PLACEHOLDER} className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30" /><button onClick={addTool} className="px-3 py-1.5 text-xs bg-gray-100 rounded-lg hover:bg-gray-200 text-gray-600">添加</button></div>
        </div>
      </section>

      {/* ======== 二、工作流与规范落地 ======== */}
      <section className="space-y-3">
        <h5 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs flex items-center justify-center font-bold">2</span>工作流与规范落地</h5>
        <div className="space-y-2">
          {AI_STANDARD_OPTIONS.map(opt => {
            const active = item.standards.includes(opt.value)
            const borderClass = active ? 'border-primary/30 bg-primary/5' : 'border-gray-200 hover:bg-gray-50'
            const cursorClass = opt.required ? 'cursor-default' : ''
            return (
              <label key={opt.value} className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${borderClass} ${cursorClass}`} onClick={() => toggleStandard(opt.value)}>
                <input type="checkbox" checked={active} disabled={opt.required} onChange={() => { }} className="mt-0.5 accent-primary" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-gray-800">{opt.label}</span>
                    {opt.required && <span className="text-[9px] bg-red-100 text-red-600 px-1 py-0 rounded">必选</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                </div>
              </label>
            )
          })}
        </div>
      </section>

      {/* ======== 三、核心贡献与量化成果 ======== */}
      <section className="space-y-3">
        <h5 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-green-100 text-green-700 text-xs flex items-center justify-center font-bold">3</span>核心贡献与量化成果</h5>
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">落地场景与难点攻克 <span className="text-red-400">*</span></label>
          <div className="flex items-center gap-1 mb-1.5 flex-wrap">
            <button onClick={() => handleMagic('metrics')} disabled={!!aiBusy} className="flex items-center gap-1 px-2.5 py-1 text-[10px] rounded-lg border border-purple-200 bg-purple-50 text-purple-600 hover:bg-purple-100 disabled:opacity-50"><Sparkles className="w-3 h-3" />{aiBusy === 'metrics' ? '分析中...' : '抽取量化指标'}</button>
            <button onClick={() => handleMagic('risk')} disabled={!!aiBusy} className="flex items-center gap-1 px-2.5 py-1 text-[10px] rounded-lg border border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 disabled:opacity-50"><ShieldCheck className="w-3 h-3" />{aiBusy === 'risk' ? '生成中...' : '补全风控描述'}</button>
            <button onClick={() => handleMagic('star')} disabled={!!aiBusy} className="flex items-center gap-1 px-2.5 py-1 text-[10px] rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50"><RefreshCw className="w-3 h-3" />{aiBusy === 'star' ? '转换中...' : '转化为 STAR 工作流'}</button>
          </div>
          <RichTextEditor value={item.scenario} onChange={val => updateItem({ scenario: val })} placeholder="描述具体的业务场景或技术痛点..." />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1.5 block">提效与质量控制</label>
          <div className="space-y-1.5">{item.efficiency.map((m, i) => (<div key={i} className="flex items-center gap-1.5"><input type="text" value={m.label} onChange={e => updateMetric(i, 'label', e.target.value)} placeholder="工时优化 / 质量指标..." className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30" /><input type="text" value={m.value} onChange={e => updateMetric(i, 'value', e.target.value)} placeholder="40% / 零故障" className="w-36 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30" /><button onClick={() => removeMetric(i)} className="p-1 text-gray-300 hover:text-red-400"><X className="w-3 h-3" /></button></div>))}</div>
          <button onClick={addMetric} className="mt-1.5 text-xs text-primary hover:text-primary/80 flex items-center gap-1"><Plus className="w-3 h-3" />添加指标</button>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">团队资产沉淀</label>
          <div className="flex flex-wrap gap-1 mb-1.5">{item.assets.map((a, i) => (<span key={i} className="inline-flex items-center gap-0.5 px-2 py-0.5 text-xs bg-green-50 text-green-700 rounded-full">{a}<button onClick={() => removeAsset(i)} className="hover:text-red-500"><X className="w-2.5 h-2.5" /></button></span>))}</div>
          <div className="flex gap-1"><input type="text" value={assetInput} onChange={e => setAssetInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAsset() } }} placeholder="团队专属 Prompt 库、API 设计 SOP..." className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30" /><button onClick={addAsset} className="px-3 py-1.5 text-xs bg-gray-100 rounded-lg hover:bg-gray-200 text-gray-600">添加</button></div>
        </div>
      </section>
    </div>
  )
}

export default AIEngineeringForm
