// ============================================================
// useExportPDF — PDF 导出逻辑
// 方案：调用后端 PDF 服务（Go）
// ============================================================

import { useCallback, useState } from 'react'
import { Resume, PersonalData } from '@/types/resume'

const PDF_EXPORT_ENDPOINT = '/api/pdf/export'
const EXPORT_ERROR_MESSAGE = '请检查后端服务是否启动'

interface ExportOptions {
  filename?: string
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

const buildHTMLDocument = (contentElement: HTMLElement): string => {
  const styleTags = Array.from(document.querySelectorAll('style')).map((node) => node.outerHTML).join('\n')
  const linkTags = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((node) => node.outerHTML).join('\n')

  return [
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
    contentElement.outerHTML,
    '</body>',
    '</html>',
  ].join('')
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

export function useExportPDF() {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const exportPDF = useCallback(
    async (elementId: string, resume: Resume, options: ExportOptions = {}) => {
      setExporting(true)
      setError(null)

      try {
        const sourceElement = document.getElementById(elementId)
        if (!sourceElement) throw new Error('简历预览区域未找到')

        await waitForFontsReady()
        // 确保图片加载完成
        await waitForImagesReady(sourceElement)

        const personalData = resume.modules.find(
          (m) => m.type === 'personal'
        )?.data as PersonalData | undefined
        const name = personalData?.name?.trim() || '简历'
        const filename =
          options.filename ??
          `${name}_${resume.title || '简历'}.pdf`.replace(/[\/\\:*?"<>|]/g, '_')

        const cloned = sourceElement.cloneNode(true) as HTMLElement
        // 导出源节点在页面中通常是离屏隐藏态，克隆后需强制恢复可渲染样式。
        cloned.style.position = 'static'
        cloned.style.left = '0'
        cloned.style.top = '0'
        cloned.style.visibility = 'visible'
        cloned.style.opacity = '1'
        cloned.style.transform = 'none'
        cloned.style.pointerEvents = 'auto'
        const html = buildHTMLDocument(cloned)

        const response = await fetch(PDF_EXPORT_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ html, filename }),
        })

        if (!response.ok) {
          throw new Error(EXPORT_ERROR_MESSAGE)
        }

        const blob = await response.blob()
        if (blob.size === 0) {
          throw new Error(EXPORT_ERROR_MESSAGE)
        }

        downloadBlob(blob, filename)
      } catch (e) {
        setError(EXPORT_ERROR_MESSAGE)
        throw new Error(EXPORT_ERROR_MESSAGE)
      } finally {
        setExporting(false)
      }
    },
    []
  )

  return { exportPDF, exporting, error }
}
