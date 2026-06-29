import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-lucide': ['lucide-react'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api/ark': {
        target: 'https://ark.cn-beijing.volces.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/ark/, '/api/v3'),
      },
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        timeout: 600000, // 10 分钟 — AI 面试评估/录音分析等长请求需要较长时间
        proxyTimeout: 600000, // 代理到后端的超时也设为 10 分钟
        ws: true, // 支持 WebSocket
        configure: (proxy) => {
          // SSE 流式响应需要禁用响应缓冲，确保 chunk 实时透传
          proxy.on('proxyRes', (proxyRes) => {
            const isSSE = proxyRes.headers['content-type']?.includes('text/event-stream')
            if (isSSE) {
              // 显式声明流式传输相关 header，避免被代理缓冲
              proxyRes.headers['cache-control'] = 'no-cache, no-transform'
              proxyRes.headers['x-accel-buffering'] = 'no'
              delete proxyRes.headers['content-length']
            }
          })
          proxy.on('error', (err, _req, res) => {
            // 代理层错误时返回明确的 5xx，避免 socket hang up 让浏览器误判
            const message = err.message || '后端服务未启动或无法连接，请确认后端已在 localhost:8787 运行'
            console.error('[vite-proxy] error:', message)
            if (res && 'writeHead' in res && !res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: { code: 'PROXY_ERROR', message } }))
            }
          })
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
