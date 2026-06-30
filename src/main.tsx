import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// 拦截浏览器原生打印快捷键（Ctrl/Cmd+P）：本应用通过「导出 PDF」按钮生成简历，
// 原生打印无法还原排版。仅拦截快捷键，不影响后端导出（导出走 chromedp，与此无关）。
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
    e.preventDefault()
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
