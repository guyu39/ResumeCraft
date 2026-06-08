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

        // 将所有图片转为压缩后的 base64 data URL 内嵌，消除 chromedp 端的网络请求依赖
        // 解决：1) 冷启动时序竞争导致图片半截 2) 后台渲染节流导致图片不加载 3) MinIO 内网 URL 不可达
        // 同时压缩图片避免请求体过大触发 413
        const compressImageToDataUrl = (imgEl: HTMLImageElement, maxWidth = 400, quality = 0.85): Promise<string> => {
          return new Promise((resolve) => {
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')
            if (!ctx) { resolve(''); return }
            const scale = imgEl.naturalWidth > maxWidth ? maxWidth / imgEl.naturalWidth : 1
            canvas.width = Math.round(imgEl.naturalWidth * scale)
            canvas.height = Math.round(imgEl.naturalHeight * scale)
            ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height)
            // 优先 webp（更小），不支持则回退 jpeg
            const dataUrl = canvas.toDataURL('image/webp', quality)
            resolve(dataUrl.startsWith('data:image/webp') ? dataUrl : canvas.toDataURL('image/jpeg', quality))
          })
        }
        const images = Array.from(sourceElement.querySelectorAll('img'))
        await Promise.all(
          images.map(async (img) => {
            if (!img.src || img.src.startsWith('data:')) return
            try {
              // 尝试 canvas 压缩转 base64（更快、体积更小）
              if (img.complete && img.naturalWidth > 0) {
                try {
                  const dataUrl = await compressImageToDataUrl(img)
                  if (dataUrl) { img.src = dataUrl; return }
                } catch {
                  // canvas 被跨域图片污染（如通过 302 重定向加载的头像），回退到 fetch
                  console.debug('[export] canvas tainted for:', img.src, 'falling back to fetch')
                }
              }
              // fetch 方式获取图片（不受跨域 canvas 污染限制）
              const resp = await fetch(img.src)
              if (!resp.ok) return
              const blob = await resp.blob()
              const dataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader()
                reader.onloadend = () => resolve(reader.result as string)
                reader.readAsDataURL(blob)
              })
              img.src = dataUrl
            } catch {
              console.warn('[export] image conversion failed for:', img.src)
              // 转换失败则保留原 src
            }
          })
        )

        // 构建 HTML
        const styleTags = Array.from(document.querySelectorAll('style'))
          .map((node) => node.outerHTML)
          .join('\n')
        // const linkTags = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        //   .map((node) => node.outerHTML)
        //   .join('\n')
        const inlinedCSS = (
          await Promise.all(
            (Array.from(document.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[])
              .map(link =>
                fetch(link.href)
                  .then(r => r.text())
                  .then(t => `<style>${t}</style>`)
                  .catch(() => `/* failed: ${link.href} */`)
              )
          )
        ).join('\n')

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

          styleTags,
          inlinedCSS,
          '<style>',
          'html, body { margin: 0; padding: 0; background: #fff; }',
          '* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }',
          '[data-no-export] { display: none !important; }',
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