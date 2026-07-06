/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1A56DB',
        'primary-light': '#EEF2FF',
        // 语义色 token（Flat 风格统一）
        ink: '#0F172A',          // 主文字
        muted: '#64748B',        // 次文字
        line: '#E2E8F0',         // 边框/分隔
        surface: '#FFFFFF',      // 卡片/面板底
        canvas: '#F6F8FB',       // 页面底
        'brand-soft': '#EEF2FF', // 品牌色浅底（primary/5 等价）
      },
    },
  },
  plugins: [],
}
