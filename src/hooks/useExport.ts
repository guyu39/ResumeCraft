// ============================================================
// useExport — 通用导出 Hook（支持 PDF / Markdown / JSON / Resume）
// PDF 走同步渲染（/api/pdf/export），Markdown/JSON 走异步任务
// ============================================================

import { useCallback, useState } from 'react'
import { exportApi, ApiError } from '@/api'
import type { ExportFormat, ExportStatus } from '@/api/types'

const POLL_INTERVAL = 1500
const MAX_POLL_COUNT = 40

const FORMAT_EXT: Record<ExportFormat, string> = {
  pdf: 'pdf',
  markdown: 'md',
  json: 'json',
  resume: 'json',
}

const FORMAT_LABEL: Record<ExportFormat, string> = {
  pdf: 'PDF',
  markdown: 'Markdown',
  json: 'JSON',
  resume: 'Resume',
}

export interface ExportOptions {
  versionId: string
  paper?: 'A4' | 'Letter'
  orientation?: 'portrait' | 'landscape'
  filename?: string
}

interface UseExportResult {
  exportFile: (resumeId: string, format: ExportFormat, options: ExportOptions) => Promise<void>
  exporting: boolean
  error: string | null
  taskStatus: ExportStatus | null
  progress: number
  downloadUrl: string | null
  currentFormat: ExportFormat | null
  reset: () => void
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
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
      } catch { /* ignore */ }
      await new Promise<void>((resolve) => {
        const done = () => resolve()
        img.addEventListener('load', done, { once: true })
        img.addEventListener('error', done, { once: true })
      })
    }),
  )
}

const compressImageToDataUrl = (imgEl: HTMLImageElement, maxWidth = 400, quality = 0.85): Promise<string> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) { resolve(''); return }
    const scale = imgEl.naturalWidth > maxWidth ? maxWidth / imgEl.naturalWidth : 1
    canvas.width = Math.round(imgEl.naturalWidth * scale)
    canvas.height = Math.round(imgEl.naturalHeight * scale)
    ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/webp', quality)
    resolve(dataUrl.startsWith('data:image/webp') ? dataUrl : canvas.toDataURL('image/jpeg', quality))
  })
}

async function buildExportHTML(elementId: string): Promise<string> {
  const sourceElement = document.getElementById(elementId)
  if (!sourceElement) throw new Error('简历预览区域未找到')

  await waitForFontsReady()
  await waitForImagesReady(sourceElement)

  const images = Array.from(sourceElement.querySelectorAll('img'))
  await Promise.all(
    images.map(async (img) => {
      if (!img.src || img.src.startsWith('data:')) return
      try {
        if (img.complete && img.naturalWidth > 0) {
          try {
            const dataUrl = await compressImageToDataUrl(img)
            if (dataUrl) { img.src = dataUrl; return }
          } catch { /* canvas tainted, fallback to fetch */ }
        }
        const resp = await fetch(img.src)
        if (!resp.ok) return
        const blob = await resp.blob()
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.readAsDataURL(blob)
        })
        img.src = dataUrl
      } catch { /* keep original src */ }
    }),
  )

  const styleTags = Array.from(document.querySelectorAll('style'))
    .map((node) => node.outerHTML)
    .join('\n')

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

  const clone = sourceElement.cloneNode(true) as HTMLElement
  clone.style.position = 'static'
  clone.style.left = '0'
  clone.style.top = '0'
  clone.style.visibility = 'visible'
  clone.style.opacity = '1'
  clone.style.pointerEvents = 'auto'
  const removeHidden = (el: Element) => {
    if (el instanceof HTMLElement && el.style.visibility === 'hidden') {
      el.style.visibility = 'visible'
    }
    Array.from(el.children).forEach(removeHidden)
  }
  removeHidden(clone)

  return [
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
}

export function useExport(): UseExportResult {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [taskStatus, setTaskStatus] = useState<ExportStatus | null>(null)
  const [progress, setProgress] = useState(0)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [currentFormat, setCurrentFormat] = useState<ExportFormat | null>(null)

  const reset = useCallback(() => {
    setExporting(false)
    setError(null)
    setTaskStatus(null)
    setProgress(0)
    setDownloadUrl(null)
    setCurrentFormat(null)
  }, [])

  const pollTaskStatus = useCallback(
    async (taskId: string, pollCount = 0): Promise<string | null> => {
      if (pollCount >= MAX_POLL_COUNT) {
        throw new Error('导出超时，请稍后重试')
      }

      const task = await exportApi.getStatus(taskId)
      setTaskStatus(task.status)
      setProgress(task.progress ?? 0)

      switch (task.status) {
        case 'SUCCESS':
          return task.downloadUrl || null

        case 'FAILED':
          throw new Error(task.errorMessage || '导出失败')

        case 'QUEUED':
        case 'PROCESSING':
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL))
          return pollTaskStatus(taskId, pollCount + 1)

        default:
          throw new Error('未知任务状态')
      }
    },
    [],
  )

  const exportFile = useCallback(
    async (resumeId: string, format: ExportFormat, options: ExportOptions) => {
      setExporting(true)
      setError(null)
      setTaskStatus(null)
      setProgress(0)
      setDownloadUrl(null)
      setCurrentFormat(format)

      const filename = `${options.filename || 'resume'}.${FORMAT_EXT[format]}`

      try {
        if (format === 'pdf') {
          const html = await buildExportHTML('resume-paper-export')
          const response = await fetch('/api/pdf/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html, filename: options.filename || 'resume' }),
          })
          if (!response.ok) throw new Error('PDF 导出失败，请检查后端服务')
          const blob = await response.blob()
          if (blob.size === 0) throw new Error('PDF 导出失败，请检查后端服务')
          downloadBlob(blob, filename)
        } else {
          const task = await exportApi.create(resumeId, {
            versionId: options.versionId,
            format,
            paper: options.paper ?? 'A4',
            orientation: options.orientation ?? 'portrait',
          })

          const url = await pollTaskStatus(task.taskId)
          if (url) {
            setDownloadUrl(url)
            try {
              const response = await fetch(url)
              if (response.ok) {
                const blob = await response.blob()
                downloadBlob(blob, filename)
              } else {
                window.open(url, '_blank')
              }
            } catch {
              window.open(url, '_blank')
            }
          }
        }
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : `${FORMAT_LABEL[format]}导出失败，请稍后重试`
        setError(message)
        throw new Error(message)
      } finally {
        setExporting(false)
      }
    },
    [pollTaskStatus],
  )

  return { exportFile, exporting, error, taskStatus, progress, downloadUrl, currentFormat, reset }
}
