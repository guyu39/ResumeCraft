// ============================================================
// LeftPanel — 左侧模块管理面板
// 固定模块：不可删除、不可拖拽顺序、不可从选择器添加
// 非固定模块：可删除、可拖拽排序
// ============================================================

import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Trash2, Eye, EyeOff, FileText } from 'lucide-react'

import { useResumeStore } from '@/store/resumeStore'
import { Module, MODULE_META_LIST, ModuleType, FIXED_MODULE_TYPES } from '@/types/resume'
import DragHandle from '@/components/common/DragHandle'

// ---------- 单个模块卡片 ----------
interface ModuleCardProps {
  module: Module
  isActive: boolean
  onSelect: (id: string) => void
  onToggleVisible: (id: string) => void
  onRemove: (id: string) => void
  themeColor: string
}

const ModuleCard: React.FC<ModuleCardProps> = ({
  module,
  isActive,
  onSelect,
  onToggleVisible,
  onRemove,
  themeColor,
}) => {
  const isFixed = FIXED_MODULE_TYPES.includes(module.type)
  const displayTitle =
    module.type === 'custom' && module.title.startsWith('自定义-')
      ? module.title.replace(/^自定义-/, '') || '自定义模块'
      : module.title

  // 固定模块：仍可拖拽（仅不可删除）
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: module.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      className={`
        group relative flex items-center gap-2 bg-white rounded-lg
        border cursor-pointer select-none
        transition-all duration-150
        ${isActive
          ? 'shadow-sm'
          : 'border-gray-200 hover:shadow-sm'
        }
        ${isDragging ? 'opacity-50 shadow-lg' : ''}
      `}
      style={{
        ...style,
        borderLeftColor: isActive ? themeColor : 'transparent',
        borderLeftWidth: '3px',
        borderTopColor: isActive ? themeColor : undefined,
      }}
      onClick={() => onSelect(module.id)}
    >
      {/* 拖拽手柄 */}
      <div
        {...attributes}
        {...listeners}
        className="flex-shrink-0 pl-2 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <DragHandle />
      </div>

      {/* 模块图标 */}
      <span className="flex-shrink-0 text-base leading-none">
        {MODULE_META_LIST.find((m) => m.type === module.type)?.icon ?? '📄'}
      </span>

      {/* 模块名称 */}
      <div className="flex-1 min-w-0 pr-1 py-3 flex items-center gap-1.5">
        <span
          className={`text-sm font-medium truncate ${isActive ? 'text-primary' : 'text-gray-700'}`}
        >
          {displayTitle}
        </span>
        {module.type === 'custom' && (
          <span className="flex-shrink-0 px-1.5 py-0.5 rounded bg-gray-100 text-[10px] text-gray-500 leading-none">
            自定义
          </span>
        )}
      </div>

      {/* 显隐开关 */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleVisible(module.id)
        }}
        className={`
          flex-shrink-0 p-1 rounded transition-opacity duration-150
          ${isDragging ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'}
        `}
        title={module.visible ? '隐藏模块' : '显示模块'}
      >
        {module.visible ? (
          <Eye className="w-3.5 h-3.5 text-gray-400" />
        ) : (
          <EyeOff className="w-3.5 h-3.5 text-gray-400" />
        )}
      </button>

      {/* 删除按钮（非固定模块显示） */}
      {!isFixed && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove(module.id)
          }}
          className={`
            flex-shrink-0 p-1 rounded text-red-400 transition-opacity duration-150
            ${isDragging ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100 hover:text-red-600 hover:bg-red-50'}
          `}
          title="删除模块"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// ---------- LeftPanel 主组件 ----------
