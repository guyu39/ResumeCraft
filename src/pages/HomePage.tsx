// ============================================================
// 首页工作台
// 宽屏两列：左=AI日报/GitHub（Tab 切换），右=简历项目推荐（固定容器内滚动）
// 待办 + 今日新增岗位：右下角悬浮球（可折叠展开）
// 顶部导航固定
// ============================================================

import React from 'react'
import { useAuthStore } from '@/store/authStore'
import HomeHeader from '@/components/home/HomeHeader'
import DailyReportBlock from '@/components/home/DailyReport'
import Projects from '@/components/home/Projects'
import FloatingActions from '@/components/home/FloatingActions'

const HomePage: React.FC = () => {
  const { user, logout } = useAuthStore()

  const handleLogout = async () => {
    await logout()
    localStorage.removeItem('resumecraft_current_resume_id')
    window.location.href = '/'
  }

  const hour = new Date().getHours()
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-canvas text-slate-900">
      {/* 固定导航 */}
      <HomeHeader onLogout={() => void handleLogout()} />

      {/* 固定导航高度补偿（h-14 = 56px） */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-10 pt-20 sm:px-6">
        {/* 问候区 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {greeting}
            {user?.displayName ? `，${user.displayName}` : ''}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            ，专注当下，稳步推进。
          </p>
        </div>

        {/* 布局：宽屏（内容充足）左右两列：左=日报Tab，右=项目推荐；窄屏单列堆叠 */}
        <div className="grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-2">
          {/* 左列：AI 日报 / GitHub 最新项目（Tab 切换，固定容器内滚动） */}
          <div className="min-w-0">
            <DailyReportBlock />
          </div>
          {/* 右列：简历项目推荐（固定容器内滚动） */}
          <div className="min-w-0">
            <Projects />
          </div>
        </div>
      </main>

      {/* 右下角悬浮球：待办 + 新增岗位（折叠/展开） */}
      <FloatingActions />
    </div>
  )
}

export default HomePage
