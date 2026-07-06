import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// 拦截浏览器原生打印（Ctrl/Cmd+P、右键菜单"打印"、菜单栏"打印"）：
// 本应用通过「导出 PDF」按钮生成简历，原生打印无法还原排版。
// 打印预览时隐藏内容并提示用户。后端 chromedp 导出走独立 HTML，不触发此事件，不影响导出。
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
    e.preventDefault()
  }
})

window.addEventListener('beforeprint', () => {
  document.body.style.visibility = 'hidden'
  const tip = document.createElement('div')
  tip.id = '__no_print_tip'
  tip.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;font-size:18px;color:#64748B;z-index:9999;background:#fff;'
  tip.textContent = '请使用「导出 PDF」按钮生成简历'
  document.body.appendChild(tip)
})

window.addEventListener('afterprint', () => {
  document.body.style.visibility = ''
  document.getElementById('__no_print_tip')?.remove()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
