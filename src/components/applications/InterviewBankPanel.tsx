import React, { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, ExternalLink, Loader2, Search, X } from 'lucide-react'
import { applicationsApi, type InterviewBankItem, type InterviewBankParams } from '@/api/applications'
import ToastContainer, { toast } from '@/components/common/Toast'
import StyledSelect from '@/components/common/StyledSelect'

// 面试题库 tab：跨投递检索自己录过的面试问题
// 相关规范：openspec/changes/interview-question-bank/ui-spec.md

const PAGE_SIZE = 20
const ROUND_OPTIONS = [
  { label: '全部轮次', value: '' },
  { label: '一面', value: '一面' },
  { label: '二面', value: '二面' },
  { label: '三面', value: '三面' },
  { label: '主管面', value: '主管面' },
  { label: 'HR面', value: 'HR面' },
  { label: '其他', value: '其他' },
]
const RANGE_OPTIONS: Array<{ label: string; value: '0' | '30' | '90' | '365' }> = [
  { label: '全部时间', value: '0' },
  { label: '近 30 天', value: '30' },
  { label: '近 3 个月', value: '90' },
  { label: '近 1 年', value: '365' },
]

// 复用列表现有的轮次徽标语义：一面 amber / 二面 blue / 三面 indigo / 主管面 violet / HR slate
const ROUND_BADGE: Record<string, string> = {
  '一面': 'bg-amber-50 text-amber-700 ring-amber-200',
  '二面': 'bg-blue-50 text-blue-700 ring-blue-200',
  '三面': 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  '主管面': 'bg-violet-50 text-violet-700 ring-violet-200',
  'HR面': 'bg-slate-100 text-slate-700 ring-slate-200',
}

function fmtDate(ms: number | null): string {
  if (!ms) return '未安排时间'
  const d = new Date(ms)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const HH = String(d.getHours()).padStart(2, '0')
  const MM = String(d.getMinutes()).padStart(2, '0')
  return `${d.getFullYear()}/${mm}/${dd} ${HH}:${MM}`
}

function firstLine(text: string, max = 60): string {
  const line = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? ''
  return line.length > max ? line.slice(0, max) + '…' : line
}

// 关键词高亮：仅用于问题正文/公司/岗位；避免破坏 whitespace-pre-wrap 的显示，逐段替换
function highlight(text: string, keyword: string): React.ReactNode {
  const kw = keyword.trim()
  if (!kw || !text) return text
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'ig'))
  return parts.map((part, i) =>
    part.toLowerCase() === kw.toLowerCase()
      ? <mark key={i} className="rounded bg-primary-light px-0.5 text-primary">{part}</mark>
      : <React.Fragment key={i}>{part}</React.Fragment>
  )
}

