const STYLE_ID = 'rc-autoapply-highlight'

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes rc-fade-success {
      0% { box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.6); background-color: rgba(34, 197, 94, 0.08); }
      70% { box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.3); background-color: rgba(34, 197, 94, 0.03); }
      100% { box-shadow: none; background-color: transparent; }
    }
    @keyframes rc-fade-warning {
      0% { box-shadow: 0 0 0 2px rgba(234, 179, 8, 0.6); background-color: rgba(234, 179, 8, 0.08); }
      100% { box-shadow: 0 0 0 2px rgba(234, 179, 8, 0.3); background-color: rgba(234, 179, 8, 0.05); }
    }
    .rc-highlight-success {
      animation: rc-fade-success 3s ease-out forwards;
      border-radius: 4px;
    }
    .rc-highlight-warning {
      animation: rc-fade-warning 3s ease-out forwards;
      border-radius: 4px;
      position: relative;
    }
    .rc-highlight-warning::after {
      content: '未能自动识别，请手动填写';
      position: absolute;
      top: -24px;
      left: 0;
      font-size: 11px;
      color: #b45309;
      background: #fef3c7;
      padding: 2px 6px;
      border-radius: 3px;
      white-space: nowrap;
      pointer-events: none;
      z-index: 99999;
    }
    #rc-fill-summary {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 16px 20px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.1);
      z-index: 99999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      color: #1f2937;
      min-width: 240px;
      transition: opacity 0.3s;
    }
    #rc-fill-summary h4 {
      margin: 0 0 8px 0;
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    #rc-fill-summary .rc-stats {
      display: flex;
      gap: 12px;
      margin-bottom: 8px;
    }
    #rc-fill-summary .rc-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    #rc-fill-summary .rc-stat-value {
      font-size: 20px;
      font-weight: 700;
    }
    #rc-fill-summary .rc-stat-label {
      font-size: 11px;
      color: #6b7280;
    }
    #rc-fill-summary .rc-close {
      position: absolute;
      top: 8px;
      right: 10px;
      background: none;
      border: none;
      cursor: pointer;
      font-size: 16px;
      color: #9ca3af;
      line-height: 1;
    }
  `
  document.head.appendChild(style)
}

export function highlightSuccess(el: HTMLElement): void {
  injectStyles()
  el.classList.add('rc-highlight-success')
}

export function highlightUnmatched(el: HTMLElement): void {
  injectStyles()
  el.classList.add('rc-highlight-warning')
}

export function showSummary(filled: number, unmatched: number): void {
  injectStyles()

  const existing = document.getElementById('rc-fill-summary')
  if (existing) existing.remove()

  const total = filled + unmatched

  const panel = document.createElement('div')
  panel.id = 'rc-fill-summary'
  panel.innerHTML = `
    <button class="rc-close">&times;</button>
    <h4>📋 ResumeCraft 填充结果</h4>
    <div class="rc-stats">
      <div class="rc-stat">
        <span class="rc-stat-value" style="color: #16a34a">${filled}</span>
        <span class="rc-stat-label">成功填充</span>
      </div>
      <div class="rc-stat">
        <span class="rc-stat-value" style="color: #ca8a04">${unmatched}</span>
        <span class="rc-stat-label">需手动补充</span>
      </div>
      <div class="rc-stat">
        <span class="rc-stat-value">${total}</span>
        <span class="rc-stat-label">总字段数</span>
      </div>
    </div>
  `

  panel.querySelector('.rc-close')!.addEventListener('click', () => panel.remove())

  setTimeout(() => {
    panel.style.opacity = '0'
    setTimeout(() => panel.remove(), 300)
  }, 8000)

  document.body.appendChild(panel)
}

export function clearHighlights(): void {
  document.querySelectorAll('.rc-highlight-success, .rc-highlight-warning').forEach((el) => {
    el.classList.remove('rc-highlight-success', 'rc-highlight-warning')
  })
  const panel = document.getElementById('rc-fill-summary')
  if (panel) panel.remove()
}
