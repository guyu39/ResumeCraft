// ============================================================
// 单设备登录两阶段流程：登录检测到他设备后的「二次确认」弹窗。
// 用 portal 渲染于 body，挂在 App 全局，与 LoginPage 同屏（确认前不进入应用）。
//
// 关键：登录时后端「尚未」踢任何设备，只签发了短效 ticket。
//  - 「是我，继续」→ 用 ticket 完成登录，后端此时才踢旧设备
//  - 「不是我，退出」→ 丢弃 ticket，旧设备完全不受影响（本端也无 token 需清理）
// ============================================================

import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/components/common/Toast'
import { ApiError } from '@/api'

const KickConfirmModal: React.FC = () => {
  const kickConfirm = useAuthStore((s) => s.kickConfirm)
  const confirmKickLogin = useAuthStore((s) => s.confirmKickLogin)
  const clearKickConfirm = useAuthStore((s) => s.clearKickConfirm)
  const [submitting, setSubmitting] = useState(false)

  if (!kickConfirm) return null

  // 「是我，继续」：用 ticket 完成登录（后端此时踢旧设备），成功后回到原页面
  const handleConfirm = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const returnUrl = await confirmKickLogin()
      window.location.href = returnUrl
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : '确认凭证已失效，请重新登录'
      toast(msg)
      // confirmKickLogin 内部已清理确认态，这里回到登录页
    } finally {
      setSubmitting(false)
    }
  }

  // 「不是我，退出」：丢弃 ticket。登录时未签发 token，本端无会话需注销，旧设备不受影响
  const handleDeny = () => {
    clearKickConfirm()
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">该账号已在其他设备登录</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
              继续登录将退出另一设备的会话。请确认是您本人操作；若非本人，请退出并修改密码。
            </p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleDeny}
            disabled={submitting}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:text-slate-800 disabled:opacity-50"
          >
            不是我，退出
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? '确认中…' : '是我，继续'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default KickConfirmModal
