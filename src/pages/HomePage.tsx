// ============================================================
// 首页工作台
// 结构（自上而下）：问候区 → 求职概览 KPI → 待办/新增岗位（正文常驻）
// → AI 日报 / GitHub 项目 / 简历项目推荐（Tab 切换）
// 状态与行动优先：KPI/待办/新增岗位置于首屏，资讯与素材下移一层。
// 顶部导航固定
// ============================================================

import React, { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import HomeHeader from '@/components/home/HomeHeader'
import KpiOverview from '@/components/home/KpiOverview'
import TodoBlock from '@/components/home/TodoBlock'
import NewJobsBlock from '@/components/home/NewJobsBlock'
import DailyReportBlock from '@/components/home/DailyReport'

const HomePage: React.FC = () => {
  const { user, logout } = useAuthStore()

  // 首页隐藏页面级原生滚动条（保留滚动能力），离开时恢复
  useEffect(() => {
    document.body.classList.add('no-scrollbar')
    return () => document.body.classList.remove('no-scrollbar')
  }, [])

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
      <HomeHeader onLogout={() => void handleLogout()} title="首页" />

      {/* 固定导航高度补偿（h-14 = 56px） */}
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 pb-10 pt-20 sm:px-6">
        {/* 问候区 */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {greeting}
            {user?.displayName ? `，${user.displayName}` : ''}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            ，专注当下，稳步推进。
          </p>
        </div>

        {/* 求职概览：已投递/笔试/面试/Offer，点击跳转数据分析 */}
        <KpiOverview />

        {/* 近期待办 + 今日新增岗位：正文常驻，桌面左右并排 */}
        <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <TodoBlock />
          <NewJobsBlock />
        </div>

        {/* AI 日报 / GitHub 最新项目 / 简历项目推荐（Tab 切换，固定容器内滚动） */}
        <DailyReportBlock />
      </main>
    </div>
  )
}

export default HomePage
