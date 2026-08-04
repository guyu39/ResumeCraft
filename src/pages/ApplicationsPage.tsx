import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  AlertTriangle,
  BriefcaseBusiness,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileCheck2,
  FilePlus2,
  FileText,
  Layers3,
  Link2,
  Loader2,
  Maximize2,
  PanelRightClose,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
  BarChart3,
  List as ListIcon,
} from 'lucide-react'
import { applicationsApi, resumeApi } from '@/api'
import FunnelAnalytics from '@/components/applications/FunnelAnalytics'
import type {
  CreateInterviewRequest,
  JobApplication,
  JobApplicationAttachment,
  JobApplicationListItem,
  JobApplicationStatus,
  ListApplicationsParams,
} from '@/api/applications'
import type { ResumeListItem } from '@/api/types'
import type { SnapshotListItem } from '@/api/resume'
import ToastContainer, { toast } from '@/components/common/Toast'
import YearMonthPicker from '@/components/common/YearMonthPicker'
import StyledSelect from '@/components/common/StyledSelect'
import CityCascadeSelect from '@/components/common/CityCascadeSelect'
import TimeRangePicker from '@/components/common/TimeRangePicker'
import useDeleteConfirm from '@/hooks/useDeleteConfirm'

type DisplayStatus = 'submitted' | 'written_test' | 'interview' | 'offer' | 'terminated'

interface CreateFormState {
  resumeId: string
  snapshotVersionId: string
  companyName: string
  department: string
  targetTitle: string
  jdText: string
  preferredCity: string
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
  preferredCity: '',
  applicationUrl: '',
  submittedAt: '',
  writtenTestAt: '',
}

const emptyInterviewForm: CreateInterviewRequest = {
  round: '',
  scheduledAt: undefined,
  scheduledEnd: undefined,
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

/** 从后端错误中截取中文部分（去掉 "xxx:中文" 前缀） */
function cleanError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : ''
  if (!raw) return fallback
  const idx = raw.search(/[\u4e00-\u9fff]/)
  return idx >= 0 ? raw.slice(idx) : raw
}

// 列表页状态内联下拉可选项：后端 status -> 中文展示 + 反查映射
const STATUS_SELECT_OPTIONS: Array<{ value: JobApplicationStatus; label: string }> = [
  { value: 'submitted', label: '已投递' },
  { value: 'written_test', label: '笔试' },
  { value: 'interview', label: '面试中' },
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

/** 格式化时间段，同一天: "2026/07/05 15:00 - 16:00"，跨天: "2026/07/05 23:00 - 2026/07/06 01:00" */
function displayDatetimeRange(start?: number, end?: number): string {
  if (!start && !end) return '无'
  const d1 = start ? new Date(start) : null
  const d2 = end ? new Date(end) : null
  const sameDay = d1 && d2 && d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate()
  const fmt = (d: Date | null, withDate: boolean) => {
    if (!d) return ''
    const date = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return withDate ? `${date} ${time}` : time
  }
  const s = fmt(d1, true)
  const e = fmt(d2, !sameDay)
  if (s && e) return `${s} - ${e}`
  return s
}

/** 卡片用：
 * - 开始时间或结束时间任一为空 → 仅显示年月日（如 2026/07/23）
 * - 开始与结束时间都存在 → 显示年月日 时间段（如 2026/07/23 04:00 - 01:00）
 */
function displayInterviewShort(start?: number, end?: number): string {
  if (!start) return '待排期'
  const fmtDate = (ts: number) => {
    const d = new Date(ts)
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  }
  const fmtTime = (ts: number) => {
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  if (!end) return fmtDate(start)
  const d1 = new Date(start)
  const d2 = new Date(end)
  const sameDay = d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate()
  return sameDay
    ? `${fmtDate(start)} ${fmtTime(start)} - ${fmtTime(end)}`
    : `${fmtDate(start)} ${fmtTime(start)} - ${fmtDate(end)} ${fmtTime(end)}`
}

/**
 * 自定义滚动区：隐藏浏览器原生滚动条，改用右侧可拖拽的细滚动条 thumb。
 * 仅当内容超过可视高度时才显示 thumb；支持滚轮（原生 overflow）与拖拽。
 */
function CustomScrollArea({ children, className = '', maxHeight }: { children: React.ReactNode; className?: string; maxHeight?: number }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ top: number; height: number; visible: boolean }>({ top: 0, height: 0, visible: false })
  const dragState = useRef<{ startY: number; startScrollTop: number } | null>(null)

  const updateThumb = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    const { scrollHeight, clientHeight, scrollTop } = el
    if (scrollHeight <= clientHeight + 1) {
      setThumb((t) => (t.visible ? { ...t, visible: false } : t))
      return
    }
    const height = Math.max(28, Math.floor((clientHeight / scrollHeight) * clientHeight))
    const maxScroll = scrollHeight - clientHeight
    const top = maxScroll > 0 ? (scrollTop / maxScroll) * (clientHeight - height) : 0
    setThumb({ top, height, visible: true })
  }, [])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    updateThumb()
    el.addEventListener('scroll', updateThumb, { passive: true })
    window.addEventListener('resize', updateThumb)
    return () => {
      el.removeEventListener('scroll', updateThumb)
      window.removeEventListener('resize', updateThumb)
    }
  }, [updateThumb])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const ds = dragState.current
      const el = viewportRef.current
      if (!ds || !el) return
      const { clientHeight, scrollHeight } = el
      const track = clientHeight - thumb.height
      const dy = e.clientY - ds.startY
      const ratio = track > 0 ? dy / track : 0
      el.scrollTop = ds.startScrollTop + ratio * (scrollHeight - clientHeight)
    }
    const onUp = () => {
      if (!dragState.current) return
      dragState.current = null
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [thumb.height])

  const onThumbDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const el = viewportRef.current
    if (!el) return
    dragState.current = { startY: e.clientY, startScrollTop: el.scrollTop }
    document.body.style.userSelect = 'none'
  }

  return (
    <div className={`relative ${className}`}>
      <div
        ref={viewportRef}
        className="h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={maxHeight != null ? { maxHeight } : undefined}
      >
        {children}
      </div>
      {thumb.visible && (
        <div className="pointer-events-none absolute inset-y-0 right-0.5 w-1.5">
          <div
            onMouseDown={onThumbDown}
            onClick={(e) => e.stopPropagation()}
            className="pointer-events-auto cursor-grab rounded-full bg-slate-300 transition-colors hover:bg-slate-400 active:cursor-grabbing"
            style={{ height: thumb.height, transform: `translateY(${thumb.top}px)` }}
          />
        </div>
      )}
    </div>
  )
}

