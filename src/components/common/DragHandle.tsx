// ============================================================
// DragHandle — 拖拽手柄图标
// ============================================================

import React from 'react'

interface DragHandleProps {
  className?: string
}

const DragHandle: React.FC<DragHandleProps> = ({ className = '' }) => {
  return (
    <div
      className={`flex flex-col justify-center items-center gap-[3px] cursor-grab active:cursor-grabbing select-none ${className}`}
      aria-label="拖动排序"
    >
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex gap-[3px]">
          {[0, 1].map((col) => (
            <div
              key={col}
              className="w-[3px] h-[3px] rounded-full bg-gray-400"
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export default DragHandle
