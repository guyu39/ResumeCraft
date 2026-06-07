// ============================================================
// PersonalAvatar — 头像共享组件
// PersonalForm（编辑）和 PersonalPreview（预览）共用此组件，
// 确保头像渲染逻辑一致，消除数据源分歧
// ============================================================

import React, { useState, useRef } from 'react'
import { Upload, X, User } from 'lucide-react'
import { uploadAvatar } from '@/api/upload'
import { avatarProxyUrl } from '@/utils/avatarUrl'
import { useI18n } from '@/hooks/useI18n'
import { toast } from '@/components/common/Toast'

export interface PersonalAvatarProps {
  avatar: string
  avatarShape: 'circle' | 'square'
  size?: number
  themeColor?: string
  editable?: boolean
  onAvatarChange?: (url: string) => void
  className?: string
}

const PersonalAvatar: React.FC<PersonalAvatarProps> = ({
  avatar,
  avatarShape,
  size = 96,
  themeColor,
  editable = false,
  onAvatarChange,
  className = '',
}) => {
  const { t } = useI18n()
  const [imgError, setImgError] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const shapeClass = avatarShape === 'square' ? 'rounded-lg' : 'rounded-full'
  const borderColor = themeColor ? `${themeColor}40` : '#E5E7EB'

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast(t('personal.selectImageFile'))
      return
    }
    try {
      setUploading(true)
      const { avatarUrl } = await uploadAvatar(file)
      onAvatarChange?.(avatarUrl)
      setImgError(false)
    } catch {
      toast(t('personal.avatarUploadFailed'))
    } finally {
      setUploading(false)
    }
    // 重置 input 以允许重复上传同一文件
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className={`relative flex-shrink-0 ${className}`}>
      {/* 头像图片 / 占位符 */}
      {avatar && !imgError ? (
        <img
          src={avatarProxyUrl(avatar)}
          alt={t('personal.avatar')}
          onError={() => setImgError(true)}
          className={`object-cover border-2 ${shapeClass}`}
          style={{ width: size, height: size, borderColor }}
        />
      ) : (
        <div
          className={`flex items-center justify-center border-2 border-dashed border-gray-300 bg-gray-100 ${shapeClass}`}
          style={{ width: size, height: size }}
        >
          <User className="text-gray-400" style={{ width: size * 0.35, height: size * 0.35 }} />
        </div>
      )}

      {/* 编辑模式：上传 + 删除按钮 */}
      {editable && (
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center shadow-md hover:bg-primary/90 disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
          {avatar && (
            <button
              type="button"
              onClick={() => onAvatarChange?.('')}
              className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </>
      )}
    </div>
  )
}

export default PersonalAvatar