/** 从时间戳拆出 { hour, minute } */
function extractHourMinute(value?: number): { hour: string; minute: string } {
  if (!value) return { hour: '09', minute: '00' }
  const d = new Date(value)
  return { hour: String(d.getHours()).padStart(2, '0'), minute: String(d.getMinutes()).padStart(2, '0') }
}

/** 用日期时间戳 + 时/分重建完整时间戳 */
function buildTimestamp(dateTimestamp: number | undefined, hour: string, minute: string): number {
  const d = new Date(dateTimestamp || Date.now())
  if (!dateTimestamp) d.setHours(0, 0, 0, 0) // 未选日期时用当天 0 点
  d.setHours(parseInt(hour, 10) || 0, parseInt(minute, 10) || 0, 0, 0)
  return d.getTime()
}

/** 时间戳 + 1 小时 */
function addOneHour(value: number | undefined): number | undefined {
  if (!value) return undefined
  const d = new Date(value)
  d.setHours(d.getHours() + 1)
  return d.getTime()
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
  // 视图：投递列表 / 数据分析
  const [view, setView] = useState<'list' | 'analytics'>(() => (new URLSearchParams(window.location.search).get('view') === 'analytics' ? 'analytics' : 'list'))
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
  // 结束时间早于开始时间时，禁用保存并给出显眼提示
  const interviewEndBeforeStart = !!(
    interviewForm.scheduledEnd && interviewForm.scheduledAt && interviewForm.scheduledEnd < interviewForm.scheduledAt
  )
  const [flowEditorOpen, setFlowEditorOpen] = useState(false)
  // AI 分析：分析进行中与结论文本
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<string | null>(null)
  const { requestDelete, deleteConfirmDialog } = useDeleteConfirm()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingInterviewId, setEditingInterviewId] = useState<string | null>(null)

  // 切换投递记录时，清空上一次的 AI 分析结论
  useEffect(() => {
    setAnalysisResult(null)
    setAnalyzing(false)
  }, [detail?.id])

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
      toast(cleanError(err, '加载投递记录失败'))
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
      toast(cleanError(err, '加载投递详情失败'))
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
      })
      .catch(() => setCreateSnapshots([]))
  }, [createForm.resumeId, createOpen])

  const timelineItems = useMemo(() => {
    if (!detail) return []
    return [
      detail.submittedAt ? {
        key: 'submitted',
        time: detail.submittedAt,
        timeEnd: undefined as number | undefined,
        title: '投递',
        description: `${detail.companyName || '未填写公司'} · ${detail.targetTitle}`,
        interviewId: undefined as string | undefined,
        round: '',
        result: '',
        notes: '',
        recordingAttachment: undefined as JobApplicationAttachment | undefined,
        scheduledAt: undefined as number | undefined,
        scheduledEnd: undefined as number | undefined,
      } : null,
      ...(detail.interviews || []).map((item) => ({
        key: `interview-${item.id}`,
        time: item.scheduledAt || item.createdAt,
        timeEnd: item.scheduledEnd,
        title: item.round || '面试流程',
        description: '',
        interviewId: item.id,
        round: item.round,
        result: item.result || '',
        notes: item.notes || '',
        recordingAttachment: item.recordingAttachment,
        scheduledAt: item.scheduledAt,
        scheduledEnd: item.scheduledEnd,
      })),
      ...(detail.statusEvents || [])
        .filter((event) => event.toStatus === 'offer' || event.toStatus === 'withdrawn' || event.toStatus === 'rejected')
        .slice(0, 1)
        .map((event) => ({
          key: `status-${event.id}`,
          time: event.createdAt,
          timeEnd: undefined as number | undefined,
          title: STATUS_LABELS[event.toStatus],
          description: event.note || `状态更新为${STATUS_LABELS[event.toStatus]}`,
          interviewId: undefined as string | undefined,
          round: '',
          result: '',
          notes: '',
          recordingAttachment: undefined as JobApplicationAttachment | undefined,
          scheduledAt: undefined as number | undefined,
          scheduledEnd: undefined as number | undefined,
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
        snapshotVersionId: app.snapshotVersionId || '',
        companyName: app.companyName || '',
        department: app.department || '',
        targetTitle: app.targetTitle || '',
        jdText: app.jdText || '',
        preferredCity: app.preferredCity || app.source || '',
        applicationUrl: app.applicationUrl || '',
        submittedAt: app.submittedAt ? toDatePickerValue(app.submittedAt) : '',
        writtenTestAt: app.writtenTestAt ? toDatePickerValue(app.writtenTestAt) : '',
      })
      setCreateOpen(true)
    } catch (err) {
      toast(cleanError(err, '加载详情失败'))
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
    if (!createForm.resumeId) {
      toast('请选择关联简历')
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
          preferredCity: createForm.preferredCity || undefined,
          applicationUrl: createForm.applicationUrl.trim(),
          submittedAt: submittedAt ?? 0,
          writtenTestAt: writtenTestAt ?? 0,
        })
        if (detail?.id === editingId) await loadDetail(editingId)
        await loadList()
        // 编辑时填写了笔试日期则自动更新状态
        if (writtenTestAt && detail?.status === 'submitted') {
          await applicationsApi.updateStatus(editingId, 'written_test')
        }
        toast('投递记录已更新', 'success')
      } else {
        const created = await applicationsApi.create({
          resumeId: createForm.resumeId,
          snapshotVersionId: createForm.snapshotVersionId || undefined,
          companyName: createForm.companyName.trim(),
          department: createForm.department.trim(),
          targetTitle: createForm.targetTitle.trim(),
          jdText: createForm.jdText.trim(),
          preferredCity: createForm.preferredCity || undefined,
          applicationUrl: createForm.applicationUrl.trim(),
        })
        if (submittedAt) await applicationsApi.update(created.id, { submittedAt })
        if (writtenTestAt) {
          await applicationsApi.update(created.id, { writtenTestAt })
          await applicationsApi.updateStatus(created.id, 'written_test')
        }
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
      toast(cleanError(err, '保存失败'))
    } finally {
      setCreating(false)
    }
  }

  const changeApplicationStatus = async (id: string, status: JobApplicationStatus) => {
    const target = items.find((item) => item.id === id)
    if (target && finalStatuses.includes(target.status) && !finalStatuses.includes(status)) {
      requestDelete({
        title: '切换流程',
        message: '该投递当前为已 offer 或终止状态，切换到其他流程将清空原有的面试记录，是否继续？',
        onConfirm: async () => {
          try {
            await applicationsApi.updateStatus(id, status)
            await loadList()
            if (detail?.id === id) await loadDetail(id)
            toast(`${target?.companyName || '投递记录'}状态已更新为${rowDisplayStatus(status)}`)
          } catch (err) {
            toast(cleanError(err, '更新状态失败'))
          }
        },
      })
      return
    }
    try {
      await applicationsApi.updateStatus(id, status)
      await loadList()
      if (detail?.id === id) await loadDetail(id)
      toast(`${target?.companyName || '投递记录'}状态已更新为${rowDisplayStatus(status)}`)
    } catch (err) {
      toast(cleanError(err, '更新状态失败'))
    }
  }

  const deleteApplication = (id: string) => {
    const target = items.find((item) => item.id === id)
    requestDelete({
      title: '删除投递',
      message: `确定删除「${target?.companyName || '未填写公司'} · ${target?.targetTitle || '未填写岗位'}」吗？`,
      onConfirm: async () => {
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
          toast(cleanError(err, '删除投递记录失败'))
        }
      },
    })
  }

  const openEditInterview = (item: { id: string; round: string; scheduledAt?: number; scheduledEnd?: number; notes?: string; result?: string }) => {
    setEditingInterviewId(item.id)
    setInterviewForm({ ...emptyInterviewForm, round: item.round, scheduledAt: item.scheduledAt, scheduledEnd: item.scheduledEnd, notes: item.notes || '', result: item.result || '' })
    setFlowEditorOpen(true)
  }

  const goToRecordingAnalysis = () => {
    if (!detail) return
    if (!editingInterviewId) return
    const params = new URLSearchParams({
      tab: 'interview',
      mode: 'transcript',
      applicationId: detail.id,
      resumeId: detail.resumeId,
      interviewId: editingInterviewId,
      interviewRound: interviewForm.round || '',
      companyName: detail.companyName || '',
      targetTitle: detail.targetTitle || '',
      jdText: detail.jdText || '',
    })
    if (detail.snapshotVersionId) params.set('snapshotId', detail.snapshotVersionId)
    // 将当前面试记录文本作为 fallback 暂存，便于 edit 页预填
    sessionStorage.setItem('interview_analysis_transcript', interviewForm.notes || '')
    sessionStorage.setItem('interview_analysis_source', '面试记录')
    window.open(`/editor?${params.toString()}`, '_blank')
  }

  const currentInterview = useMemo(() => detail?.interviews?.find((i) => i.id === editingInterviewId), [detail, editingInterviewId])
  const [uploadingRecording, setUploadingRecording] = useState(false)

  const uploadInterviewRecording = async (file: File) => {
    if (!detail || !editingInterviewId) return
    const name = file.name.toLowerCase()
    if (!name.endsWith('.txt') && !name.endsWith('.docx')) {
      toast('仅支持 .txt 或 .docx 格式')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast('文件大小不能超过 2MB')
      return
    }
    setUploadingRecording(true)
    try {
      await applicationsApi.uploadInterviewRecording(detail.id, editingInterviewId, file)
      await loadDetail(detail.id)
      toast('录音文件上传成功', 'success')
    } catch (err) {
      toast(cleanError(err, '上传录音文件失败'))
    } finally {
      setUploadingRecording(false)
    }
  }

  // 根据面试状态（通过 / 终止）进行整体表现分析；仅当所有面试均已终结（通过或终止）时允许触发。
  // 当前为占位实现：依据终结状态生成结论文本，后续可替换为真实 AI 分析接口。
  const runAnalysis = () => {
    if (!detail) return
    const interviews = detail.interviews || []
    if (interviews.length === 0) {
      toast('暂无面试记录，无法分析')
      return
    }
    if (!interviews.every((i) => i.result === '通过' || i.result === '终止')) {
      toast('面试尚未结束，待全部面试通过或终止后方可分析')
      return
    }
    setAnalyzing(true)
    setAnalysisResult(null)
    // 模拟分析时延（后续替换为真实 AI 接口调用）
    setTimeout(() => {
      const allPassed = interviews.every((i) => i.result === '通过')
      const rounds = interviews.map((i) => i.round).join('、')
      const conclusion = allPassed ? '通过' : '终止'
      const body = allPassed
        ? `整体表现优异，各轮面试均通过。\n建议：在入职准备阶段重点关注岗位核心职责的落地节奏，并保持技术深度与沟通表达的优势。`
        : `面试流程已终止，建议复盘各轮表现，总结待提升点并针对性补强。\n建议：结合具体反馈优化项目深度与问答策略，为下一次机会做准备。`
      setAnalysisResult(
        `【面试结论：${conclusion}】\n本次应聘「${detail.companyName} · ${detail.targetTitle}」共经历 ${rounds} 等 ${interviews.length} 轮面试。\n${body}\n\n（以上为按面试状态生成的初步结论，多维度评估详情将由 AI 分析补充。）`,
      )
      setAnalyzing(false)
    }, 700)
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
    // 新增面试时，检测是否存在「权重低于当前新增轮次」且尚未置为「通过 / 终止」的前置面试；
    // 若有，二次提示「将把 xx 面更新成通过状态」，确认后将这些前置面试置为通过再创建新面试。
    // 仅检查比当前轮次更早的面试：例如新增「二面」只检查「一面」，新增「一面」则不检查任何轮次。
    if (!editingInterviewId) {
      const newWeight = ROUND_ORDER[interviewForm.round] || 0
      const pending = (detail.interviews || []).filter(
        (i) => i.result !== '通过' && i.result !== '终止' && (ROUND_ORDER[i.round] || 0) < newWeight,
      )
      if (pending.length > 0) {
        const rounds = pending.map((i) => i.round).join('、')
        requestDelete({
          title: '更新前置面试状态',
          message: `检测到「${rounds}」的面试结果尚未置为通过或终止。新增面试将把${rounds}更新成通过状态，是否继续？`,
          confirmLabel: '确认更新',
          confirmVariant: 'primary',
          onConfirm: async () => {
            try {
              for (const it of pending) {
                await applicationsApi.updateInterview(detail.id, it.id, {
                  round: it.round,
                  scheduledAt: it.scheduledAt,
                  scheduledEnd: it.scheduledEnd,
                  format: it.format,
                  interviewer: it.interviewer,
                  questions: it.questions,
                  notes: it.notes,
                  result: '通过',
                })
              }
              await applicationsApi.createInterview(detail.id, interviewForm)
              setInterviewForm(emptyInterviewForm)
              setEditingInterviewId(null)
              setFlowEditorOpen(false)
              await loadDetail(detail.id)
              await loadList()
            } catch (err) {
              toast(cleanError(err, '保存面试记录失败'))
            }
          },
        })
        return
      }
    }
    try {
      if (editingInterviewId) {
        await applicationsApi.updateInterview(detail.id, editingInterviewId, interviewForm)
      } else {
        await applicationsApi.createInterview(detail.id, interviewForm)
      }
      setInterviewForm(emptyInterviewForm)
      setEditingInterviewId(null)
      setFlowEditorOpen(false)
      await loadDetail(detail.id)
      await loadList()
    } catch (err) {
      toast(cleanError(err, '保存面试记录失败'))
    }
  }

  const deleteInterview = (interviewId: string) => {
    if (!detail) return
    const interview = detail.interviews?.find((i) => i.id === interviewId)
    const label = interview?.round || '该面试记录'
    requestDelete({
      title: '删除面试记录',
      message: `确定删除「${label}」吗？`,
      onConfirm: async () => {
        try {
          await applicationsApi.deleteInterview(detail.id, interviewId)
          await loadDetail(detail.id)
          await loadList()
        } catch (err) {
          toast(cleanError(err, '删除面试记录失败'))
        }
      },
    })
  }

  const updateInterviewResult = async (interviewId: string, result: string) => {
    if (!detail) return
    if (finalStatuses.includes(detail.status)) {
      toast('投递已终止或已 offer，不可修改面试结果')
      return
    }
    const interview = detail.interviews?.find((i) => i.id === interviewId)
    if (!interview) return
    // 权重校验：若存在更高权重的面试，则不允许修改当前面试结果
    const currentWeight = ROUND_ORDER[interview.round] || 0
    if (currentWeight > 0) {
      const hasHigher = (detail.interviews || []).some((i) => i.id !== interviewId && (ROUND_ORDER[i.round] || 0) > currentWeight)
      if (hasHigher) {
        toast('存在后续面试流程，不允许修改当前面试结果')
        return
      }
    }
    try {
      await applicationsApi.updateInterview(detail.id, interviewId, {
        round: interview.round,
        scheduledAt: interview.scheduledAt,
        scheduledEnd: interview.scheduledEnd,
        format: interview.format,
        interviewer: interview.interviewer,
        questions: interview.questions,
        notes: interview.notes,
        result,
      })
      await loadDetail(detail.id)
      await loadList()
    } catch (err) {
      toast(cleanError(err, '更新面试结果失败'))
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
      toast(cleanError(err, '导出失败'))
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_48%,#f8fafc_100%)] text-slate-900">
      <ToastContainer />
      {deleteConfirmDialog}
      <div className="shrink-0 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4 px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => { window.location.href = '/resumes' }} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700" title="返回简历列表">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h1 className="shrink-0 text-xl font-semibold tracking-tight">投递管理</h1>
            <div className="ml-1 inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-line bg-slate-100 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setView('list')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors ${view === 'list' ? 'bg-blue-600 text-white shadow-sm' : 'text-blue-700/70 hover:text-blue-700'}`}
              >
                <ListIcon className="h-3.5 w-3.5" /> 投递列表
              </button>
              <button
                type="button"
                onClick={() => setView('analytics')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors ${view === 'analytics' ? 'bg-blue-600 text-white shadow-sm' : 'text-blue-700/70 hover:text-blue-700'}`}
              >
                <BarChart3 className="h-3.5 w-3.5" /> 数据分析
              </button>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={openCreateModal} className={toolbarPrimaryButtonClass}><Plus className="h-4 w-4" />新增投递</button>
            <button type="button" onClick={loadList} className={toolbarSecondaryButtonClass}><RefreshCw className="h-4 w-4" />刷新</button>
            <button type="button" onClick={exportExcel} className={toolbarSecondaryButtonClass}><Download className="h-4 w-4" />导出 Excel</button>
          </div>
        </div>
      </div>

      {view === 'analytics' ? (
        <main className="min-h-0 w-full flex-1 overflow-hidden">
          <section className="h-full overflow-hidden bg-transparent">
            <FunnelAnalytics />
          </section>
        </main>
      ) : (
      <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-0 py-0 transition-all sm:flex-row">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center gap-3 bg-slate-50/70 px-4 py-3">
            <input value={keyword} onChange={(event) => { setKeyword(event.target.value); setDetailOpen(false) }} placeholder="搜索公司、岗位、岗位JD" className="h-10 w-64 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
            <div className="w-36"><StyledSelect value={status} onChange={(v) => { setStatus(v as DisplayStatus | ''); setDetailOpen(false) }} options={DISPLAY_STATUS_OPTIONS.map((option) => ({ label: option.label, value: option.value }))} /></div>
            <div className="w-44"><StyledSelect value={resumeId} onChange={(v) => { setResumeId(v); setDetailOpen(false) }} placeholder="全部简历" options={[{ label: '全部简历', value: '' }, ...resumes.map((resume) => ({ label: resume.title, value: resume.id }))]} /></div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto thin-scrollbar px-0 py-0">
            {loading ? (
              <div className="py-16 text-center text-sm text-slate-400">加载中...</div>
            ) : items.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-400">暂无投递记录</div>
            ) : (
              <div className={`grid grid-cols-1 gap-4 ${detailOpen ? 'sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'}`}>
                {items.map((item) => (
                  <article
                    key={item.id}
                    className="group flex flex-col rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60 hover:ring-slate-200"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-slate-800" title={item.companyName || undefined}>{item.companyName || <span className="text-slate-400">无</span>}</h3>
                        <p className="mt-0.5 truncate text-xs text-slate-500" title={item.targetTitle}>{item.targetTitle}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => selectApplication(item.id)} title="查看详情" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600">
                          <Maximize2 className="h-4 w-4" />
                        </button>
                        <StyledSelect
                          size="compact"
                          value={displayToBackendStatus(rowDisplayStatus(item.status))}
                          onChange={(v) => changeApplicationStatus(item.id, v as JobApplicationStatus)}
                          options={STATUS_SELECT_OPTIONS.map((opt) => ({ label: opt.label, value: opt.value }))}
                          buttonClassName={`rounded-full font-medium ring-1 ${STATUS_COLOR_CLASS[rowDisplayStatus(item.status)] || STATUS_COLOR_CLASS["已投递"]}`}
                        />
                      </div>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <div className="min-w-0">
                        <dt className="text-slate-400">部门</dt>
                        <dd className="mt-0.5 truncate text-slate-700">{item.department || '无'}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-slate-400">城市</dt>
                        <dd className="mt-0.5 truncate text-slate-700">{item.preferredCity || '无'}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-slate-400">投递时间</dt>
                        <dd className="mt-0.5 text-slate-700">{item.submittedAt ? displayDate(item.submittedAt) : '无'}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-slate-400">笔试时间</dt>
                        <dd className="mt-0.5 text-slate-700">{item.writtenTestAt ? displayDate(item.writtenTestAt) : '无'}</dd>
                      </div>
                    </dl>

                    {item.interviews && item.interviews.length > 0 ? (
                      <div className="mt-3">
                        <p className="mb-1 text-[11px] text-slate-400">面试安排</p>
                        <CustomScrollArea maxHeight={item.interviews.length > 3 ? 124 : undefined} className="pr-1">
                          <ul className="space-y-1">
                            {[...item.interviews]
                              .sort((a, b) => (ROUND_ORDER[a.round] || 0) - (ROUND_ORDER[b.round] || 0))
                              .map((iv) => (
                                <li key={iv.round} className="flex items-center justify-between gap-2 text-[11px]">
                                  <span className={`shrink-0 rounded px-1.5 py-0.5 font-medium ring-1 ${iv.result === '通过' ? 'bg-emerald-50 text-emerald-600 ring-emerald-100' : iv.result === '终止' ? 'bg-red-50 text-red-600 ring-red-100' : 'bg-blue-50 text-blue-600 ring-blue-100'}`}>{iv.round}</span>
                                  <span
                                    className={`truncate ${iv.scheduledAt && isToday(iv.scheduledAt) ? 'font-semibold text-blue-600' : 'text-slate-500'}`}
                                    title={iv.scheduledAt ? displayInterviewShort(iv.scheduledAt, iv.scheduledEnd) : '待排期'}
                                  >
                                    {iv.scheduledAt ? displayInterviewShort(iv.scheduledAt, iv.scheduledEnd) : '待排期'}
                                  </span>
                                </li>
                              ))}
                          </ul>
                        </CustomScrollArea>
                      </div>
                    ) : interviewRoundOptions.length > 0 ? (
                      <div className="mt-3">
                        <p className="mb-1 text-[11px] text-slate-400">面试安排</p>
                        <p className="text-[11px] text-slate-300">未安排面试</p>
                      </div>
                    ) : null}

                    <div className="mt-auto flex items-center justify-end gap-1 border-t border-slate-100 pt-2">
                      {item.applicationUrl ? (
                        <a href={item.applicationUrl} target="_blank" rel="noopener noreferrer" title="投递链接" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : null}
                      <button type="button" onClick={() => openEditModal(item.id)} title="编辑" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => deleteApplication(item.id)} title="删除" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">第 {page} / {totalPages} 页</span>
              <div className="w-24"><StyledSelect size="compact" direction="top" value={String(pageSize)} onChange={(v) => setPageSize(Number(v))} options={PAGE_SIZE_OPTIONS.map((size) => ({ label: `${size} 条/页`, value: String(size) }))} /></div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" />上一页</button>
              <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 disabled:opacity-40">下一页<ChevronRight className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </section>

        {detailOpen && (
          <aside className="flex h-[55vh] w-full shrink-0 flex-col overflow-hidden border-t border-slate-200 bg-white transition-all sm:h-full sm:w-[min(440px,42vw)] sm:border-l sm:border-t-0">
            <div className="relative flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div>
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
                      <h3 className="text-sm font-semibold">面试时间线</h3>
                      <button type="button" disabled={finalStatuses.includes(detail.status) || (detail?.interviews || []).some((i) => i.result === '终止')} onClick={() => { setEditingInterviewId(null); setInterviewForm(emptyInterviewForm); setFlowEditorOpen(true) }} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white shadow-lg transition ${(finalStatuses.includes(detail.status) || (detail?.interviews || []).some((i) => i.result === '终止')) ? 'cursor-not-allowed bg-slate-300 shadow-none' : 'bg-blue-600 shadow-blue-600/20 hover:bg-blue-700'}`} title={(detail?.interviews || []).some((i) => i.result === '终止') ? '已有面试被标记为终止，不可新增' : finalStatuses.includes(detail.status) ? '投递已终态，不可新增面试' : '新增流程'}>
                        <FilePlus2 className="h-3.5 w-3.5" />新增流程
                      </button>
                    </div>
                    <div className="mt-3 space-y-3">
                      {timelineItems.length === 0 ? (
                        <p className="rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-400">暂无流程节点，可新增一面、二面、主管面或 HR 面。</p>
                      ) : timelineItems.map((node) => {
                        node?.interviewId ? isToday(node?.scheduledAt) : false;
                        const canDel = node?.interviewId ? canDeleteInterview(detail?.interviews || [], node.interviewId) : false
                        // 权重校验：存在更高权重面试时，禁止修改当前结果
                        const nodeWeight = node?.round ? (ROUND_ORDER[node.round] || 0) : 0
                        const hasHigherRound = nodeWeight > 0 && (detail?.interviews || []).some((i) => i.id !== node?.interviewId && (ROUND_ORDER[i.round] || 0) > nodeWeight)
                        const appTerminal = detail?.status ? finalStatuses.includes(detail.status) : false
                        return (
                        <div key={node?.key} className="grid grid-cols-[86px_1fr] gap-3 text-sm">
                          <span className="text-xs text-slate-400">{node?.scheduledEnd ? displayDatetimeRange(node?.scheduledAt, node?.scheduledEnd) : displayDate(node?.time)}</span>
                          <div className="border-l border-blue-200 pl-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-slate-800">{node?.title}</p>
                                {node?.interviewId && (node?.recordingAttachment ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600 ring-1 ring-blue-100">已上传录音</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-400 ring-1 ring-slate-200">待上传录音</span>)}
                                {node?.interviewId && (
                                  <div className="w-20" onClick={(e) => e.stopPropagation()} title={appTerminal ? '投递已终止或已 offer' : hasHigherRound ? '存在后续面试流程，不允许修改' : ''}>
                                    <StyledSelect
                                      size="compact"
                                      value={node?.result || '面试中'}
                                      onChange={(v) => updateInterviewResult(node!.interviewId!, v)}
                                      disabled={hasHigherRound || appTerminal}
                                      options={[
                                        { label: '面试中', value: '面试中' },
                                        { label: '通过', value: '通过' },
                                        { label: '终止', value: '终止' },
                                      ]}
                                      buttonClassName={`rounded-full font-medium ring-1 ${hasHigherRound || appTerminal ? 'opacity-50 cursor-not-allowed' : ''} ${node?.result === '通过' ? 'bg-emerald-50 text-emerald-600 ring-emerald-100' : node?.result === '终止' ? 'bg-red-50 text-red-600 ring-red-100' : 'bg-blue-50 text-blue-600 ring-blue-100'}`}
                                    />
                                  </div>
                                )}
                              </div>
                              {node?.interviewId && (
                                <div className="flex shrink-0 items-center gap-1">
                                  {(() => {
                                    const canEdit = !!node?.interviewId && !!node?.scheduledAt && node.scheduledAt <= Date.now()
                                    return (
                                      <>
                                        <button type="button" onClick={() => canEdit ? openEditInterview({ id: node!.interviewId!, round: node!.round, scheduledAt: node!.scheduledAt, scheduledEnd: node!.scheduledEnd, notes: node!.notes, result: node!.result }) : toast('面试时间未到，不可上传')} className={`text-slate-400 hover:text-blue-600 ${!canEdit ? 'opacity-40' : ''}`} title={canEdit ? '编辑' : '面试时间未到，不可上传'}><FilePlus2 className="h-3.5 w-3.5" /></button>
                                        <button type="button" onClick={() => canDel ? deleteInterview(node!.interviewId!) : toast('当前面试后已有面试，不支持删除')} className={`text-slate-400 hover:text-red-600 ${!canDel ? 'opacity-40' : ''}`} title={canDel ? '删除' : '后续已有面试，不可删除'}><Trash2 className="h-3.5 w-3.5" /></button>
                                      </>
                                    )
                                  })()}
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
                    <h3 className="text-sm font-semibold">岗位JD</h3>
                    <div className={`mt-3 h-40 whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-sm leading-6 text-slate-600 ${hiddenScrollClass}`}>{detail.jdText || '暂无岗位JD'}</div>
                  </section>

                  <section>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-blue-600" />
                        <h3 className="text-sm font-semibold text-slate-900">AI分析</h3>
                      </div>
                      {(() => {
                        const interviews = detail?.interviews || []
                        const hasInterviews = interviews.length > 0
                        const allConcluded = hasInterviews && interviews.every((i) => i.result === '通过' || i.result === '终止')
                        const disabled = !allConcluded || analyzing
                        return (
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={runAnalysis}
                            title={!hasInterviews ? '暂无面试记录' : !allConcluded ? '面试尚未结束（仍有面试进行中），待通过或终止后方可分析' : '开始智能分析'}
                            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition ${disabled ? 'cursor-not-allowed bg-slate-300 shadow-none' : 'bg-blue-600 shadow-blue-600/20 hover:bg-blue-700'}`}
                          >
                            {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                            {analyzing ? '分析中...' : '开始分析'}
                          </button>
                        )
                      })()}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-400">将综合此岗位多轮面试表现进行智能分析</p>

                    {(() => {
                      const interviews = detail?.interviews || []
                      const hasInterviews = interviews.length > 0
                      const allConcluded = hasInterviews && interviews.every((i) => i.result === '通过' || i.result === '终止')
                      if (!allConcluded && hasInterviews) {
                        return (
                          <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            面试尚未结束（仍有面试进行中），待面试通过或终止后方可分析
                          </p>
                        )
                      }
                      return null
                    })()}

                    {analysisResult ? (
                      <div className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3 text-sm leading-6 text-slate-600">
                        {analysisResult}
                      </div>
                    ) : (
                      <div className="mt-3 flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center">
                        <Sparkles className="h-5 w-5 text-slate-300" />
                        <p className="text-xs leading-5 text-slate-400">{analyzing ? '正在智能分析多轮面试表现...' : '点击「开始分析」后，结果将在此展示，涵盖多维度面试评估结论'}</p>
                      </div>
                    )}
                  </section>

                </div>
              )}
              {detail && flowEditorOpen && (
                <div className="absolute inset-0 z-10 flex items-end bg-slate-950/20 p-3 backdrop-blur-sm">
                  <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20">
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                      <div>
                        <h3 className="mt-1 text-sm font-semibold text-slate-900">面试记录</h3>
                      </div>
                      <button type="button" onClick={() => { setFlowEditorOpen(false); setEditingInterviewId(null) }} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
                    </div>
                    <div className="max-h-[calc(100vh-220px)] flex flex-col overflow-hidden px-4 pt-4">
                      <div className="shrink-0 grid grid-cols-2 gap-3 pb-4">
                        <label className={fieldLabelClass}>面试流程
                          <StyledSelect
                            value={interviewForm.round}
                            onChange={(v) => setInterviewForm({ ...interviewForm, round: v })}
                            placeholder="请选择流程"
                            options={getAvailableRounds(detail?.interviews?.map((i) => i.round) || [], editingInterviewId ? interviewForm.round : undefined).map((round) => ({ label: round, value: round }))}
                            className="mt-1"
                          />
                        </label>
                        <label className={fieldLabelClass}>日期
                          <div className="mt-1 [&_button]:!h-10 [&_button]:!rounded-xl [&_button]:!border-slate-200 [&_button]:!text-slate-800 [&_button]:focus:!border-blue-500 [&_button]:focus:!ring-4 [&_button]:focus:!ring-blue-500/10">
                            <YearMonthPicker value={toDatePickerValue(interviewForm.scheduledAt)} onChange={(value) => setInterviewForm({ ...interviewForm, scheduledAt: fromDatePickerValue(value) })} placeholder="选择日期" enableDay defaultStep="day" futureYears={3} />
                          </div>
                        </label>
                        <label className={`${fieldLabelClass} col-span-2`}>时间范围
                          <div className="mt-1">
                            <TimeRangePicker
                              startHour={extractHourMinute(interviewForm.scheduledAt).hour}
                              startMinute={extractHourMinute(interviewForm.scheduledAt).minute}
                              endHour={extractHourMinute(interviewForm.scheduledEnd || interviewForm.scheduledAt).hour}
                              endMinute={extractHourMinute(interviewForm.scheduledEnd || interviewForm.scheduledAt).minute}
                              onChangeStart={(h, m) => {
                                const newStart = buildTimestamp(interviewForm.scheduledAt, h, m)
                                setInterviewForm({
                                  ...interviewForm,
                                  scheduledAt: newStart,
                                  // 结束时间自动设为开始 + 1 小时（仅当结束时间未被用户手动修改过 或 结束 ≤ 新开始）
                                  scheduledEnd: (!interviewForm.scheduledEnd || (interviewForm.scheduledEnd <= (newStart ?? 0))) ? addOneHour(newStart) : interviewForm.scheduledEnd,
                                })
                              }}
                              onChangeEnd={(h, m) => setInterviewForm({ ...interviewForm, scheduledEnd: buildTimestamp(interviewForm.scheduledEnd ?? interviewForm.scheduledAt, h, m) })}
                              endBeforeStart={!!(interviewForm.scheduledEnd && interviewForm.scheduledAt && interviewForm.scheduledEnd < interviewForm.scheduledAt)}
                            />
                          </div>
                        </label>
                      </div>
                      {/* 面试记录 + 结果 — 可滚动区域 */}
                      <div className={`min-h-0 flex-1 border-t border-slate-100 pt-4 ${hiddenScrollClass}`}>
                        <div className="grid grid-cols-2 gap-3 pb-4">
                        <label className={`${fieldLabelClass} col-span-2`}>面试记录
                          <textarea
                            value={interviewForm.notes}
                            onChange={(event) => setInterviewForm({ ...interviewForm, notes: event.target.value })}
                            placeholder="记录面试问题、回答要点、面试官反馈等"
                            className="mt-1 h-24 w-full resize-none overflow-y-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none [scrollbar-width:none] focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 [&::-webkit-scrollbar]:hidden"
                          />
                        </label>
                        <label className={`${fieldLabelClass} col-span-2`}>面试录音
                          <div className="mt-1 space-y-2">
                            {currentInterview?.recordingAttachment ? (
                              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <FileCheck2 className="h-4 w-4 shrink-0 text-emerald-500" />
                                  <span className="truncate text-sm text-slate-700" title={currentInterview.recordingAttachment.fileName}>{currentInterview.recordingAttachment.fileName}</span>
                                  <span className="text-xs text-slate-400">({(currentInterview.recordingAttachment.fileSize / 1024).toFixed(1)} KB)</span>
                                </div>
                                <label className="cursor-pointer rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50">
                                  重新上传
                                  <input
                                    type="file"
                                    accept=".txt,.docx"
                                    className="hidden"
                                    disabled={uploadingRecording}
                                    onChange={(event) => {
                                      const file = event.target.files?.[0]
                                      if (file) uploadInterviewRecording(file)
                                      event.target.value = ''
                                    }}
                                  />
                                </label>
                              </div>
                            ) : (
                              <label className={`flex h-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed transition ${uploadingRecording ? 'cursor-not-allowed border-blue-200 bg-blue-50/50' : 'border-slate-200 bg-slate-50/70 hover:border-blue-300 hover:bg-blue-50/40'}`}>
                                <input
                                  type="file"
                                  accept=".txt,.docx"
                                  className="hidden"
                                  disabled={uploadingRecording}
                                  onChange={(event) => {
                                    const file = event.target.files?.[0]
                                    if (file) uploadInterviewRecording(file)
                                    event.target.value = ''
                                  }}
                                />
                                {uploadingRecording ? (
                                  <>
                                    <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                                    <span className="text-xs font-medium text-blue-600">正在上传录音文件...</span>
                                  </>
                                ) : (
                                  <>
                                    <UploadCloud className="h-5 w-5 text-slate-400" />
                                    <span className="text-xs font-medium text-slate-500">点击上传面试录音文件（.txt / .docx，≤2MB）</span>
                                  </>
                                )}
                              </label>
                            )}
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={goToRecordingAnalysis}
                                disabled={!editingInterviewId}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                前往录音分析
                              </button>
                              <button
                                type="button"
                                disabled
                                title="手动分析功能即将上线"
                                className="flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-medium text-slate-400"
                              >
                                <Sparkles className="h-3.5 w-3.5" />
                                手动分析
                              </button>
                            </div>
                          </div>
                        </label>
                      </div>
                    </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
                      {interviewEndBeforeStart && (
                        <div className="mr-auto flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          面试结束时间早于开始时间！
                        </div>
                      )}
                      <button type="button" onClick={() => setFlowEditorOpen(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100">取消</button>
                      <button type="button" onClick={saveInterview} disabled={interviewEndBeforeStart} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none disabled:opacity-70">
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
      )}

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
                <div className="mt-8 space-y-4 text-sm">
                  <div className="flex items-start gap-3"><FileText className="mt-0.5 h-4 w-4 text-blue-300" /><span className="text-slate-300">职位信息与 JD 集中归档</span></div>
                  <div className="flex items-start gap-3"><Layers3 className="mt-0.5 h-4 w-4 text-blue-300" /><span className="text-slate-300">快照可后续关联，便于按版本复盘</span></div>
                  <div className="flex items-start gap-3"><CalendarClock className="mt-0.5 h-4 w-4 text-blue-300" /><span className="text-slate-300">投递时间会进入时间线</span></div>
                </div>
              </div>
            </aside>
            <div className="flex min-h-0 flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                <div>
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
                      <label className={fieldLabelClass}>意向城市
                        <CityCascadeSelect
                          value={createForm.preferredCity}
                          onChange={(v) => setCreateForm({ ...createForm, preferredCity: v })}
                          placeholder="选择意向城市"
                          className="mt-1"
                        />
                      </label>
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
                        <StyledSelect
                          value={createForm.resumeId}
                          onChange={(v) => setCreateForm({ ...createForm, resumeId: v, snapshotVersionId: '' })}
                          placeholder="请选择简历"
                          options={resumes.map((resume) => ({ label: resume.title, value: resume.id }))}
                          className="mt-1"
                        />
                      </label>
                      <label className={fieldLabelClass}>关联快照（可选）
                        <StyledSelect
                          value={createForm.snapshotVersionId}
                          onChange={(v) => setCreateForm({ ...createForm, snapshotVersionId: v })}
                          placeholder="暂不关联版本"
                          options={[
                            { label: '暂不关联版本', value: '' },
                            ...createSnapshots.map((snapshot) => ({ label: snapshot.label || snapshot.snapshotType || snapshot.id.slice(0, 8), value: snapshot.id })),
                          ]}
                          disabled={!createForm.resumeId}
                          className="mt-1"
                        />
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
                <p className="text-xs text-slate-500"></p>
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
