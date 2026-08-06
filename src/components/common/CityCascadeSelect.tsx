// ============================================================
// CityCascadeSelect — 省市二级级联选择器
// 用于投递页的「意向城市」选择，左省右市，选中高亮
// ============================================================

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { MapPin, ChevronRight, Search, X } from 'lucide-react'
import CITIES from '@/data/chinaCities'

interface CityCascadeSelectProps {
  value: string   // "省份/城市" 格式
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

const CityCascadeSelect: React.FC<CityCascadeSelectProps> = ({
  value, onChange, placeholder = '请选择意向城市', className = '',
}) => {
  const [open, setOpen] = useState(false)
  const [province, setProvince] = useState('')
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selectedProvince = useMemo(() => {
    if (!value) return ''
    const idx = value.indexOf('/')
    return idx > -1 ? value.slice(0, idx) : value
  }, [value])

  const selectedCity = useMemo(() => {
    if (!value) return ''
    const idx = value.indexOf('/')
    return idx > -1 ? value.slice(idx + 1) : ''
  }, [value])

  const currentEntry = useMemo(() => CITIES.find((c) => c.name === province), [province])

  const filteredProvinces = useMemo(() => {
    if (!search) return CITIES
    const s = search.toLowerCase()
    // 搜索省份或城市
    return CITIES.filter(
      (p) => p.name.toLowerCase().includes(s) || (p.children || []).some((c) => c.toLowerCase().includes(s))
    )
  }, [search])

  const selectCity = (p: string, c: string) => {
    onChange(`${p}/${c}`)
    setOpen(false)
    setSearch('')
  }

  // selectProvinceOnly 仅选到省/直辖市级别（不精确到市/区），用于用户不清楚
  // 具体投递城市的场景（例如只知道招聘方在"广东"，但不确定具体是广州还是深圳）。
  const selectProvinceOnly = (p: string) => {
    onChange(p)
    setOpen(false)
    setSearch('')
  }

  // value 可能是「省/市」或仅「省」（省级选择），展示时原样输出即可
  const displayText = value || ''

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* 触发器按钮 */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex h-10 w-full items-center gap-2 rounded-xl border px-3 text-sm outline-none transition ${
          value
            ? 'border-blue-400 bg-blue-50/40 text-slate-800'
            : 'border-slate-200 bg-white text-slate-400'
        } hover:border-blue-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10`}
      >
        <MapPin className="h-4 w-4 shrink-0" />
        <span className={`flex-1 truncate text-left ${value ? 'font-medium' : ''}`}>
          {displayText || placeholder}
        </span>
        {value && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange('') }}
            className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </button>

      {/* 下拉面板 */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          {/* 搜索栏 */}
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索省份或城市"
              className="flex-1 text-xs text-slate-800 outline-none placeholder:text-slate-400"
              autoFocus
            />
          </div>

          {/* 内容区 */}
          {search ? (
            // 搜索结果
            <div className="max-h-64 overflow-y-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {filteredProvinces.map((p) => (
                <div key={p.name}>
                  <button
                    type="button"
                    onClick={() => { setProvince(p.name); setSearch('') }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-800 transition hover:bg-blue-50"
                  >
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-tight text-slate-500">省</span>
                    {p.name}
                  </button>
                </div>
              ))}
            </div>
          ) : province ? (
            // 选定省份 → 显示城市列表
            <>
              <button
                type="button"
                onClick={() => setProvince('')}
                className="flex w-full items-center gap-1.5 border-b border-slate-100 px-3 py-2 text-xs text-blue-600 transition hover:bg-blue-50"
              >
                <ChevronRight className="h-3 w-3 rotate-180" />
                返回省份列表
              </button>
              {/* 仅选到省/直辖市级别：不确定具体城市/区时可直接确认 */}
              <button
                type="button"
                onClick={() => selectProvinceOnly(province)}
                className="flex w-full items-center gap-1.5 border-b border-slate-100 bg-blue-50/50 px-3 py-2 text-left text-xs font-medium text-blue-600 transition hover:bg-blue-50"
              >
                <MapPin className="h-3 w-3 shrink-0" />
                不确定具体城市，仅选「{province}」
              </button>
              <div className="grid max-h-64 grid-cols-2 gap-0.5 overflow-y-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {(currentEntry?.children || []).map((city) => {
                  const isActive = selectedProvince === province && selectedCity === city
                  return (
                    <button
                      key={city}
                      type="button"
                      onClick={() => selectCity(province, city)}
                      className={`rounded-lg px-2.5 py-2 text-left text-xs transition ${
                        isActive
                          ? 'bg-blue-500 font-medium text-white'
                          : 'text-slate-600 hover:bg-blue-50 hover:text-blue-600'
                      }`}
                    >
                      {city}
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            // 省份列表
            <div className="grid max-h-64 grid-cols-2 gap-0.5 overflow-y-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {CITIES.map((p) => {
                const isActive = selectedProvince === p.name
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => setProvince(p.name)}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition ${
                      isActive
                        ? 'bg-blue-500 font-medium text-white'
                        : 'text-slate-600 hover:bg-blue-50 hover:text-blue-600'
                    }`}
                  >
                    <span>{p.name}</span>
                    <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
                  </button>
                )
              })}
            </div>
          )}

          {/* 底部快捷操作 */}
          {!search && selectedProvince && !province && (
            <div className="border-t border-slate-100 px-3 py-2">
              <button
                type="button"
                onClick={() => setProvince(selectedProvince)}
                className="text-xs text-blue-600 hover:underline"
              >
                继续选择 {selectedProvince} 的城市
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default CityCascadeSelect
