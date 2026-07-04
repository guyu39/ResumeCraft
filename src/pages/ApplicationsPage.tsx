import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Download,
  FilePlus2,
  FileText,
  Layers3,
  Link2,
  PanelRightClose,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react'
import { applicationsApi, resumeApi } from '@/api'
import type {
  CreateInterviewRequest,
  JobApplication,
  JobApplicationListItem,
  JobApplicationStatus,
  ListApplicationsParams,
} from '@/api/applications'
import type { ResumeListItem } from '@/api/types'
import type { SnapshotListItem } from '@/api/resume'
import ToastContainer, { toast } from '@/components/common/Toast'
import YearMonthPicker from '@/components/common/YearMonthPicker'

type DisplayStatus = 'submitted' | 'written_test' | 'interview' | 'offer' | 'terminated'

interface CreateFormState {
  resumeId: string
  snapshotVersionId: string
  companyName: string
  department: string
  targetTitle: string
  jdText: string
  source: string
  applicationUrl: string
  submittedAt: string
  writtenTestAt: string
}

const PAGE_SIZE = 10
const PAGE_SIZE_OPTIONS = [10, 30]

const STATUS_LABELS: Record<JobApplicationStatus, string> = {
  pending_adaptation: '已投递',
  adapted: '已投递',
  submitted: '已投递',
  written_test: '笔试',
  interview: '面试',
  offer: 'offer',
  rejected: '终止',
  withdrawn: '终止',
}

const DISPLAY_STATUS_OPTIONS: Array<{ value: DisplayStatus | ''; label: string }> = [
  { value: '', label: '全部状态' },
  { value: 'submitted', label: '已投递' },
  { value: 'interview', label: '面试中' },
  { value: 'offer', label: 'offer' },
  { value: 'terminated', label: '终止' },
]

const EMPTY_CREATE_FORM: CreateFormState = {
  resumeId: '',
  snapshotVersionId: '',
  companyName: '',
  department: '',
  targetTitle: '',
  jdText: '',
  source: '手动录入',
  applicationUrl: '',
  submittedAt: '',
  writtenTestAt: '',
}

const emptyInterviewForm: CreateInterviewRequest = {
  round: '',
  scheduledAt: undefined,
  format: '',
  interviewer: '',
  questions: '',
  notes: '',
  result: '',
}

const fieldInputClass = 'mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
const fieldTextareaClass = 'mt-1 h-40 w-full resize-none overflow-y-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition [scrollbar-width:none] focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 [&::-webkit-scrollbar]:hidden'
const fieldLabelClass = 'text-xs font-medium text-slate-500'
const hiddenScrollClass = 'overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
const horizontalScrollClass = 'overflow-x-auto overscroll-x-contain [scrollbar-width:thin] [scrollbar-color:#93c5fd_#e2e8f0] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-blue-300 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-200'

const stickyActionClass = 'sticky right-0 z-10 border-l border-t border-slate-100 bg-white px-2 py-3 text-center shadow-[-12px_0_18px_-18px_rgba(15,23,42,0.5)]'
const stickyActionHeadClass = 'sticky right-0 z-10 border-l border-slate-100 bg-slate-50 px-2 py-3 text-center shadow-[-12px_0_18px_-18px_rgba(15,23,42,0.5)]'

function rowDisplayStatus(status: JobApplicationStatus): string {
  if (status === 'interview') return '面试中'
  if (status === 'offer') return '已offer'
  if (status === 'rejected' || status === 'withdrawn') return '终止'
  if (status === 'written_test') return '笔试'
  return '已投递'
}
const toolbarPrimaryButtonClass = 'inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-blue-600/30'
const toolbarSecondaryButtonClass = 'inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 shadow-lg shadow-blue-600/10 transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-100'
const finalStatuses: JobApplicationStatus[] = ['offer', 'rejected', 'withdrawn']
const interviewRoundOptions = ['一面', '二面', '三面', '主管面', 'HR面']
const ROUND_ORDER: Record<string, number> = { '一面': 1, '二面': 2, '三面': 3, '主管面': 4, 'HR面': 5 }

// 列表页状态内联下拉可选项：后端 status -> 中文展示 + 反查映射
const STATUS_SELECT_OPTIONS: Array<{ value: JobApplicationStatus; label: string }> = [
  { value: 'submitted', label: '已投递' },
  { value: 'written_test', label: '笔试' },
  { value: 'interview', label: '面试' },
  { value: 'offer', label: '已offer' },
  { value: 'rejected', label: '终止' },
  { value: 'withdrawn', label: '放弃' },
]

function displayToBackendStatus(display: string): JobApplicationStatus {
  const found = STATUS_SELECT_OPTIONS.find((o) => o.label === display)
  return found ? found.value : 'submitted'
}

