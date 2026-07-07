// ============================================================
// 单设备登录：本端登录挤掉其他设备会话后的「二次确认」弹窗。
// 用 portal 渲染于 body，挂在 App 全局，不随 LoginPage 卸载而消失
// （登录成功会把 isAuthenticated 置为 true，App 会立即卸载 LoginPage）。
// ============================================================

import React from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

const KickConfirmModal: React.FC = () => {
  const returnUrl = useAuthStore((s) => s.kickConfirmReturnUrl)
  const clearKickConfirm = useAuthStore((s) => s.clearKickConfirm)

  if (!returnUrl) return null

  const handleConfirm = () => {
    clearKickConfirm()
    // 进入应用（与正常登录一致；若带 return 参数则跳转到目标页）
    window.location.href = returnUrl
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">已在其他设备登录</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
              该账号已在其他设备登录，已将该设备会话挤下线。为保障账号安全，请确认是您本人操作。
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            确认
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default KickConfirmModal
