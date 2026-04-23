// ============================================================
// useExportPDF — PDF 导出逻辑（支持异步任务模式）
// ============================================================

import { useCallback, useState } from 'react'
import { exportApi, ApiError } from '@/api'
import type { ExportStatus } from '@/api'

const POLL_INTERVAL = 1500 // 轮询间隔 1.5s
const MAX_POLL_COUNT = 40 // 最多轮询 40 次（约 60s）

interface UseExportResult {
  exportPDF: (resumeId: string, versionId: string) => Promise<void>
  exporting: boolean
  error: string | null
  taskStatus: ExportStatus | null
  progress: number
  downloadUrl: string | null
  reset: () => void
}

const waitForFontsReady = async () => {
  if (document.fonts?.ready) {
    await document.fonts.ready
  }
}

const waitForImagesReady = async (root: HTMLElement) => {
  const images = Array.from(root.querySelectorAll('img'))
  await Promise.all(
    images.map(async (img) => {
      if (img.complete) return
      try {
        if (img.decode) {
          await img.decode()
          return
        }
      } catch {
        // decode 失败时回退
      }
      await new Promise<void>((resolve) => {
        const done = () => resolve()
        img.addEventListener('load', done, { once: true })
        img.addEventListener('error', done, { once: true })
      })
    })
  )
}

const downloadBlob = (blob: Blob, filename: string): void => {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

export function useExportPDF(): UseExportResult {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [taskStatus, setTaskStatus] = useState<ExportStatus | null>(null)
  const [progress, setProgress] = useState(0)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  const reset = useCallback(() => {
    setExporting(false)
    setError(null)
    setTaskStatus(null)
    setProgress(0)
    setDownloadUrl(null)
  }, [])

  const pollTaskStatus = useCallback(
    async (taskId: string, pollCount = 0): Promise<void> => {
      if (pollCount >= MAX_POLL_COUNT) {
        throw new Error('导出超时，请稍后重试')
      }

      const task = await exportApi.getStatus(taskId)
      setTaskStatus(task.status)
      setProgress(task.progress ?? 0)

      switch (task.status) {
        case 'SUCCESS':
          if (task.downloadUrl) {
            setDownloadUrl(task.downloadUrl)
          }
          return // 完成

        case 'FAILED':
          throw new Error(task.errorMessage || 'PDF 导出失败')

        case 'QUEUED':
        case 'PROCESSING':
          // 继续轮询
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL))
          return pollTaskStatus(taskId, pollCount + 1)

        default:
          throw new Error('未知任务状态')
      }
    },
    []
  )

  const exportPDF = useCallback(
    async (resumeId: string, versionId: string) => {
      setExporting(true)
      setError(null)
      setTaskStatus(null)
      setProgress(0)
      setDownloadUrl(null)

      try {
        // 1. 创建导出任务
        const task = await exportApi.create(resumeId, {
          versionId,
          format: 'pdf',
          paper: 'A4',
          orientation: 'portrait',
        })

        // 2. 轮询任务状态
        await pollTaskStatus(task.taskId)
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : '导出失败，请稍后重试'
        setError(message)
        throw new Error(message)
      } finally {
        setExporting(false)
      }
    },
    [pollTaskStatus]
  )

  return { exportPDF, exporting, error, taskStatus, progress, downloadUrl, reset }
}

// 旧版同步导出（用于兼容 /api/pdf/export）
export function useSyncExport() {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const exportPDF = useCallback(
    async (elementId: string, filename?: string) => {
      setExporting(true)
      setError(null)

      try {
        const sourceElement = document.getElementById(elementId)
        if (!sourceElement) throw new Error('简历预览区域未找到')

        await waitForFontsReady()
        await waitForImagesReady(sourceElement)

        // 构建 HTML
        const styleTags = Array.from(document.querySelectorAll('style'))
          .map((node) => node.outerHTML)
          .join('\n')
        const linkTags = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
          .map((node) => node.outerHTML)
          .join('\n')

        // 构建 HTML：克隆节点并移除 visibility hidden / position off-screen 等隐藏样式
        const clone = sourceElement.cloneNode(true) as HTMLElement
        clone.style.position = 'static'
        clone.style.left = '0'
        clone.style.top = '0'
        clone.style.visibility = 'visible'
        clone.style.opacity = '1'
        clone.style.pointerEvents = 'auto'
        // 递归移除所有子元素的 visibility:hidden
        const removeHidden = (el: Element) => {
            if (el instanceof HTMLElement && el.style.visibility === 'hidden') {
                el.style.visibility = 'visible'
            }
            Array.from(el.children).forEach(removeHidden)
        }
        removeHidden(clone)

        console.debug('[export] html length:', clone.outerHTML.length, 'elementId:', elementId)

        const html = [
          '<!doctype html>',
          '<html lang="zh-CN">',
          '<head>',
          '<meta charset="UTF-8" />',
          '<meta name="viewport" content="width=device-width,initial-scale=1" />',
          `<base href="${window.location.origin}/" />`,
          styleTags,
          linkTags,
          '<style>',
          'html, body { margin: 0; padding: 0; background: #fff; }',
          '* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }',
          '</style>',
          '</head>',
          '<body>',
          clone.outerHTML,
          '</body>',
          '</html>',
        ].join('')

        const response = await fetch('/api/pdf/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ html, filename: filename || 'resume' }),
        })

        if (!response.ok) {
          throw new Error('PDF 导出失败，请检查后端服务')
        }

        const blob = await response.blob()
        if (blob.size === 0) {
          throw new Error('PDF 导出失败，请检查后端服务')
        }

        downloadBlob(blob, `${filename || 'resume'}.pdf`)
      } catch (err) {
        const message = err instanceof Error ? err.message : '导出失败，请检查后端服务'
        setError(message)
        throw new Error(message)
      } finally {
        setExporting(false)
      }
    },
    []
  )

  return { exportPDF, exporting, error }
}