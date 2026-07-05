// ============================================================
// ChangePasswordDialog — 修改密码弹窗（需邮箱验证码）
// ============================================================

import React, { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2 } from 'lucide-react'
import { authApi } from '@/api'
import { toast } from '@/components/common/Toast'

interface ChangePasswordDialogProps {
    open: boolean
    onClose: () => void
    email: string
    onSuccess?: () => void
}

const ChangePasswordDialog: React.FC<ChangePasswordDialogProps> = ({ open, onClose, email, onSuccess }) => {
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [code, setCode] = useState('')
    const [sending, setSending] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [countdown, setCountdown] = useState(0)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const startCountdown = () => {
        setCountdown(60)
        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    if (timerRef.current) clearInterval(timerRef.current)
                    return 0
                }
                return prev - 1
            })
        }, 1000)
    }

    React.useEffect(() => {
        return () => { if (timerRef.current) clearInterval(timerRef.current) }
    }, [])

    // 关闭时重置表单
    React.useEffect(() => {
        if (!open) {
            setNewPassword(''); setConfirmPassword(''); setCode(''); setCountdown(0)
        }
    }, [open])

    const handleSendCode = async () => {
        if (countdown > 0) return
        setSending(true)
        try {
            await authApi.sendCode(email, 'change_password')
            startCountdown()
            toast('验证码已发送，请查收邮件', 'success')
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : '发送验证码失败'
            toast(msg)
        } finally {
            setSending(false)
        }
    }

    const handleSubmit = async () => {
        if (newPassword.length < 8) { toast('新密码至少 8 位'); return }
        if (newPassword !== confirmPassword) { toast('两次输入的新密码不一致'); return }
        if (!code.trim()) { toast('请输入验证码'); return }

        setSubmitting(true)
        try {
            await authApi.changePassword({ newPassword, code })
            toast('密码修改成功，即将返回登录页', 'success')
            onClose()
            // 延迟一下让 toast 展示，然后注销
            setTimeout(() => onSuccess?.(), 1500)
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : '修改密码失败'
            toast(msg)
        } finally {
            setSubmitting(false)
        }
    }

    if (!open) return null

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <h2 className="text-base font-semibold text-slate-800">修改密码</h2>
                    <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="space-y-3 px-5 py-4">
                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">邮箱</label>
                        <input value={email} disabled className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400 outline-none" />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">新密码</label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="至少 8 位"
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">确认新密码</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="再次输入新密码"
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">邮箱验证码</label>
                        <div className="flex gap-2">
                            <input
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder="6 位验证码"
                                maxLength={6}
                                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                            />
                            <button
                                type="button"
                                disabled={countdown > 0 || sending}
                                onClick={handleSendCode}
                                className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : countdown > 0 ? `${countdown}s` : '发送验证码'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        确认修改
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}

export default ChangePasswordDialog