const LeftPanel: React.FC = () => {
  const {
    resume,
    activeModuleId,
    setActiveModule,
    addModule,
    removeModule,
    reorderModules,
    toggleModuleVisible,
  } = useResumeStore()
  const [pendingDeleteModuleId, setPendingDeleteModuleId] = useState<string | null>(null)

  // dnd-kit 传感器
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = resume.modules.findIndex((m) => m.id === active.id)
    const newIndex = resume.modules.findIndex((m) => m.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) {
      reorderModules(oldIndex, newIndex)
    }
  }

  const handleRemove = (id: string) => {
    const module = resume.modules.find((m) => m.id === id)
    if (!module) return
    setPendingDeleteModuleId(id)
  }

  const pendingDeleteModule = pendingDeleteModuleId
    ? resume.modules.find((m) => m.id === pendingDeleteModuleId) ?? null
    : null

  const confirmRemoveModule = () => {
    if (!pendingDeleteModuleId) return
    removeModule(pendingDeleteModuleId)
    setPendingDeleteModuleId(null)
  }

  // 已存在的非固定模块类型（用于判断可否添加）
  const existingNonFixedTypes = resume.modules
    .filter((m) => !FIXED_MODULE_TYPES.includes(m.type))
    .map((m) => m.type)

  const otherModules = MODULE_META_LIST.filter(
    (m) => !FIXED_MODULE_TYPES.includes(m.type) && m.type !== 'custom'
  )

  const canAddModule = (type: ModuleType, maxCount: number) => {
    if (maxCount === 0) return true
    return existingNonFixedTypes.filter((t) => t === type).length < maxCount
  }

  const openCustomModuleEditor = () => {
    addModule('custom')
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部：简历标题 */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="w-4 h-4 text-primary flex-shrink-0" />
          <input
            type="text"
            value={resume.title}
            readOnly
            className="flex-1 text-sm font-semibold text-gray-800 bg-transparent border-none outline-none"
            placeholder="简历标题"
          />
        </div>
        <p className="text-xs text-gray-400">
          {resume.modules.length} 个模块
          {' · '}
          {resume.template === 'classic' ? '经典单栏'
            : resume.template === 'modern' ? '现代双栏'
              : '简约极简'}
        </p>
      </div>

      {/* 模块列表（可滚动） */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-3 py-3 space-y-2">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={resume.modules.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
          >
            {resume.modules.map((module) => (
              <ModuleCard
                key={module.id}
                module={module}
                isActive={module.id === activeModuleId}
                onSelect={setActiveModule}
                onToggleVisible={toggleModuleVisible}
                onRemove={handleRemove}
                themeColor={resume.themeColor}
              />
            ))}
          </SortableContext>
        </DndContext>

        <div className="mt-4 border-t border-gray-200 pt-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 px-1">
            其他模块
          </p>
          <div className="grid grid-cols-2 gap-2">
            {otherModules.map((moduleMeta) => {
              const disabled = !canAddModule(moduleMeta.type, moduleMeta.maxCount)
              return (
                <button
                  key={moduleMeta.type}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && addModule(moduleMeta.type)}
                  className={`
                    flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs text-left
                    transition-all duration-150
                    ${disabled
                      ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-primary hover:text-primary hover:shadow-sm'
                    }
                  `}
                >
                  <span>{moduleMeta.icon}</span>
                  <span className="truncate">{moduleMeta.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* 底部：自定义模块入口 */}
      <div className="flex-shrink-0 px-3 py-3 border-t border-gray-200 bg-white">
        <button
          onClick={openCustomModuleEditor}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-primary/30 bg-primary/5 text-sm text-primary hover:bg-primary/10 transition-all duration-150"
        >
          <Plus className="w-4 h-4" />
          自定义模块
        </button>
      </div>

      {pendingDeleteModule && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/35"
            onClick={() => setPendingDeleteModuleId(null)}
          />
          <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-gray-100 p-5">
            <h4 className="text-base font-semibold text-gray-800">删除模块</h4>
            <p className="mt-2 text-sm text-gray-500 leading-relaxed">
              确定删除「{pendingDeleteModule.title}」模块吗？删除后数据不可恢复。
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteModuleId(null)}
                className="px-3.5 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmRemoveModule}
                className="px-3.5 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default LeftPanel
