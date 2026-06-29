// ============================================================
// ConflictDialog — 多端编辑冲突解决弹窗（全局单例，类似 Toast）
// 当云端保存返回 409（版本冲突）时，由 useCloudSync 触发，
// 让用户选择「用云端最新」或「保留我的并覆盖云端」。
// ============================================================

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { FieldDiff } from '@/api/resume'
import DiffView from '@/components/common/DiffView'

export type ConflictChoice = 'useCloud' | 'keepLocal'

interface ConflictRequest {
  resolve: (choice: ConflictChoice | null) => void
  // 字段级差异（本端=before，云端=after）。异步加载：未就绪时为 undefined，加载完置入。
  loadDiff?: () => Promise<FieldDiff[]>
}

let showFn: ((req: ConflictRequest) => void) | null = null

// 供调用方触发冲突对话框，返回用户选择（关闭/未挂载返回 null）。
// loadDiff：可选的字段级差异加载器（通常调后端 diffSnapshots），弹窗内异步加载并展示。
export function requestConflictResolve(loadDiff?: () => Promise<FieldDiff[]>): Promise<ConflictChoice | null> {
  return new Promise((resolve) => {
    if (!showFn) {
      resolve(null)
      return
    }
    showFn({ resolve, loadDiff })
  })
}

const ConflictDialog: React.FC = () => {
  const [req, setReq] = useState<ConflictRequest | null>(null)
  const [diffs, setDiffs] = useState<FieldDiff[] | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  useEffect(() => {
    showFn = (r: ConflictRequest) => {
      setReq(r)
      setDiffs(null)
      if (r.loadDiff) {
        setDiffLoading(true)
        r.loadDiff()
          .then((d) => setDiffs(d))
          .catch(() => setDiffs([]))
          .finally(() => setDiffLoading(false))
      }
    }
    return () => { showFn = null }
  }, [])

  if (!req) return null

  const choose = (choice: ConflictChoice | null) => {
    req.resolve(choice)
    setReq(null)
    setDiffs(null)
    setDiffLoading(false)
  }

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/35" onClick={() => choose(null)} />
      <div className="relative flex max-h-[86vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl">
        <div className="flex items-start gap-2.5 p-5 pb-3">
          <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-base font-semibold text-gray-800">检测到多端编辑冲突</h4>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
              这份简历已在其他设备/标签页被修改并保存。下方为本端与云端的差异，请选择如何处理：
            </p>
          </div>
        </div>

        {/* 字段级差异滚动区 */}
        <div className="min-h-0 flex-1 overflow-y-auto border-y border-gray-100 bg-gray-50/40 px-5 py-3 no-scrollbar">
          {diffLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载差异…
            </div>
          ) : diffs ? (
            <DiffView diffs={diffs} emptyHint="两端内容一致（可能仅样式或元信息不同）" />
          ) : (
            <p className="py-10 text-center text-sm text-gray-400">无差异详情</p>
          )}
          <p className="mt-2 text-[11px] text-gray-400">标记说明：<span className="text-red-600">−</span> 本端内容　<span className="text-green-600">+</span> 云端内容</p>
        </div>

        <div className="space-y-2 p-5 pt-3">
          <button
            type="button"
            onClick={() => choose('useCloud')}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-left transition hover:border-primary/50 hover:bg-primary/5"
          >
            <p className="text-sm font-medium text-gray-800">使用云端最新版本</p>
            <p className="mt-0.5 text-xs text-gray-500">放弃本端未保存的改动，加载其他设备保存的最新内容。</p>
          </button>
          <button
            type="button"
            onClick={() => choose('keepLocal')}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-left transition hover:border-rose-300 hover:bg-rose-50/60"
          >
            <p className="text-sm font-medium text-gray-800">保留本端改动，覆盖云端</p>
            <p className="mt-0.5 text-xs text-gray-500">用本端当前内容覆盖云端，其他设备的改动将被替换。</p>
          </button>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => choose(null)}
              className="px-3.5 py-2 text-sm rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
            >
              稍后处理
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ConflictDialog
