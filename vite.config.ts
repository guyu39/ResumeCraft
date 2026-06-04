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
        timeout: 300000, // 5 minutes — AI 翻译/评估等长请求需要较长时间
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
