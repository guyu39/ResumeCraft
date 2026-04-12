// ============================================================
// TagInput — 标签输入组件
// 用于技能的技术栈、URL 列表等场景
// ============================================================

import React, { useRef, useState } from 'react'
import { X } from 'lucide-react'

interface TagInputProps {
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  label?: string
}

const 分隔符正则 = /[\s,，、+]+/

const TagInput: React.FC<TagInputProps> = ({
  value,
  onChange,
  placeholder = '输入后按回车添加',
  label,
}) => {
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const 解析标签 = (raw: string) =>
    raw
      .split(分隔符正则)
      .map((item) => item.trim())
      .filter(Boolean)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === '，' || e.key === '、' || e.key === '+') {
      e.preventDefault()
      addTag()
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      removeTag(value.length - 1)
    }
  }

  const addTag = () => {
    const newTags = 解析标签(inputValue)
    if (newTags.length > 0) {
      const next = [...value]
      newTags.forEach((tag) => {
        if (!next.includes(tag)) next.push(tag)
      })
      onChange(next)
    }
    setInputValue('')
  }

  const removeTag = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-[13px] font-medium text-gray-700 leading-none">
          {label}
        </label>
      )}
      <div
        className={`
          min-h-[36px] flex flex-wrap gap-1.5 items-center
          px-2 py-1.5 border rounded-md bg-white
          transition-all duration-150 cursor-text
          ${!value.length && !inputValue ? 'border-gray-200' : 'border-primary/20'}
        `}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-primary/10 text-primary border border-primary/20"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                removeTag(i)
              }}
              className="hover:text-primary/70"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addTag}
          placeholder={!value.length ? placeholder : ''}
          className="flex-1 min-w-[80px] text-sm text-gray-800 bg-transparent outline-none placeholder:text-gray-300"
        />
      </div>
    </div>
  )
}

export default TagInput
