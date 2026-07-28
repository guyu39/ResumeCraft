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
import type { NoticeItem } from '@/components/common/NoticeCenter'
import { useResumeStore } from '@/store/resumeStore'
import ToastContainer from '@/components/common/Toast'

const STORAGE_KEY_LEFT = 'resumecraft_panel_left_width'
const STORAGE_KEY_RIGHT = 'resumecraft_panel_right_width'

const MIN_LEFT = 200; const MAX_LEFT = 320; const DEFAULT_LEFT = 300
const MIN_RIGHT = 360; const MAX_RIGHT = 720; const DEFAULT_RIGHT = 600
const MIDDLE_MIN = 550
// 三栏之外的固定横向开销（必须与 JSX 中的 padding/gap/拖拽条实际像素一致，
// 否则拖拽上限算多了会让总宽超出视口，被 overflow-hidden 裁掉最右侧右栏）：
//   外层 p-2 左右各 8px = 16
//   内层 gap-2 共 4 个间隙 × 8px = 32
//   两个拖拽条 w-1.5 各 6px = 12
const GUTTER_TOTAL = 16 + 32 + 12 // = 60

/** 从 localStorage 读取并归一化面板宽度（适配当前视口） */
function loadPanelWidths(): { left: number; right: number } {
  const rawLeft = Number(localStorage.getItem(STORAGE_KEY_LEFT)) || DEFAULT_LEFT
  const rawRight = Number(localStorage.getItem(STORAGE_KEY_RIGHT)) || DEFAULT_RIGHT
  const totalWidth = window.innerWidth
  // 如果当前视口装不下默认尺寸，等比例缩小
  if (rawLeft + rawRight + MIDDLE_MIN + GUTTER_TOTAL > totalWidth) {
    const available = totalWidth - MIDDLE_MIN - GUTTER_TOTAL
    const ratio = available / (rawLeft + rawRight)
    return {
      left: Math.max(MIN_LEFT, Math.floor(rawLeft * ratio)),
      right: Math.max(MIN_RIGHT, Math.floor(rawRight * ratio)),
    }
  }
  return { left: Math.max(MIN_LEFT, Math.min(MAX_LEFT, rawLeft)), right: Math.max(MIN_RIGHT, Math.min(MAX_RIGHT, rawRight)) }
}

