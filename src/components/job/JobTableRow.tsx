// ============================================================
// JobTableRow — /jobs 表格中的一行
// 设计：白底表行、hover 浅灰、blue-600 主操作。
// 类型/行业按归一化大类配色（标签仍显示原始值，信息不丢）；
// 所有可能被截断的单元格均带 title，鼠标悬停展示完整信息。
// ============================================================

import React from 'react'
import { ExternalLink, Copy, CheckCircle2, Circle } from 'lucide-react'
import { toast } from '@/components/common/Toast'
import type { JobPosting } from '@/api/jobPosting'

// 招聘类型大类 → 徽章配色（由 recruitmentCategory 决定颜色，标签显示原始值）
const RECRUIT_COLORS: Record<string, string> = {
  实习: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  校招: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  专项计划: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  竞赛: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  博士科研: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  社招: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  其他: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200',
}

// 行业大类 → 徽章配色
const INDUSTRY_COLORS: Record<string, string> = {
  金融: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  '互联网/科技': 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  人工智能: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  '半导体/电子': 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  汽车: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  游戏: 'bg-fuchsia-50 text-fuchsia-700 ring-1 ring-fuchsia-200',
  新能源: 'bg-lime-50 text-lime-700 ring-1 ring-lime-200',
  先进制造: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  医疗健康: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
  '消费/零售': 'bg-pink-50 text-pink-700 ring-1 ring-pink-200',
  教育: 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200',
  航空航天: 'bg-slate-100 text-slate-700 ring-1 ring-slate-300',
  通信: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  地产建筑: 'bg-stone-50 text-stone-700 ring-1 ring-stone-200',
  能源化工: 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200',
  其他: 'bg-slate-50 text-slate-500 ring-1 ring-slate-200',
}

const defaultBadge = 'bg-slate-50 text-slate-600 ring-1 ring-slate-200'
const formatDate = (iso?: string) => (iso ? iso.slice(0, 10) : '—')

interface JobTableRowProps {
  job: JobPosting
  isAuthenticated: boolean
  onToggleApplied: (job: JobPosting) => void
}

const JobTableRow: React.FC<JobTableRowProps> = ({ job, isAuthenticated, onToggleApplied }) => {
  const copyReferral = async () => {
    if (!job.referralCode) return
    try {
      await navigator.clipboard.writeText(job.referralCode)
      toast('内推码已复制', 'success')
    } catch {
      toast('复制失败，请手动复制', 'error')
    }
  }

  const handleToggleApplied = () => {
    if (!isAuthenticated) {
      toast('请先登录后再标记投递状态', 'error')
      return
    }
    onToggleApplied(job)
  }

  return (
    <tr className="group border-b border-slate-100 transition last:border-0 hover:bg-slate-50">
      {/* 企业 */}
      <td className="max-w-[200px] px-3 py-3">
        <div className="truncate font-medium text-slate-900" title={job.companyName || undefined}>
          {job.companyName || '—'}
        </div>
      </td>

      {/* 行业：归一化大类配色，原始值作标签，悬停看完整 */}
      <td className="max-w-[160px] px-3 py-3">
        <span
          title={job.industry || undefined}
          className={`inline-flex max-w-full items-center truncate rounded-full px-2.5 py-0.5 text-xs font-medium ${
            INDUSTRY_COLORS[job.industryCategory ?? ''] || defaultBadge
          }`}
        >
          {job.industry || '—'}
        </span>
      </td>

      {/* 招聘岗位 */}
      <td className="max-w-[260px] px-3 py-3">
        <div className="truncate text-slate-600" title={job.positions || undefined}>
          {job.positions || '—'}
        </div>
      </td>

      {/* 类型：归一化大类配色 */}
      <td className="px-3 py-3">
        <span
          title={job.recruitmentType || undefined}
          className={`inline-flex max-w-[160px] items-center truncate rounded-full px-2.5 py-0.5 text-xs font-medium ${
            RECRUIT_COLORS[job.recruitmentCategory ?? ''] || defaultBadge
          }`}
        >
          {job.recruitmentType || '—'}
        </span>
      </td>

      {/* 开启时间 */}
      <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDate(job.openDate)}</td>

      {/* 地点 */}
      <td className="max-w-[140px] px-3 py-3">
        <div className="truncate text-slate-600" title={job.location || undefined}>
          {job.location || '—'}
        </div>
      </td>

      {/* 是否投递 */}
      <td className="px-3 py-3">
        <button
          type="button"
          onClick={handleToggleApplied}
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition ${
            job.applied
              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100'
              : 'bg-slate-50 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100 hover:text-slate-700'
          }`}
        >
          {job.applied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
          {job.applied ? '投递' : '投递'}
        </button>
      </td>

      {/* 操作 */}
      <td className="px-3 py-3 text-right">
        <div className="flex flex-nowrap items-center justify-end gap-2">
          {job.applicationUrl ? (
            <a
              href={job.applicationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              投递
            </a>
          ) : (
            <span className="whitespace-nowrap text-xs text-slate-300">暂无链接</span>
          )}
          {job.referralCode && (
            <button
              type="button"
              onClick={copyReferral}
              title={job.referralCode}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
            >
              <Copy className="h-3.5 w-3.5" />
              内推码
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

export default JobTableRow