const InterviewBankPanel: React.FC<{ onOpenApplication?: (id: string) => void }> = ({ onOpenApplication }) => {
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [company, setCompany] = useState('')
  const [round, setRound] = useState('')
  const [range, setRange] = useState<'0' | '30' | '90' | '365'>('0')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<InterviewBankItem[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [totalRecords, setTotalRecords] = useState(0)
  const [totalCompanies, setTotalCompanies] = useState(0)
  const [loading, setLoading] = useState(false)
  const [firstLoad, setFirstLoad] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // 关键词防抖：输入 400ms 后触发请求；筛选/分页变化立即触发
  const debounceRef = useRef<number | null>(null)
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      setKeyword(keywordInput.trim())
      setPage(1)
    }, 400)
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current) }
  }, [keywordInput])

  const params = useMemo<InterviewBankParams>(() => ({
    keyword: keyword || undefined,
    company: company || undefined,
    round: round || undefined,
    range: (range === '0' ? 0 : Number(range)) as InterviewBankParams['range'],
    page,
    pageSize: PAGE_SIZE,
  }), [keyword, company, round, range, page])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    applicationsApi.getInterviewBank(params)
      .then((res) => {
        if (cancelled) return
        setItems(res.items || [])
        setTotalPages(res.pagination?.totalPages || 1)
        setTotalRecords(res.meta?.totalRecords || 0)
        setTotalCompanies(res.meta?.totalCompanies || 0)
      })
      .catch((err) => {
        if (cancelled) return
        toast(err instanceof Error ? err.message : '加载题库失败')
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
        setFirstLoad(false)
      })
    return () => { cancelled = true }
  }, [params])

  // 公司下拉选项动态汇总当前结果集，避免额外接口调用
  const companyOptions = useMemo(() => {
    const seen = new Map<string, number>()
    items.forEach((it) => {
      if (!it.companyName) return
      seen.set(it.companyName, (seen.get(it.companyName) || 0) + 1)
    })
    const sorted = Array.from(seen.entries()).sort((a, b) => b[1] - a[1])
    return [{ label: '全部公司', value: '' }, ...sorted.map(([name]) => ({ label: name, value: name }))]
  }, [items])

  const hasActiveFilter = Boolean(keyword || company || round || range !== '0')

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const resetFilters = () => {
    setKeywordInput('')
    setKeyword('')
    setCompany('')
    setRound('')
    setRange('0')
    setPage(1)
  }

  const copyQuestions = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast('已复制到剪贴板')
    } catch {
      toast('复制失败，请手动选择文本')
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <ToastContainer />
      {/* 筛选栏 */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder="搜索问题内容、公司或岗位…"
            aria-label="搜索面试题、公司或岗位"
            className="h-10 w-full rounded-xl border border-line bg-surface pl-9 pr-9 text-sm text-ink outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
          />
          {keywordInput && (
            <button
              type="button"
              aria-label="清空搜索"
              onClick={() => setKeywordInput('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="w-40">
          <StyledSelect
            value={company}
            onChange={(v) => { setCompany(v); setPage(1) }}
            options={companyOptions}
          />
        </div>
        <div className="w-32">
          <StyledSelect
            value={round}
            onChange={(v) => { setRound(v); setPage(1) }}
            options={ROUND_OPTIONS}
          />
        </div>
        <div className="w-32">
          <StyledSelect
            value={range}
            onChange={(v) => { setRange(v as '0' | '30' | '90' | '365'); setPage(1) }}
            options={RANGE_OPTIONS}
          />
        </div>
        {hasActiveFilter && (
          <button
            type="button"
            onClick={resetFilters}
            className="h-9 rounded-lg border border-line px-3 text-sm text-muted hover:border-primary hover:text-primary"
          >
            重置
          </button>
        )}
        <div role="status" aria-live="polite" className="ml-auto text-xs text-muted">
          共 <span className="font-semibold tabular-nums text-ink">{totalRecords}</span> 条面试记录 · 覆盖 <span className="font-semibold tabular-nums text-ink">{totalCompanies}</span> 家公司
        </div>
      </div>

      {/* 结果区 */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {firstLoad ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl border border-line bg-surface" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="rounded-full bg-brand-soft p-4">
              <BookOpen className="h-8 w-8 text-primary" />
            </div>
            <p className="text-sm font-medium text-ink">
              {hasActiveFilter ? '没有匹配的面试记录' : '还没有面试题库'}
            </p>
            <p className="max-w-md text-xs leading-relaxed text-muted">
              {hasActiveFilter
                ? '换个关键词或清空筛选试试。'
                : '记录一次面试后，它记下的问题会自动汇总在这里，方便复盘。'}
            </p>
          </div>
        ) : (
          <div className={`space-y-3 ${loading ? 'opacity-60 transition-opacity' : ''}`}>
            {items.map((it) => {
              const isOpen = expanded.has(it.interviewId)
              const roundBadge = ROUND_BADGE[it.round] || 'bg-slate-100 text-slate-600 ring-slate-200'
              return (
                <article
                  key={it.interviewId}
                  className="rounded-xl border border-line bg-surface transition-colors hover:border-primary/40 hover:bg-primary-light/30"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    aria-controls={`interview-body-${it.interviewId}`}
                    onClick={() => toggleExpand(it.interviewId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleExpand(it.interviewId)
                      }
                    }}
                    className="cursor-pointer p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-ink">
                            {highlight(it.companyName || '未填写', keyword)}
                          </span>
                          <span className="text-muted">·</span>
                          <span className="text-sm text-ink">
                            {highlight(it.targetTitle || '未填写', keyword)}
                          </span>
                          {it.round && (
                            <span className={`ml-1 rounded px-1.5 py-0.5 text-[11px] ring-1 ${roundBadge}`}>
                              {it.round}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                          <span className="tabular-nums">{fmtDate(it.scheduledAt)}</span>
                          {it.format && (<><span>·</span><span>{it.format}</span></>)}
                          {it.interviewer && (<><span>·</span><span>面试官：{it.interviewer}</span></>)}
                        </div>
                        <div className="mt-2 flex items-start gap-1.5 text-sm text-ink">
                          {isOpen
                            ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                            : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted" />}
                          <span className="min-w-0 flex-1 truncate">
                            {it.questions
                              ? <>问题：{highlight(firstLine(it.questions), keyword)}</>
                              : <span className="text-muted">暂无问题记录</span>}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {isOpen && (
                    <div id={`interview-body-${it.interviewId}`} className="space-y-3 border-t border-line px-4 pb-4 pt-3">
                      {it.questions && (
                        <div>
                          <div className="mb-1 text-xs font-medium text-muted">问题原文</div>
                          <pre className="whitespace-pre-wrap rounded-lg bg-canvas p-3 font-mono text-[13px] leading-relaxed text-ink">
                            {highlight(it.questions, keyword)}
                          </pre>
                        </div>
                      )}
                      {it.notes && (
                        <div>
                          <div className="mb-1 text-xs font-medium text-muted">面试笔记</div>
                          <div className="whitespace-pre-wrap rounded-lg bg-brand-soft/40 p-3 text-sm leading-relaxed text-ink">
                            {it.notes}
                          </div>
                        </div>
                      )}
                      {(it.result || it.nextAction) && (
                        <div className="text-xs text-muted">
                          {it.result && <>结果：<span className="text-ink">{it.result}</span></>}
                          {it.result && it.nextAction && <span className="mx-2">·</span>}
                          {it.nextAction && <>下一步：<span className="text-ink">{it.nextAction}</span></>}
                        </div>
                      )}
                      <div className="flex gap-2 pt-1">
                        {it.questions && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); void copyQuestions(it.questions) }}
                            className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:border-primary hover:text-primary"
                          >
                            复制问题
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (onOpenApplication) {
                              onOpenApplication(it.applicationId)
                            } else {
                              window.location.href = `/applications?id=${it.applicationId}`
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:border-primary hover:text-primary"
                        >
                          在投递详情中打开 <ExternalLink className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted disabled:opacity-40 hover:border-primary hover:text-primary"
                >
                  上一页
                </button>
                <span className="text-sm text-muted">
                  第 <span className="tabular-nums text-ink">{page}</span> / <span className="tabular-nums">{totalPages}</span> 页
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted disabled:opacity-40 hover:border-primary hover:text-primary"
                >
                  下一页
                </button>
              </div>
            )}
          </div>
        )}

        {loading && !firstLoad && (
          <div className="pointer-events-none fixed bottom-6 right-6 inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 text-xs text-muted shadow-md ring-1 ring-line">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />加载中
          </div>
        )}
      </div>
    </div>
  )
}

export default InterviewBankPanel