const AppShell: React.FC = () => {
  const initial = React.useMemo(() => loadPanelWidths(), [])
  const [左栏宽度, 设置左栏宽度] = React.useState(initial.left)
  const [右栏宽度, 设置右栏宽度] = React.useState(initial.right)
  const [拖拽中, 设置拖拽中] = React.useState<'left' | 'right' | null>(null)
  const 左栏宽度Ref = React.useRef(initial.left)
  const 右栏宽度Ref = React.useRef(initial.right)
  const resume = useResumeStore((s) => s.resume)

  // 云端同步
  const { saveStatus, manualSave } = useCloudSync()

  // 后台解析简历（从简历列表页传入的文件）
  const { status: parseStatus, error: parseError, dismiss: dismissParse } = usePendingParse()

  // 持久化面板宽度到 localStorage
  React.useEffect(() => {
    if (左栏宽度 > 0) localStorage.setItem(STORAGE_KEY_LEFT, String(左栏宽度))
  }, [左栏宽度])

  React.useEffect(() => {
    if (右栏宽度 > 0) localStorage.setItem(STORAGE_KEY_RIGHT, String(右栏宽度))
  }, [右栏宽度])

  React.useEffect(() => {
    左栏宽度Ref.current = 左栏宽度
  }, [左栏宽度])

  React.useEffect(() => {
    右栏宽度Ref.current = 右栏宽度
  }, [右栏宽度])

  const 开始拖拽 = (方向: 'left' | 'right', event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    window.getSelection()?.removeAllRanges()
    设置拖拽中(方向)
  }

  const 工作区通知 = React.useMemo<NoticeItem[]>(() => {
    const items: NoticeItem[] = []
    const 日期冲突模块列表 = resume.modules.filter((mod) => {
      if (mod.type !== 'education' && mod.type !== 'work' && mod.type !== 'project') return false
      const modItems = (mod.data as { items?: Array<{ startDate?: string; endDate?: string }> }).items
      return modItems?.some((item) => item.startDate && item.endDate && item.endDate !== '至今' && item.startDate > item.endDate)
    })

    if (日期冲突模块列表.length > 0) {
      items.push({
        id: 'date-range-conflict',
        tone: 'warning',
        title: `${日期冲突模块列表.map((m) => m.title).join('、')} 时间范围冲突`,
        description: '存在结束时间早于开始时间的记录，请先修正。',
      })
    }

    if (parseStatus === 'parsing') {
      items.push({
        id: 'parse-running',
        tone: 'info',
        title: '正在解析导入的简历',
        description: '系统正在识别 PDF / Word 内容，识别完成后会自动填充到编辑器。',
      })
    }

    if (parseStatus === 'done') {
      items.push({
        id: 'parse-done',
        tone: 'success',
        title: '简历解析完成',
        description: '可以开始检查结构、补充字段并继续编辑。',
        onClose: dismissParse,
      })
    }

    if (parseStatus === 'error') {
      items.push({
        id: 'parse-error',
        tone: 'error',
        title: '简历解析失败',
        description: parseError || '请稍后重试，或切换文件重新导入。',
        onClose: dismissParse,
      })
    }

    if (saveStatus === 'error') {
      items.push({
        id: 'cloud-sync-error',
        tone: 'warning',
        title: '云端同步异常',
        description: '本地编辑仍然保留，建议稍后继续操作并等待自动重试。',
        actionLabel: '立即重试',
        onAction: () => { void manualSave() },
      })
    }

    return items
  }, [dismissParse, manualSave, parseError, parseStatus, resume.modules, saveStatus])

  React.useEffect(() => {
    if (!拖拽中) return

    const 原始UserSelect = document.body.style.userSelect
    const 原始Cursor = document.body.style.cursor
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    window.getSelection()?.removeAllRanges()

    const 处理鼠标移动 = (e: MouseEvent) => {
      e.preventDefault()
      window.getSelection()?.removeAllRanges()

      if (拖拽中 === 'left') {
        const 可用最大左栏 = Math.min(MAX_LEFT, window.innerWidth - 右栏宽度Ref.current - MIDDLE_MIN - GUTTER_TOTAL)
        const 新宽度 = Math.max(MIN_LEFT, Math.min(可用最大左栏, e.clientX))
        左栏宽度Ref.current = 新宽度
        设置左栏宽度(新宽度)
        return
      }

      if (拖拽中 === 'right') {
        const 从右侧计算 = window.innerWidth - e.clientX
        const 可用最大右栏 = Math.min(MAX_RIGHT, window.innerWidth - 左栏宽度Ref.current - MIDDLE_MIN - GUTTER_TOTAL)
        const 新宽度 = Math.max(MIN_RIGHT, Math.min(可用最大右栏, 从右侧计算))
        右栏宽度Ref.current = 新宽度
        设置右栏宽度(新宽度)
      }
    }

    const 恢复拖拽样式 = () => {
      document.body.style.userSelect = 原始UserSelect
      document.body.style.cursor = 原始Cursor
    }

    const 处理鼠标抬起 = () => {
      恢复拖拽样式()
      设置拖拽中(null)
    }

    window.addEventListener('mousemove', 处理鼠标移动)
    window.addEventListener('mouseup', 处理鼠标抬起)

    return () => {
      恢复拖拽样式()
      window.removeEventListener('mousemove', 处理鼠标移动)
      window.removeEventListener('mouseup', 处理鼠标抬起)
    }
  }, [拖拽中])

  // 窗口尺寸变化时自动缩放侧栏
  React.useEffect(() => {
    const handleResize = () => {
      const totalWidth = window.innerWidth
      if (左栏宽度 + 右栏宽度 + MIDDLE_MIN + GUTTER_TOTAL > totalWidth) {
        const available = totalWidth - 右栏宽度 - MIDDLE_MIN - GUTTER_TOTAL
        设置左栏宽度(Math.max(MIN_LEFT, Math.floor(available * 左栏宽度 / (左栏宽度 + 右栏宽度))))
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [左栏宽度, 右栏宽度])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-canvas p-2">
      <ToastContainer />
      <div className="flex flex-1 w-full overflow-hidden gap-2">
        {/* 左栏 — 模块管理面板 */}
        <aside
          className={`flex-shrink-0 flex flex-col bg-surface border border-line rounded-2xl overflow-hidden ${
            拖拽中 === 'left' ? '' : 'transition-[width] duration-200'
          }`}
          style={{ width: `${左栏宽度}px` }}
        >
          <LeftPanel />
        </aside>

        {/* 左拖拽条 */}
        <div
          className="w-1.5 rounded-full flex-shrink-0 cursor-col-resize bg-transparent hover:bg-primary/30 active:bg-primary/40 transition-colors"
          onMouseDown={(event) => 开始拖拽('left', event)}
          title="拖拽调整左侧宽度"
        />

        {/* 中栏 flex:1 — 简历实时预览 */}
        <main className="flex-1 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface" style={{ minWidth: `${MIDDLE_MIN}px` }}>
          <CenterPanel
            workspaceNotices={工作区通知}
            saveStatus={saveStatus}
            onRetrySave={() => { void manualSave() }}
          />
        </main>

        {/* 右拖拽条 */}
        <div
          className="w-1.5 rounded-full flex-shrink-0 cursor-col-resize bg-transparent hover:bg-primary/30 active:bg-primary/40 transition-colors"
          onMouseDown={(event) => 开始拖拽('right', event)}
          title="拖拽调整右侧宽度"
        />

        {/* 右栏 — 编辑表单 */}
        <aside
          className="flex-shrink-0 flex flex-col bg-surface border border-line rounded-2xl overflow-hidden"
          style={{ width: `${右栏宽度}px` }}
        >
          <RightPanel />
        </aside>
      </div>
    </div>
  )
}

export default AppShell
