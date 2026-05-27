// ============================================================
// AppShell — 三栏布局容器
// 严格遵循 PRD 第 4.1 节布局参数
// ============================================================

import React from 'react'
import LeftPanel from './LeftPanel'
import CenterPanel from './CenterPanel'
import RightPanel from './RightPanel.tsx'
import { useCloudSync } from '@/hooks/useCloudSync'
import { usePendingParse } from '@/hooks/usePendingParse'
import { X, Loader2 } from 'lucide-react'

const AppShell: React.FC = () => {
  const [左栏宽度, 设置左栏宽度] = React.useState(300)
  const [右栏宽度, 设置右栏宽度] = React.useState(600)
  const [拖拽中, 设置拖拽中] = React.useState<'left' | 'right' | null>(null)

  // 云端同步
  const { saveStatus } = useCloudSync()

  // 后台解析简历（从简历列表页传入的文件）
  const { status: parseStatus, error: parseError, dismiss: dismissParse } = usePendingParse()

  // 记录保存状态供 UI 使用
  React.useEffect(() => {
    console.log('[AppShell] 保存状态:', saveStatus)
  }, [saveStatus])

  React.useEffect(() => {
    if (!拖拽中) return

    const 处理鼠标移动 = (e: MouseEvent) => {
      const 最小左栏 = 200
      const 最大左栏 = 320
      const 最小右栏 = 300
      const 最大右栏 = 550
      const 中栏最小宽度 = 550

      if (拖拽中 === 'left') {
        const 可用最大左栏 = Math.min(最大左栏, window.innerWidth - 右栏宽度 - 中栏最小宽度)
        const 新宽度 = Math.max(最小左栏, Math.min(可用最大左栏, e.clientX))
        设置左栏宽度(新宽度)
        return
      }

      if (拖拽中 === 'right') {
        const 从右侧计算 = window.innerWidth - e.clientX
        const 可用最大右栏 = Math.min(最大右栏, window.innerWidth - 左栏宽度 - 中栏最小宽度)
        const 新宽度 = Math.max(最小右栏, Math.min(可用最大右栏, 从右侧计算))
        设置右栏宽度(新宽度)
      }
    }

    const 处理鼠标抬起 = () => {
      设置拖拽中(null)
    }

    window.addEventListener('mousemove', 处理鼠标移动)
    window.addEventListener('mouseup', 处理鼠标抬起)

    return () => {
      window.removeEventListener('mousemove', 处理鼠标移动)
      window.removeEventListener('mouseup', 处理鼠标抬起)
    }
  }, [拖拽中, 左栏宽度, 右栏宽度])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[radial-gradient(circle_at_20%_15%,#f7f9ff_0%,#edf2ff_35%,#e8edf5_100%)] p-3">
      {/* 后台解析进度提示 */}
      {parseStatus !== 'idle' && (
        <div className={`mb-2 flex items-center justify-between rounded-xl px-4 py-2.5 text-sm shadow-sm transition-colors ${
          parseStatus === 'parsing' ? 'bg-blue-50 text-blue-700' :
          parseStatus === 'done' ? 'bg-green-50 text-green-700' :
          'bg-red-50 text-red-600'
        }`}>
          <div className="flex items-center gap-2">
            {parseStatus === 'parsing' && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>
              {parseStatus === 'parsing' && '正在解析简历，请稍候...'}
              {parseStatus === 'done' && '简历解析完成'}
              {parseStatus === 'error' && (parseError || '简历解析失败')}
            </span>
          </div>
          {(parseStatus === 'done' || parseStatus === 'error') && (
            <button onClick={dismissParse} className="ml-3 rounded p-0.5 hover:bg-black/10">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      <div className="flex flex-1 w-full overflow-hidden gap-2">
        {/* 左栏 220px — 模块管理面板 */}
        <aside
          className="flex-shrink-0 flex flex-col bg-white/92 border border-white/70 rounded-2xl shadow-[0_8px_30px_rgba(16,24,40,0.08)] overflow-hidden backdrop-blur"
          style={{ width: `${左栏宽度}px` }}
        >
          <LeftPanel />
        </aside>

        {/* 左拖拽条 */}
        <div
          className="w-1.5 rounded-full flex-shrink-0 cursor-col-resize bg-transparent hover:bg-primary/20 active:bg-primary/30 transition-colors"
          onMouseDown={() => 设置拖拽中('left')}
          title="拖拽调整左侧宽度"
        />

        {/* 中栏 flex:1 — 简历实时预览 */}
        <main className="flex-1 flex flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/72 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur">
          <CenterPanel />
        </main>

        {/* 右拖拽条 */}
        <div
          className="w-1.5 rounded-full flex-shrink-0 cursor-col-resize bg-transparent hover:bg-primary/20 active:bg-primary/30 transition-colors"
          onMouseDown={() => 设置拖拽中('right')}
          title="拖拽调整右侧宽度"
        />

        {/* 右栏 380px — 编辑表单 */}
        <aside
          className="flex-shrink-0 flex flex-col bg-white/95 border border-white/70 rounded-2xl shadow-[0_8px_30px_rgba(16,24,40,0.08)] overflow-hidden backdrop-blur"
          style={{ width: `${右栏宽度}px` }}
        >
          <RightPanel />
        </aside>
      </div>
    </div>
  )
}

export default AppShell