function isToday(ts?: number): boolean {
  if (!ts) return false
  const d = new Date(ts)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

function canDeleteInterview(interviews: { id: string; scheduledAt?: number; createdAt: number }[], targetId: string): boolean {
  if (interviews.length <= 1) return true
  const sorted = [...interviews].sort((a, b) => (b.scheduledAt || b.createdAt) - (a.scheduledAt || a.createdAt))
  return sorted[0]?.id === targetId
}

function getAvailableRounds(existingRounds: string[], editingRound?: string): string[] {
  // 编辑时排除当前 round，避免它被当成"已存在"而被过滤
  const filtered = editingRound ? existingRounds.filter((r) => r !== editingRound) : existingRounds
  const existWeights = filtered.map((r) => ROUND_ORDER[r] || 0).filter((w) => w > 0)
  const available = interviewRoundOptions.filter((r) => {
    const w = ROUND_ORDER[r]
    if (w === 1) return true
    // 跳阶段允许：只要存在任意更低权重阶段即可
    return existWeights.some((ew) => ew < w)
  })
  if (editingRound && !available.includes(editingRound)) available.push(editingRound)
  return available
}

// 日期递增预校验：新增/更新的日期必须晚于所有权重更小的已有面试
function validateInterviewDate(interviews: { round: string; scheduledAt?: number }[], targetRound: string, scheduledAt?: number): string | null {
  if (!scheduledAt) return null
  const w = ROUND_ORDER[targetRound] || 0
  if (w === 0) return null
  let maxPrior = 0
  for (const it of interviews) {
    const ew = ROUND_ORDER[it.round] || 0
    if (ew > 0 && ew < w && it.scheduledAt && it.scheduledAt > maxPrior) {
      maxPrior = it.scheduledAt
    }
  }
  if (maxPrior > 0 && scheduledAt <= maxPrior) {
    return `${targetRound}日期必须晚于更早面试日期`
  }
  return null
}
const interviewResultOptions = ['通过', '终止']

function toDisplayStatus(status: JobApplicationStatus): DisplayStatus {
  if (status === 'written_test') return 'written_test'
  if (status === 'interview') return 'interview'
  if (status === 'offer') return 'offer'
  if (status === 'rejected' || status === 'withdrawn') return 'terminated'
  return 'submitted'
}

function toBackendStatuses(status: DisplayStatus | ''): JobApplicationStatus[] | undefined {
  if (!status) return undefined
  if (status === 'submitted') return ['pending_adaptation', 'adapted', 'submitted']
  if (status === 'terminated') return ['rejected', 'withdrawn']
  return [status]
}

function displayDate(value?: number): string {
  if (!value) return '无'
  return new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function fromDatePickerValue(value: string): number | undefined {
  if (!value) return undefined
  const timestamp = new Date(`${value}T00:00:00`).getTime()
  return Number.isNaN(timestamp) ? undefined : timestamp
}

function toDatePickerValue(value?: number): string {
  if (!value) return ''
  const date = new Date(value)
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return localDate.toISOString().slice(0, 10)
}

function summarizeAiRun(summary: Record<string, unknown>): string {
  const values = Object.values(summary || {})
  const firstText = values.find((value) => typeof value === 'string' && value.trim())
  if (typeof firstText === 'string') return firstText
  return JSON.stringify(summary || {})
}

function inferStatusFromInterview(form: CreateInterviewRequest): JobApplicationStatus | undefined {
  const text = `${form.round || ''} ${form.result || ''}`.toLowerCase()
  if (text.includes('终止')) return 'withdrawn'
  if (form.round.trim() || form.notes?.trim()) return 'interview'
  return undefined
}

function shouldAutoUpdateStatus(currentStatus: JobApplicationStatus, nextStatus: JobApplicationStatus): boolean {
  if (currentStatus === nextStatus || finalStatuses.includes(currentStatus)) return false
  if (nextStatus === 'written_test') return toDisplayStatus(currentStatus) === 'submitted'
  if (nextStatus === 'interview') return toDisplayStatus(currentStatus) === 'submitted' || currentStatus === 'written_test'
  return nextStatus === 'offer' || nextStatus === 'withdrawn'
}

const STATUS_COLOR_CLASS: Record<string, string> = {
  '面试中': 'bg-amber-50 text-amber-700 ring-amber-200',
  '终止': 'bg-red-50 text-red-600 ring-red-200',
  '已offer': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  '笔试': 'bg-purple-50 text-purple-700 ring-purple-200',
  '已投递': 'bg-slate-100 text-slate-600 ring-slate-200',
}

const ApplicationsPage: React.FC = () => {
  const [items, setItems] = useState<JobApplicationListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('id'))
  const [detailOpen, setDetailOpen] = useState(Boolean(new URLSearchParams(window.location.search).get('id')))
  const [detail, setDetail] = useState<JobApplication | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<DisplayStatus | ''>('')
  const [resumeId, setResumeId] = useState('')
  const [resumes, setResumes] = useState<ResumeListItem[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE_FORM)
  const [createSnapshots, setCreateSnapshots] = useState<SnapshotListItem[]>([])
  const [interviewForm, setInterviewForm] = useState<CreateInterviewRequest>(emptyInterviewForm)
  const [flowEditorOpen, setFlowEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingInterviewId, setEditingInterviewId] = useState<string | null>(null)

  const filters = useMemo<ListApplicationsParams>(() => ({
    page,
    pageSize,
    keyword: keyword.trim() || undefined,
    resumeId: resumeId || undefined,
    statuses: toBackendStatuses(status),
  }), [keyword, page, pageSize, resumeId, status])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await applicationsApi.list(filters)
      setItems(res.items || [])
      setTotalPages(res.pagination?.totalPages || 1)
    } catch (err) {
      toast(err instanceof Error ? err.message : '加载投递记录失败')
    } finally {
      setLoading(false)
    }
  }, [filters])

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    try {
      const app = await applicationsApi.get(id)
      setDetail(app)
    } catch (err) {
      toast(err instanceof Error ? err.message : '加载投递详情失败')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    loadList()
  }, [loadList])

  useEffect(() => {
    resumeApi.list({ page: 1, pageSize: 100 }).then((res) => setResumes(res.items || [])).catch(() => setResumes([]))
  }, [])

  useEffect(() => {
    if (selectedId) loadDetail(selectedId)
  }, [loadDetail, selectedId])

  useEffect(() => {
    setPage(1)
  }, [keyword, resumeId, status, pageSize])

  useEffect(() => {
    if (!createOpen || !createForm.resumeId) {
      setCreateSnapshots([])
      return
    }
    resumeApi.getSnapshots(createForm.resumeId, { limit: 100, includeAuto: true })
      .then((res) => {
        const nextSnapshots = res.items || []
        setCreateSnapshots(nextSnapshots)
        setCreateForm((current) => current.snapshotVersionId ? current : { ...current, snapshotVersionId: nextSnapshots[0]?.id || '' })
      })
      .catch(() => setCreateSnapshots([]))
  }, [createForm.resumeId, createForm.snapshotVersionId, createOpen])

  const timelineItems = useMemo(() => {
    if (!detail) return []
    return [
      detail.submittedAt ? {
        key: 'submitted',
        time: detail.submittedAt,
        title: '投递',
        description: `${detail.companyName || '未填写公司'} · ${detail.targetTitle}`,
        interviewId: undefined as string | undefined,
        round: '',
        result: '',
        notes: '',
        scheduledAt: undefined as number | undefined,
      } : null,
      ...(detail.interviews || []).map((item) => ({
        key: `interview-${item.id}`,
        time: item.scheduledAt || item.createdAt,
        title: item.round || '面试流程',
        description: '',
        interviewId: item.id,
        round: item.round,
        result: item.result || '',
        notes: item.notes || '',
        scheduledAt: item.scheduledAt,
      })),
      ...(detail.statusEvents || [])
        .filter((event) => event.toStatus === 'offer' || event.toStatus === 'withdrawn' || event.toStatus === 'rejected')
        .slice(0, 1)
        .map((event) => ({
          key: `status-${event.id}`,
          time: event.createdAt,
          title: STATUS_LABELS[event.toStatus],
          description: event.note || `状态更新为${STATUS_LABELS[event.toStatus]}`,
          interviewId: undefined as string | undefined,
          round: '',
          result: '',
          notes: '',
          scheduledAt: undefined as number | undefined,
        })),
    ].filter(Boolean).sort((a, b) => (a?.time || 0) - (b?.time || 0))
  }, [detail])

  const openCreateModal = () => {
    setEditingId(null)
    setCreateForm({ ...EMPTY_CREATE_FORM, resumeId: resumes[0]?.id || '' })
    setCreateOpen(true)
  }

  const openEditModal = async (id: string) => {
    try {
      const app = await applicationsApi.get(id)
      setEditingId(id)
      setCreateForm({
        resumeId: app.resumeId,
        snapshotVersionId: app.snapshotVersionId,
        companyName: app.companyName || '',
        department: app.department || '',
        targetTitle: app.targetTitle || '',
        jdText: app.jdText || '',
        source: app.source || '手动录入',
        applicationUrl: app.applicationUrl || '',
        submittedAt: app.submittedAt ? toDatePickerValue(app.submittedAt) : '',
        writtenTestAt: app.writtenTestAt ? toDatePickerValue(app.writtenTestAt) : '',
      })
      setCreateOpen(true)
    } catch (err) {
      toast(err instanceof Error ? err.message : '加载详情失败')
    }
  }

  const selectApplication = (id: string) => {
    if (selectedId === id && detailOpen) {
      setDetailOpen(false)
      setFlowEditorOpen(false)
      return
    }
    setSelectedId(id)
    setDetailOpen(true)
  }

  const saveApplication = async () => {
    if (!createForm.resumeId || !createForm.snapshotVersionId) {
      toast('请选择关联简历和快照')
      return
    }
    if (!createForm.targetTitle.trim() || !createForm.jdText.trim()) {
      toast('请填写岗位和岗位JD')
      return
    }
    setCreating(true)
    try {
      const submittedAt = fromDatePickerValue(createForm.submittedAt)
      const writtenTestAt = fromDatePickerValue(createForm.writtenTestAt)
      if (editingId) {
        await applicationsApi.update(editingId, {
          resumeId: createForm.resumeId,
          snapshotVersionId: createForm.snapshotVersionId,
          companyName: createForm.companyName.trim(),
          department: createForm.department.trim(),
          targetTitle: createForm.targetTitle.trim(),
          jdText: createForm.jdText.trim(),
          source: createForm.source.trim() || '手动录入',
          applicationUrl: createForm.applicationUrl.trim(),
          submittedAt: submittedAt ?? 0,
          writtenTestAt: writtenTestAt ?? 0,
        })
        if (detail?.id === editingId) await loadDetail(editingId)
        await loadList()
        toast('投递记录已更新', 'success')
      } else {
        const created = await applicationsApi.create({
          resumeId: createForm.resumeId,
          snapshotVersionId: createForm.snapshotVersionId,
          companyName: createForm.companyName.trim(),
          department: createForm.department.trim(),
          targetTitle: createForm.targetTitle.trim(),
          jdText: createForm.jdText.trim(),
          source: createForm.source.trim() || '手动录入',
          applicationUrl: createForm.applicationUrl.trim(),
        })
        if (submittedAt) await applicationsApi.update(created.id, { submittedAt })
        if (writtenTestAt) await applicationsApi.update(created.id, { writtenTestAt })
        setSelectedId(created.id)
        setDetailOpen(true)
        await loadList()
        await loadDetail(created.id)
        toast('投递记录已新增', 'success')
      }
      setCreateOpen(false)
      setCreateForm(EMPTY_CREATE_FORM)
      setEditingId(null)
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存失败')
    } finally {
      setCreating(false)
    }
  }

  const changeApplicationStatus = async (id: string, status: JobApplicationStatus) => {
    const target = items.find((item) => item.id === id)
    if (target && finalStatuses.includes(target.status) && !finalStatuses.includes(status)) {
      const confirmed = window.confirm('该投递当前为已offer或终止状态，切换到其他流程将清空原有的面试记录，是否继续？')
      if (!confirmed) return
    }
    try {
      await applicationsApi.updateStatus(id, status)
      await loadList()
      if (detail?.id === id) await loadDetail(id)
      toast(`${target?.companyName || '投递记录'}状态已更新为${rowDisplayStatus(status)}`)
    } catch (err) {
      toast(err instanceof Error ? err.message : '更新状态失败')
    }
  }

  const deleteApplication = async (id: string) => {
    const target = items.find((item) => item.id === id)
    const confirmed = window.confirm(`确定删除「${target?.companyName || '未填写公司'} · ${target?.targetTitle || '未填写岗位'}」吗？`)
    if (!confirmed) return
    try {
      await applicationsApi.delete(id)
      if (selectedId === id) {
        setSelectedId(null)
        setDetail(null)
        setDetailOpen(false)
      }
      await loadList()
      toast('投递记录已删除', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : '删除投递记录失败')
    }
  }

  const openEditInterview = (item: { id: string; round: string; scheduledAt?: number; notes?: string; result?: string }) => {
    setEditingInterviewId(item.id)
    setInterviewForm({ ...emptyInterviewForm, round: item.round, scheduledAt: item.scheduledAt, notes: item.notes || '', result: item.result || '' })
    setFlowEditorOpen(true)
  }

  const saveInterview = async () => {
    if (!detail) return
    if (finalStatuses.includes(detail.status)) {
      toast('投递已终止或已 offer，不可再添加面试')
      return
    }
    if (!interviewForm.round.trim() && !interviewForm.notes?.trim()) {
      toast('请填写流程名称或面试记录')
      return
    }
    // 前端预校验：日期递增（后端亦会权威校验）
    const dateErr = validateInterviewDate(detail.interviews || [], interviewForm.round, interviewForm.scheduledAt)
    if (dateErr) {
      toast(dateErr)
      return
    }
    try {
      if (editingInterviewId) {
        await applicationsApi.updateInterview(detail.id, editingInterviewId, interviewForm)
      } else {
        await applicationsApi.createInterview(detail.id, interviewForm)
        const nextStatus = inferStatusFromInterview(interviewForm)
        if (nextStatus && shouldAutoUpdateStatus(detail.status, nextStatus)) {
          await applicationsApi.updateStatus(detail.id, nextStatus)
        }
      }
      setInterviewForm(emptyInterviewForm)
      setEditingInterviewId(null)
      setFlowEditorOpen(false)
      await loadDetail(detail.id)
      await loadList()
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存面试记录失败')
    }
  }

  const deleteInterview = async (interviewId: string) => {
    if (!detail) return
    try {
      await applicationsApi.deleteInterview(detail.id, interviewId)
      await loadDetail(detail.id)
      await loadList()
    } catch (err) {
      toast(err instanceof Error ? err.message : '删除面试记录失败')
    }
  }

  const exportExcel = async () => {
    try {
      const blob = await applicationsApi.exportExcel(filters)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `投递记录-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast(err instanceof Error ? err.message : '导出失败')
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_48%,#f8fafc_100%)] text-slate-900">
      <ToastContainer />
      <div className="border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => { window.location.href = '/' }} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700" title="返回简历列表">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">投递管理 / 职位库</h1>
              <p className="text-sm text-slate-500">左侧管理投递列表，右侧跟踪流程、面试记录与岗位JD</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={openCreateModal} className={toolbarPrimaryButtonClass}><Plus className="h-4 w-4" />新增投递</button>
            <button type="button" onClick={loadList} className={toolbarSecondaryButtonClass}><RefreshCw className="h-4 w-4" />刷新</button>
            <button type="button" onClick={exportExcel} className={toolbarSecondaryButtonClass}><Download className="h-4 w-4" />导出 Excel</button>
          </div>
        </div>
      </div>

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-6 py-6 transition-all">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3">
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索公司、岗位、岗位JD" className="h-10 w-64 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
            <select value={status} onChange={(event) => setStatus(event.target.value as DisplayStatus | '')} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10">
              {DISPLAY_STATUS_OPTIONS.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
            <select value={resumeId} onChange={(event) => setResumeId(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10">
              <option value="">全部简历</option>
              {resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.title}</option>)}
            </select>
          </div>

          <div className={horizontalScrollClass}>
            <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-4 py-3">公司</th>
                  <th className="px-4 py-3">投递职位</th>
                  <th className="px-4 py-3">投递部门</th>
                  <th className="px-4 py-3 text-center">投递状态</th>
                  <th className="px-4 py-3 text-center">投递时间</th>
                  <th className="px-4 py-3 text-center">笔试时间</th>
                  <th className="px-4 py-3 text-center">投递链接</th>
                  <th className={stickyActionHeadClass}>操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">加载中...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">暂无投递记录</td></tr>
                ) : items.map((item) => (
                  <tr key={item.id} onClick={() => selectApplication(item.id)} className={`cursor-pointer border-t border-slate-100 transition hover:bg-blue-50/50 ${selectedId === item.id ? 'bg-blue-50/80' : ''}`}>
                    <td className="border-t border-slate-100 px-4 py-3 font-medium text-slate-800">{item.companyName || '无'}</td>
                    <td className="border-t border-slate-100 px-4 py-3 text-slate-700">{item.targetTitle}</td>
                    <td className="border-t border-slate-100 px-4 py-3 text-slate-700">{item.department || '无'}</td>
                    <td className="border-t border-slate-100 px-4 py-3 text-center" onClick={(event) => event.stopPropagation()}>
                      <select
                        value={displayToBackendStatus(rowDisplayStatus(item.status))}
                        onChange={(event) => changeApplicationStatus(item.id, event.target.value as JobApplicationStatus)}
                        className={`h-7 cursor-pointer rounded-full px-2 text-xs font-medium ring-1 outline-none ${STATUS_COLOR_CLASS[rowDisplayStatus(item.status)] || STATUS_COLOR_CLASS["已投递"]}`}
                      >
                        {STATUS_SELECT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </td>
                    <td className="border-t border-slate-100 px-4 py-3 text-center text-slate-500">{displayDate(item.submittedAt)}</td>
                    <td className="border-t border-slate-100 px-4 py-3 text-center text-slate-500">{displayDate(item.writtenTestAt)}</td>
                    <td className="border-t border-slate-100 px-4 py-3 text-center">
                      {item.applicationUrl ? <a href={item.applicationUrl} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="text-blue-600 hover:underline">链接</a> : <span className="text-slate-400">无</span>}
                    </td>
                    <td className={stickyActionClass}>
                      <div className="flex items-center justify-center gap-1.5">
                        <button type="button" onClick={(event) => { event.stopPropagation(); openEditModal(item.id) }} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">编辑</button>
                        <button type="button" onClick={(event) => { event.stopPropagation(); deleteApplication(item.id) }} className="rounded-lg border border-red-100 bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100">删除</button>
                      </div>
                    </td>
                  </tr>
                ))}

              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">第 {page} / {totalPages} 页</span>
              <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10">
                {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size} 条/页</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" />上一页</button>
              <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 disabled:opacity-40">下一页<ChevronRight className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </section>

        {detailOpen && (
          <aside className="fixed bottom-6 right-6 top-24 z-40 w-[min(400px,calc(100vw-3rem))] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-950/15 transition-all">
            <div className="relative flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Application Detail</p>
                  <h2 className="mt-1 text-base font-semibold">{detail?.companyName || '选择投递记录'} · {detail?.targetTitle || '查看详情'}</h2>
                </div>
                <button type="button" onClick={() => { setDetailOpen(false); setFlowEditorOpen(false); setEditingInterviewId(null) }} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="收起详情">
                  <PanelRightClose className="h-5 w-5" />
                </button>
              </div>

              {detailLoading ? (
                <div className="flex flex-1 items-center justify-center text-sm text-slate-400">加载详情中...</div>
              ) : !detail ? (
                <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-slate-400">从左侧选择一条投递记录查看详情。</div>
              ) : (
                <div className={`min-h-0 flex-1 space-y-5 px-4 py-4 ${hiddenScrollClass}`}>
                  <section>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold">投递时间线</h3>
                      <button type="button" disabled={finalStatuses.includes(detail.status)} onClick={() => { setEditingInterviewId(null); setInterviewForm(emptyInterviewForm); setFlowEditorOpen(true) }} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white shadow-lg transition ${finalStatuses.includes(detail.status) ? 'cursor-not-allowed bg-slate-300 shadow-none' : 'bg-blue-600 shadow-blue-600/20 hover:bg-blue-700'}`} title={finalStatuses.includes(detail.status) ? '投递已终态，不可新增面试' : '新增流程'}>
                        <FilePlus2 className="h-3.5 w-3.5" />新增流程
                      </button>
                    </div>
                    <div className="mt-3 space-y-3">
                      {timelineItems.length === 0 ? (
                        <p className="rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-400">暂无流程节点，可新增一面、二面、主管面或 HR 面。</p>
                      ) : timelineItems.map((node) => {
                        const editable = node?.interviewId ? isToday(node?.scheduledAt) : false
                        const canDel = node?.interviewId ? canDeleteInterview(detail?.interviews || [], node.interviewId) : false
                        return (
                        <div key={node?.key} className="grid grid-cols-[86px_1fr] gap-3 text-sm">
                          <span className="text-xs text-slate-400">{displayDate(node?.time)}</span>
                          <div className="border-l border-blue-200 pl-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-slate-800">{node?.title}</p>
                                {node?.interviewId && (node?.notes ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600 ring-1 ring-blue-100">已上传</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-400 ring-1 ring-slate-200">待上传</span>)}
                                {node?.result === '通过' && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600 ring-1 ring-emerald-100">已通过</span>}
                                {node?.result === '终止' && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600 ring-1 ring-red-100">终止</span>}
                              </div>
                              {node?.interviewId && (
                                <div className="flex shrink-0 items-center gap-1">
                                  <button type="button" onClick={() => editable ? openEditInterview({ id: node!.interviewId!, round: node!.round, scheduledAt: node!.scheduledAt, notes: node!.notes, result: node!.result }) : toast('仅面试当天可编辑面试记录')} className={`text-slate-400 hover:text-blue-600 ${!editable ? 'opacity-40' : ''}`} title={editable ? '编辑' : '仅当天可编辑'}><FilePlus2 className="h-3.5 w-3.5" /></button>
                                  <button type="button" onClick={() => canDel ? deleteInterview(node!.interviewId!) : toast('当前面试后已有面试，不支持删除')} className={`text-slate-400 hover:text-red-600 ${!canDel ? 'opacity-40' : ''}`} title={canDel ? '删除' : '后续已有面试，不可删除'}><Trash2 className="h-3.5 w-3.5" /></button>
                                </div>
                              )}
                            </div>
                            {node?.notes && <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{node?.notes}</p>}
                          </div>
                        </div>
                        )
                      })}
                    </div>
                  </section>

                  <section>
                    <h3 className="text-sm font-semibold">AI 分析摘要</h3>
                    <div className="mt-3 space-y-2">
                      {(detail.aiRuns || []).length === 0 ? (
                        <p className="rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-400">暂无 AI 分析摘要。当前后端未提供“根据面试记录生成分析”的接口。</p>
                      ) : detail.aiRuns?.map((run) => (
                        <div key={run.id} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{run.resultType === 'jd_match' ? '快速匹配' : run.resultType === 'jd_score' ? '深度评分' : run.resultType}</span>
                            <span className="text-xs text-slate-400">{displayDate(run.createdAt)}</span>
                          </div>
                          <p className="mt-2 line-clamp-4 text-xs leading-5 text-slate-600">{summarizeAiRun(run.summary)}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className="text-sm font-semibold">岗位JD</h3>
                    <div className={`mt-3 h-40 whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-sm leading-6 text-slate-600 ${hiddenScrollClass}`}>{detail.jdText || '暂无岗位JD'}</div>
                  </section>

                </div>
              )}
              {detail && flowEditorOpen && (
                <div className="absolute inset-0 z-10 flex items-end bg-slate-950/20 p-3 backdrop-blur-sm">
                  <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20">
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Interview Flow</p>
                        <h3 className="mt-1 text-sm font-semibold text-slate-900">面试记录</h3>
                      </div>
                      <button type="button" onClick={() => { setFlowEditorOpen(false); setEditingInterviewId(null) }} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
                    </div>
                    <div className={`max-h-[calc(100vh-220px)] px-4 py-4 ${hiddenScrollClass}`}>
                      <div className="grid grid-cols-2 gap-3">
                        <label className={fieldLabelClass}>投递状态
                          <select value={interviewForm.round} onChange={(event) => setInterviewForm({ ...interviewForm, round: event.target.value })} className={fieldInputClass}>
                            <option value="">请选择流程</option>
                            {getAvailableRounds(detail?.interviews?.map((i) => i.round) || [], editingInterviewId ? interviewForm.round : undefined).map((round) => <option key={round} value={round}>{round}</option>)}
                          </select>
                        </label>
                        <label className={fieldLabelClass}>日期
                          <div className="mt-1 [&_button]:!h-10 [&_button]:!rounded-xl [&_button]:!border-slate-200 [&_button]:!text-slate-800 [&_button]:focus:!border-blue-500 [&_button]:focus:!ring-4 [&_button]:focus:!ring-blue-500/10">
                            <YearMonthPicker value={toDatePickerValue(interviewForm.scheduledAt)} onChange={(value) => setInterviewForm({ ...interviewForm, scheduledAt: fromDatePickerValue(value) })} placeholder="选择日期" enableDay defaultStep="month" futureYears={3} />
                          </div>
                        </label>
                        <label className={`${fieldLabelClass} col-span-2`}>面试记录
                          <textarea value={interviewForm.notes} onChange={(event) => setInterviewForm({ ...interviewForm, notes: event.target.value })} placeholder="记录问题、回答、反馈或复盘点" className="mt-1 h-28 w-full resize-none overflow-y-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none [scrollbar-width:none] focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 [&::-webkit-scrollbar]:hidden" />
                        </label>
                        <label className={fieldLabelClass}>结果
                          <select value={interviewForm.result || ''} onChange={(event) => setInterviewForm({ ...interviewForm, result: event.target.value })} disabled={editingInterviewId ? !isToday(interviewForm.scheduledAt) : false} className={fieldInputClass}>
                            <option value="">请选择结果</option>
                            {interviewResultOptions.map((result) => <option key={result} value={result}>{result}</option>)}
                          </select>
                        </label>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
                      <button type="button" onClick={() => setFlowEditorOpen(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100">取消</button>
                      <button type="button" onClick={saveInterview} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700">
                        <FilePlus2 className="h-4 w-4" />保存
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </main>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="grid h-[min(92vh,760px)] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl shadow-slate-950/20 md:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="relative overflow-hidden bg-slate-950 px-6 py-6 text-white">
              <div className="absolute -right-20 -top-20 h-44 w-44 rounded-full bg-blue-500/30 blur-2xl" />
              <div className="absolute -bottom-24 left-10 h-48 w-48 rounded-full bg-cyan-400/20 blur-3xl" />
              <div className="relative">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                  <BriefcaseBusiness className="h-5 w-5" />
                </div>
                <h2 className="mt-5 text-2xl font-semibold tracking-tight">{editingId ? "编辑投递" : "新增投递"}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-300">录入职位后进入左侧列表，点击后在右侧跟踪流程。</p>
                <div className="mt-8 space-y-4 text-sm">
                  <div className="flex items-start gap-3"><FileText className="mt-0.5 h-4 w-4 text-blue-300" /><span className="text-slate-300">职位信息与 JD 集中归档</span></div>
                  <div className="flex items-start gap-3"><Layers3 className="mt-0.5 h-4 w-4 text-blue-300" /><span className="text-slate-300">绑定简历快照，便于后续复盘</span></div>
                  <div className="flex items-start gap-3"><CalendarClock className="mt-0.5 h-4 w-4 text-blue-300" /><span className="text-slate-300">投递时间会进入时间线</span></div>
                </div>
              </div>
            </aside>
            <div className="flex min-h-0 flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Job Pipeline</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">编辑投递记录</h3>
                </div>
                <button type="button" onClick={() => setCreateOpen(false)} className="rounded-2xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
              </div>
              <div className={`min-h-0 flex-1 px-6 py-5 ${hiddenScrollClass}`}>
                <div className="space-y-6">
                  <section>
                    <div className="mb-3 flex items-center gap-2"><BriefcaseBusiness className="h-4 w-4 text-blue-600" /><h4 className="text-sm font-semibold text-slate-900">职位基础信息</h4></div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className={fieldLabelClass}>公司<input value={createForm.companyName} onChange={(event) => setCreateForm({ ...createForm, companyName: event.target.value })} className={fieldInputClass} placeholder="例如：OpenAI" /></label>
                      <label className={fieldLabelClass}>投递部门<input value={createForm.department} onChange={(event) => setCreateForm({ ...createForm, department: event.target.value })} className={fieldInputClass} placeholder="例如：基础架构部" /></label>
                      <label className={fieldLabelClass}>岗位<input value={createForm.targetTitle} onChange={(event) => setCreateForm({ ...createForm, targetTitle: event.target.value })} className={fieldInputClass} placeholder="例如：Frontend Engineer" /></label>
                      <label className={fieldLabelClass}>来源<input value={createForm.source} onChange={(event) => setCreateForm({ ...createForm, source: event.target.value })} className={fieldInputClass} /></label>
                      <label className={fieldLabelClass}>投递时间
                        <div className="mt-1 [&_button]:!h-10 [&_button]:!rounded-xl [&_button]:!border-slate-200 [&_button]:!text-slate-800 [&_button]:focus:!border-blue-500 [&_button]:focus:!ring-4 [&_button]:focus:!ring-blue-500/10">
                          <YearMonthPicker value={createForm.submittedAt} onChange={(value) => setCreateForm({ ...createForm, submittedAt: value })} placeholder="选择投递日期" enableDay defaultStep="day" futureYears={3} />
                        </div>
                      </label>
                      <label className={fieldLabelClass}>笔试时间
                        <div className="mt-1 [&_button]:!h-10 [&_button]:!rounded-xl [&_button]:!border-slate-200 [&_button]:!text-slate-800 [&_button]:focus:!border-blue-500 [&_button]:focus:!ring-4 [&_button]:focus:!ring-blue-500/10">
                          <YearMonthPicker value={createForm.writtenTestAt} onChange={(value) => setCreateForm({ ...createForm, writtenTestAt: value })} placeholder="选择笔试日期" enableDay defaultStep="day" futureYears={3} />
                        </div>
                      </label>
                    </div>
                  </section>
                  <section>
                    <div className="mb-3 flex items-center gap-2"><Layers3 className="h-4 w-4 text-blue-600" /><h4 className="text-sm font-semibold text-slate-900">关联简历快照</h4></div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className={fieldLabelClass}>关联简历
                        <select value={createForm.resumeId} onChange={(event) => setCreateForm({ ...createForm, resumeId: event.target.value, snapshotVersionId: '' })} className={fieldInputClass}>
                          <option value="">请选择简历</option>
                          {resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.title}</option>)}
                        </select>
                      </label>
                      <label className={fieldLabelClass}>关联快照
                        <select value={createForm.snapshotVersionId} onChange={(event) => setCreateForm({ ...createForm, snapshotVersionId: event.target.value })} className={fieldInputClass}>
                          <option value="">请选择快照</option>
                          {createSnapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{snapshot.label || snapshot.snapshotType || snapshot.id.slice(0, 8)}</option>)}
                        </select>
                      </label>
                    </div>
                  </section>
                  <section>
                    <div className="mb-3 flex items-center gap-2"><Link2 className="h-4 w-4 text-blue-600" /><h4 className="text-sm font-semibold text-slate-900">跟进信息</h4></div>
                    <div className="grid gap-3">
                      <label className={fieldLabelClass}>投递链接<input value={createForm.applicationUrl} onChange={(event) => setCreateForm({ ...createForm, applicationUrl: event.target.value })} className={fieldInputClass} placeholder="https://..." /></label>
                      <label className={fieldLabelClass}>岗位JD<textarea value={createForm.jdText} onChange={(event) => setCreateForm({ ...createForm, jdText: event.target.value })} className={fieldTextareaClass} placeholder="粘贴岗位 JD，后续可用于匹配和复盘" /></label>
                    </div>
                  </section>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
                <p className="text-xs text-slate-500">保存后会自动进入列表并展开右侧详情。</p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setCreateOpen(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 transition hover:bg-slate-100">取消</button>
                  <button type="button" onClick={saveApplication} disabled={creating} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-50">{creating ? '保存中...' : (editingId ? '保存修改' : '保存投递')}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ApplicationsPage
