// ============================================================
// useResumeStyleVars — 简历模板根节点的样式变量与属性
// 把原本在三套模板里逐字复制的 CSS 变量注入块 + data-module-title-* 属性收敛到一处。
// ============================================================

import React from 'react'
import { Resume, DEFAULT_RESUME_STYLE_SETTINGS } from '@/types/resume'

interface StyleVarsResult {
  // 展开到模板根 div 的 style
  style: React.CSSProperties
  // 展开到模板根 div 的 data-* 属性（模块标题标记/分隔线样式由 CSS 属性选择器消费）
  dataAttrs: Record<string, string>
}

// 计算简历模板根节点所需的 inline style（含 CSS 变量）与 data 属性。
// overrideMinHeight 仅 Classic 用到，其余模板固定 842px。
export function useResumeStyleVars(resume: Resume, opts?: { overrideMinHeight?: string }): StyleVarsResult {
  const styleSettings = resume.styleSettings ?? DEFAULT_RESUME_STYLE_SETTINGS
  const themeColor = resume.themeColor

  const style: React.CSSProperties = {
    minHeight: opts?.overrideMinHeight ?? '842px',
    padding: `${styleSettings.pagePaddingVertical}px ${styleSettings.pagePaddingHorizontal}px`,
    fontFamily: styleSettings.fontFamily,
    fontSize: `${styleSettings.fontSize}pt`,
    color: styleSettings.textColor,
    lineHeight: styleSettings.lineHeight,
    ['--module-spacing' as string]: `${styleSettings.moduleSpacing}px`,
    ['--paragraph-spacing' as string]: `${styleSettings.paragraphSpacing}px`,
    ['--resume-font-family' as string]: styleSettings.fontFamily,
    ['--resume-text-color' as string]: styleSettings.textColor,
    ['--resume-font-scale' as string]: String(styleSettings.fontSize / DEFAULT_RESUME_STYLE_SETTINGS.fontSize),
    ['--module-title-font-family' as string]: styleSettings.moduleTitleFontFamily ?? styleSettings.fontFamily,
    ['--module-title-font-size' as string]: `${styleSettings.moduleTitleFontSize ?? styleSettings.fontSize + 2}pt`,
    ['--module-title-color' as string]: themeColor,
  }

  const dataAttrs: Record<string, string> = {
    'data-module-title-line-position': styleSettings.moduleTitleLinePosition ?? 'left',
    'data-module-title-marker-style': styleSettings.moduleTitleMarkerStyle ?? 'bar',
    'data-module-title-marker-visible': styleSettings.moduleTitleMarkerVisible === false ? 'false' : 'true',
  }

  return { style, dataAttrs }
}
