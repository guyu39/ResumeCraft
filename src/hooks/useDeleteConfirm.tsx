import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

interface ConfirmState {
    title: string
    message: string
    onConfirm: () => void
}

interface ConfirmOptions {
    title?: string
    message?: string
    onConfirm: () => void
}

const DEFAULT_TITLE = '删除条目'
const DEFAULT_MESSAGE = '确定删除这条记录吗？删除后数据不可恢复。'

const useDeleteConfirm = () => {
    const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

    const requestDelete = ({ title = DEFAULT_TITLE, message = DEFAULT_MESSAGE, onConfirm }: ConfirmOptions) => {
        setConfirmState({ title, message, onConfirm })
    }

    const close = () => setConfirmState(null)

    const confirm = () => {
        if (!confirmState) return
        confirmState.onConfirm()
        setConfirmState(null)
    }

    const dialog = useMemo(() => {
        if (!confirmState) return null

        return createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                <div className="absolute inset-0 bg-black/35" onClick={close} />
                <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-gray-100 p-5">
                    <h4 className="text-base font-semibold text-gray-800">{confirmState.title}</h4>
                    <p className="mt-2 text-sm text-gray-500 leading-relaxed">{confirmState.message}</p>
                    <div className="mt-5 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={close}
                            className="px-3.5 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            onClick={confirm}
                            className="px-3.5 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600"
                        >
                            确认删除
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        )
    }, [confirmState])

    return {
        requestDelete,
        deleteConfirmDialog: dialog,
    }
}

export default useDeleteConfirm
