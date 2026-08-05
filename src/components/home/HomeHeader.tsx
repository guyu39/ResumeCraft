// ============================================================
// 首页顶部导航：品牌 + 页面入口 + 用户菜单
// ============================================================

import React, { useState } from 'react'
import {
  Home, FileText, BriefcaseBusiness, Sparkles, User, ChevronDown,
  KeyRound, LogOut, FileCheck2,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import AccountDialog from '@/components/layout/AccountDialog'
import ChangePasswordDialog from '@/components/layout/ChangePasswordDialog'

interface HomeHeaderProps {
  onLogout: () => void
  /** 页面级上下文标题，展示在品牌标识右侧，如"我的简历""招聘聚合" */
  title?: string
  /** 页面级操作区，展示在用户菜单左侧，如"新建简历"按钮 */
  actions?: React.ReactNode
}

const NAV_ITEMS = [
  { label: '首页', path: '/', icon: Home },
  { label: '简历', path: '/resumes', icon: FileText },
  { label: '投递管理', path: '/applications', icon: BriefcaseBusiness },
  { label: '招聘聚合', path: '/jobs', icon: Sparkles },
]

const HomeHeader: React.FC<HomeHeaderProps> = ({ onLogout, title, actions }) => {
  const { user } = useAuthStore()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showAccount, setShowAccount] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)

  const current = window.location.pathname

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:px-6">
          {/* 品牌标识 */}
          <a href="/" className="mr-2 flex shrink-0 items-center gap-2" aria-label="首页工作台">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
              <FileCheck2 className="h-4 w-4" />
            </span>
            <span className="hidden text-sm font-bold tracking-tight text-ink lg:block">
              ResumeCraft 工作台
            </span>
          </a>

          {/* 左侧页面上下文标题：如"我的简历""招聘聚合" */}
          {title && (
            <>
              <span className="hidden h-5 w-px shrink-0 bg-line sm:block" aria-hidden="true" />
              <h1 className="shrink-0 truncate text-sm font-semibold text-ink sm:text-base">
                {title}
              </h1>
            </>
          )}

          {/* 主导航：靠右排列，空间不足时换行兜底 */}
          <nav className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-0.5 sm:gap-1" aria-label="主导航">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const active = item.path === '/' ? current === '/' : current.startsWith(item.path)
              return (
                <a
                  key={item.path}
                  href={item.path}
                  className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-brand-soft text-primary'
                      : 'text-muted hover:bg-slate-50 hover:text-ink'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </a>
              )
            })}
          </nav>

          {/* 页面级操作区：如"新建简历"按钮 */}
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}

          {/* 用户菜单 */}
          {user && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-muted transition-colors hover:bg-slate-50 hover:text-ink"
                aria-haspopup="menu"
                aria-expanded={showUserMenu}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-primary">
                  <User className="h-3.5 w-3.5" />
                </span>
                <span className="hidden max-w-[120px] truncate md:block">
                  {user.displayName || user.email}
                </span>
                <ChevronDown className={`h-3 w-3 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
              </button>

              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute right-0 top-full z-40 mt-1 w-44 rounded-xl border border-line bg-surface py-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); setShowAccount(true) }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                    >
                      <User className="h-3.5 w-3.5" />
                      账户设置
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); setShowChangePassword(true) }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      修改密码
                    </button>
                    <button
                      type="button"
                      onClick={onLogout}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      退出登录
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      <AccountDialog open={showAccount} onClose={() => setShowAccount(false)} user={user} />
      <ChangePasswordDialog
        open={showChangePassword}
        onClose={() => setShowChangePassword(false)}
        email={user?.email || ''}
        onSuccess={onLogout}
      />
    </>
  )
}

export default HomeHeader
