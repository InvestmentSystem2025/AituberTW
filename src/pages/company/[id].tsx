import React, { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'
import settingsStore from '@/features/stores/settings'
import type { AIService } from '@/features/constants/settings'
import { GuidedOverlay } from '@/components/tutorial/GuidedOverlay'
import type { ResumeReviewLabel } from '@/lib/resumeReview'
import { RESUME_REVIEW_LABEL_ORDER, RESUME_REVIEW_LABEL_ZH } from '@/lib/resumeReview'
import { PersonalityAnalysisPanel } from '@/components/interview/PersonalityAnalysisPanel'

type RecruiterTutorialState = {
  active: boolean
  step: number
  companyId?: string | null
  startedAt?: string
}

const TUTORIAL_KEY = 'recruiter_tutorial_v1'

function loadTutorialState(): RecruiterTutorialState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(TUTORIAL_KEY)
    if (!raw) return null
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return null
    if (typeof obj.step !== 'number') return null
    return {
      active: !!obj.active,
      step: obj.step,
      companyId: obj.companyId ?? null,
      startedAt: typeof obj.startedAt === 'string' ? obj.startedAt : undefined,
    }
  } catch {
    return null
  }
}

function saveTutorialState(next: RecruiterTutorialState) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TUTORIAL_KEY, JSON.stringify(next))
}

function clearTutorialState() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(TUTORIAL_KEY)
}

type Member = { profile_id: string; company_role: 'admin' | 'recruiter' | 'viewer'; email?: string }
type AIInterviewer = { id: string; name: string; model_name: string; model_config?: any }
type JobOpening = {
  id: string
  job_title: string
  use_ai_generate_question?: boolean
  result_notification_method?: 'immediate' | 'later'
  evaluation_policy?: any
  target_hires?: number
  hired_count?: number
}
type ResumeReviewStandard = {
  id: string
  company_id: string
  job_opening_id: string
  name: string
  label: ResumeReviewLabel
  sort_order: number
}
type Question = { id: string; name?: string; source: 'AI' | 'USER'; detail?: any }
type JOQ = { id: string; job_opening_id: string; question_bank_id?: string | null; detail?: any; sort_order?: number; is_active?: boolean }
type Interview = { 
  id: string; 
  job_opening_id: string; 
  start_time: string; 
  end_time?: string | null; 
  status?: 'waitToStart' | 'completed' | 'lateButComplete' | 'noShow' | 'cancelled'; 
  profiles_id?: string; 
  candidate_email?: string;
  profiles?: { id: string; family_name?: string | null; given_name?: string | null } | null
  // 可能會包含從 Supabase 關聯查詢回來的 interview_sessions（0 或 1 筆）
  interview_sessions?: any;
}
type EvaluationCriteria = { 
  id: string; 
  key: string; 
  display_name: string; 
  weight: number; 
  max_score: number; 
  scoring_logic?: 'addition' | 'deduction' | 'composite';
  addition_rules?: string[];
  deduction_rules?: string[];
  sort_order: number 
}

export default function CompanyAdminPage() {
  const router = useRouter()
  const companyId = String(router.query.id || '')
  const [token, setToken] = useState('')
  const [tab, setTab] = useState<'members' | 'ai' | 'jobs' | 'qbank' | 'joq' | 'interviews' | 'resumeReview'>('members')
  const [resumeReviewTab, setResumeReviewTab] = useState<'standards' | 'create' | 'results'>('standards')
  const [tutorial, setTutorial] = useState<RecruiterTutorialState>({ active: false, step: 0, companyId: null })
  const tutorialHydratedStepRef = useRef<number | null>(null)

  // company info
  const [companyName, setCompanyName] = useState<string>('')

  // common lists
  const [members, setMembers] = useState<Member[]>([])
  const [aiList, setAiList] = useState<AIInterviewer[]>([])
  const [jobs, setJobs] = useState<JobOpening[]>([])
  const [qb, setQb] = useState<Question[]>([])
  const [joq, setJoq] = useState<JOQ[]>([])
  const [ivs, setIvs] = useState<Interview[]>([])
  const [interviewQuota, setInterviewQuota] = useState({ used_count: 0, free_quota: 3, remaining: 3 })
  const [resumeReviewInviteQuota, setResumeReviewInviteQuota] = useState({
    used_count: null as number | null,
    free_quota: 3,
    remaining: null as number | null,
  })
  const [isResumeReviewInviteQuotaLoading, setIsResumeReviewInviteQuotaLoading] = useState(false)
  const [reviewStandards, setReviewStandards] = useState<ResumeReviewStandard[]>([])
  const [reviewResults, setReviewResults] = useState<any[]>([])
  const [copiedReviewResultState, setCopiedReviewResultState] = useState<Record<string, 'show' | 'fade'>>({})
  const copiedReviewResultTimersRef = useRef<Record<string, { fade?: any; clear?: any }>>({})

  // editing states
  const [editingAI, setEditingAI] = useState<string | null>(null)
  const [editingJob, setEditingJob] = useState<string | null>(null)
  const [editingQB, setEditingQB] = useState<string | null>(null)
  const [editingJOQ, setEditingJOQ] = useState<string | null>(null)
  const [editingIV, setEditingIV] = useState<string | null>(null)
  const [expandedIV, setExpandedIV] = useState<string | null>(null)
  const [reviewingIV, setReviewingIV] = useState<string | null>(null)
  const [reviewingLoading, setReviewingLoading] = useState(false)
  const [criteriaDisplayNames, setCriteriaDisplayNames] = useState<Record<string, Record<string, string>>>({})
  const [criteriaListByJobOpeningId, setCriteriaListByJobOpeningId] = useState<
    Record<string, Array<{ key: string; display_name: string; sort_order?: number }>>
  >({})
  const criteriaLoadingRef = useRef<Set<string>>(new Set())

  // recruiter feedback (per interview)
  const [recruiterFeedbackByInterviewId, setRecruiterFeedbackByInterviewId] = useState<Record<string, any>>({})
  const [alreadyFeedbackByInterviewId, setAlreadyFeedbackByInterviewId] = useState<Record<string, boolean>>({})
  const [recruiterDraftByInterviewId, setRecruiterDraftByInterviewId] = useState<
    Record<
      string,
      {
        criteria_bias: Record<string, number>
        overall_decision_bias: number
        explainability: number
        reason_flags?: string[]
        other_detail?: string
        comment: string
      }
    >
  >({})
  const [recruiterDraftDirtyByInterviewId, setRecruiterDraftDirtyByInterviewId] = useState<Record<string, boolean>>({})
  const [recruiterDraftPromptedByInterviewId, setRecruiterDraftPromptedByInterviewId] = useState<Record<string, boolean>>({})
  const [recruiterFeedbackNudge, setRecruiterFeedbackNudge] = useState<{ open: boolean; interviewId: string | null }>({
    open: false,
    interviewId: null,
  })
  const afterNudgeActionRef = useRef<null | (() => void)>(null)
  const [recruiterFeedbackStatusByInterviewId, setRecruiterFeedbackStatusByInterviewId] = useState<
    Record<string, { loading?: boolean; saving?: boolean; error?: string | null; savedAt?: string | null }>
  >({})
  const recruiterFeedbackLoadingRef = useRef<Set<string>>(new Set())

  // evaluation policy form state
  const criteriaNames: Record<string, string> = {
    'content_integrity': '內容完整性',
    'logical_clarity': '邏輯清晰度',
    'professional_depth': '專業深度',
    'communication': '溝通能力',
    'personal_attributes': '個人特質'
  }
  const criteriaKeys = Object.keys(criteriaNames)

  const DEFAULT_CUSTOM_CRITERIA = [
    // 預設五項：統一改為綜合制（composite），避免扣分制一路扣到 0 分
    { key: 'content_integrity', display_name: '內容完整性', weight: 0.2, max_score: 10, scoring_logic: 'composite' as const, deduction_rules: '答非所問-1.5分\n回答不完整或缺少關鍵資訊-1分', addition_rules: '切題且至少回答問題核心+0.5分\n提供具體例子/步驟/數據+1分' },
    { key: 'logical_clarity', display_name: '邏輯清晰度', weight: 0.2, max_score: 10, scoring_logic: 'composite' as const, deduction_rules: '條理不清-1分\n自相矛盾或邏輯錯誤-1.5分', addition_rules: '回答有結構（先結論後理由）+1分\n前後一致、因果清楚+1.5分' },
    { key: 'professional_depth', display_name: '專業深度', weight: 0.2, max_score: 10, scoring_logic: 'composite' as const, deduction_rules: '專業知識明顯錯誤-1.5分\n無法舉出實務案例或只背誦定義-1分', addition_rules: '使用正確基本概念/術語+0.5分\n能解釋trade-off或提出實務案例+2分\n展現深度理解（拆解原因/限制）+1分' },
    { key: 'communication', display_name: '溝通能力', weight: 0.2, max_score: 10, scoring_logic: 'composite' as const, deduction_rules: '表達不清晰-1分\n表達不流暢或跳躍導致難以理解-1分', addition_rules: '表達清楚、重點明確+0.5分\n主動釐清前提/確認需求/條列化表達+1分' },
    { key: 'personal_attributes', display_name: '個人特質', weight: 0.2, max_score: 10, scoring_logic: 'composite' as const, deduction_rules: '缺乏企圖心與主動性-1.5分\n對學習成長明顯消極-1分\n團隊合作態度不佳或推責-1.5分\n抗壓與面對挫折態度消極-1分', addition_rules: '展現正常職場合作/學習態度+0.5分\n向上心求知慾（具體例子）+1.5分\n持續學習（具體做法）+1.5分\n抗壓與面對挫折成熟+1.5分\n主動性/負責任態度+1.5分' }
  ] as Array<{ key: string; display_name: string; weight: number; max_score: number; scoring_logic: 'addition' | 'deduction' | 'composite'; addition_rules: string; deduction_rules: string }>

  const [newJob, setNewJob] = useState({ 
    job_title: '', 
    use_ai_generate_question: false, 
    result_notification_method: 'immediate' as 'immediate' | 'later',
    target_hires: 1,
    enableCustomCriteria: false,
    evalPolicy: {
      overall_threshold: '',
      criteria_minimums: {} as Record<string, string>,
      active_criteria: Object.keys(criteriaNames) as string[]
    },
    customCriteria: DEFAULT_CUSTOM_CRITERIA
  })
  const [editJob, setEditJob] = useState({ 
    job_title: '', 
    use_ai_generate_question: false, 
    result_notification_method: 'immediate' as 'immediate' | 'later',
    target_hires: 1,
    enableCustomCriteria: false,
    evalPolicy: {
      overall_threshold: '',
      criteria_minimums: {} as Record<string, string>,
      // UI 改為「輸入框預設打開」
      active_criteria: Object.keys(criteriaNames) as string[]
    },
    customCriteria: [] as Array<{ key: string; display_name: string; weight: number; max_score: number; scoring_logic: 'addition' | 'deduction' | 'composite'; addition_rules: string; deduction_rules: string; id?: string }>
  })

  // forms
  const [newMemberEmail, setNewMemberEmail] = useState('')
  const [newMemberRole, setNewMemberRole] = useState<'recruiter' | 'viewer'>('recruiter')
  const [newAI, setNewAI] = useState({ name: '', model_name: 'yuki.vrm', model_config: '{}' })
  const [newQB, setNewQB] = useState({ 
    name: '', 
    source: 'USER' as 'USER' | 'AI', 
    questions: [] as string[],
    showForm: false
  })
  const [newJOQ, setNewJOQ] = useState({ job_opening_id: '', question_bank_id: '', questions: [] as string[], showForm: false })
  const [newIV, setNewIV] = useState({ job_opening_id: '', start_time: '', end_time: '', profiles_id: '', candidate_email: '', review_type: 'HUMAN' as 'AI' | 'HUMAN' | 'MIXED' })
  const [newReviewStandardJobOpeningId, setNewReviewStandardJobOpeningId] = useState('')
  const [reviewStandardDrafts, setReviewStandardDrafts] = useState<Array<{ name: string; label: ResumeReviewLabel }>>([
    { name: '', label: 'MUST' },
  ])
  const [newReviewRequest, setNewReviewRequest] = useState({ job_opening_id: '', candidate_email: '', remarks: '' })
  const [reviewResultFilterJobOpeningId, setReviewResultFilterJobOpeningId] = useState('')
  const [deletingReviewResultId, setDeletingReviewResultId] = useState<string | null>(null)
  const [isGeneratingJOQAI, setIsGeneratingJOQAI] = useState(false)

  // edit forms (starts with empty)
  const [editAI, setEditAI] = useState({ name: '', model_name: 'yuki.vrm', model_config: '{}' })
  const [editQB, setEditQB] = useState({ name: '', source: 'USER' as 'USER' | 'AI', questions: [] as string[] })
  const [editJOQ, setEditJOQ] = useState({ job_opening_id: '', question_bank_id: '', questions: [] as string[] })
  const [editIV, setEditIV] = useState({ job_opening_id: '', start_time: '', end_time: '', profiles_id: '', candidate_email: '', review_type: 'HUMAN' as 'AI' | 'HUMAN' | 'MIXED' })

  // Debug switch (works in dev/prod): localStorage.setItem('debugInterviewCollapse','1')
  const shouldDebugInterviewCollapse = () => {
    try {
      return typeof window !== 'undefined' && window.localStorage?.getItem('debugInterviewCollapse') === '1'
    } catch {
      return false
    }
  }

  useEffect(() => {
    return () => {
      const timers = copiedReviewResultTimersRef.current || {}
      Object.values(timers).forEach((t) => {
        if (t?.fade) clearTimeout(t.fade)
        if (t?.clear) clearTimeout(t.clear)
      })
      copiedReviewResultTimersRef.current = {}
    }
  }, [])

  // helper: 將資料庫時間字串轉為 <input type="datetime-local"> 需要的本地時間格式（避免被轉成 UTC 提前 8 小時）
  const toLocalDatetimeInput = (value?: string | null): string => {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    const year = d.getFullYear()
    const month = pad(d.getMonth() + 1)
    const day = pad(d.getDate())
    const hours = pad(d.getHours())
    const minutes = pad(d.getMinutes())
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  // JSON validation helper
  const isValidJSON = (str: string) => {
    try {
      JSON.parse(str)
      return true
    } catch {
      return false
    }
  }

  // 將 evaluation policy 表單數據轉換為 JSON
  const evalPolicyToJSON = (policy: { overall_threshold: string; criteria_minimums: Record<string, string>; active_criteria: string[] }) => {
    const result: any = {}
    
    if (policy.overall_threshold && policy.overall_threshold.trim()) {
      const threshold = parseFloat(policy.overall_threshold)
      if (!isNaN(threshold) && threshold >= 0 && threshold <= 100) {
        result.overall_threshold = threshold
      }
    }

    const per_criteria: Record<string, number> = {}
    policy.active_criteria.forEach(key => {
      const value = policy.criteria_minimums[key]
      if (value && value.trim()) {
        const num = parseFloat(value) / 100 // 轉換為 0-1 的比例
        if (!isNaN(num) && num >= 0 && num <= 1) {
          per_criteria[key] = num
        }
      }
    })
    
    if (Object.keys(per_criteria).length > 0) {
      result.per_criteria_minimums = per_criteria
    }

    // 如果結果是空對象，返回 null
    return Object.keys(result).length > 0 ? result : null
  }

  useEffect(() => {
    const init = async () => {
      try {
        let { data } = await supabase.auth.getSession()
        
        // 檢查並刷新 token
        if (data.session) {
          const expiresAt = data.session.expires_at
          const now = Math.floor(Date.now() / 1000)
          
          // 如果 token 已過期或將在 5 分鐘內過期，則刷新
          if (expiresAt && expiresAt < now + 300) {
            const { data: newData, error: refreshError } = await supabase.auth.refreshSession(data.session)
            if (!refreshError && newData.session) {
              data = newData
            } else {
              alert('登入已過期，請重新登入')
              router.push('/me')
              return
            }
          }
        }
        
      const t = data.session?.access_token || ''
      setToken(t)
      if (companyId) {
        await loadCompanyName()
        await Promise.all([
          loadMembers(t),
          loadAI(t),
          loadJobs(t),
          loadQB(t),
          loadJOQ(t),
          loadIVs(t),
          loadInterviewQuota(t),
          loadReviewStandards(t),
          loadReviewResults(t),
          loadResumeReviewInviteQuota(t, companyId)
        ])
        }
      } catch (err) {
        console.error('初始化錯誤:', err)
        alert('初始化失敗，請重新登入')
      }
    }
    init()
  }, [companyId])

  const headers = (t?: string, extra: Record<string, string> = {}): HeadersInit => {
    const tk = (typeof t === 'string' && t) ? t : token
    return tk ? { 'x-supabase-token': tk, ...extra } : { ...extra }
  }

  const authRecoveringRef = useRef(false)
  const AUTH_EXPIRED_MESSAGE = '您的認證已過期，請按 F5 重新整理後再試'

  const isUnauthorizedResponse = (r?: Response, payload?: any) => {
    const statusUnauthorized = !!r && (r.status === 401 || r.status === 403)
    const code = String(payload?.error || '').toUpperCase()
    return statusUnauthorized || code === 'UNAUTHORIZED'
  }

  // 刷新 token 函數
  const handleTokenRefresh = async () => {
    if (authRecoveringRef.current) return
    authRecoveringRef.current = true
    try {
      const { data, error } = await supabase.auth.refreshSession()
      if (!error && data.session) {
        setToken(data.session.access_token)
        window.location.reload()
      } else {
        alert(AUTH_EXPIRED_MESSAGE)
      }
    } catch (err) {
      console.error('刷新 token 失敗:', err)
      alert(AUTH_EXPIRED_MESSAGE)
    } finally {
      authRecoveringRef.current = false
    }
  }

  // loaders
  const loadCompanyName = async () => {
    if (!companyId) return
    const { data, error } = await supabase
      .from('company')
      .select('company_name')
      .eq('id', companyId)
      .single()
    if (!error && data) {
      setCompanyName(data.company_name || '')
    }
  }
  const loadMembers = async (t: string) => {
    const r = await fetch(`/api/company/members/list?company_id=${companyId}`, { headers: headers(t) })
    const j = await r.json(); setMembers(j.items || [])
  }
  const loadAI = async (t: string) => {
    const r = await fetch(`/api/ai-interviewer/list?company_id=${companyId}`, { headers: headers(t) })
    const j = await r.json(); setAiList(j.items || [])
  }
  const loadJobs = async (t: string) => {
    const r = await fetch(`/api/job-opening/list?company_id=${companyId}`, { headers: headers(t) })
    const j = await r.json(); setJobs(j.items || [])
  }
  const loadQB = async (t: string) => {
    const r = await fetch(`/api/question-bank/list?company_id=${companyId}`, { headers: headers(t) })
    const j = await r.json(); setQb(j.items || [])
  }
  const loadJOQ = async (t: string) => {
    const r = await fetch(`/api/job-opening-questions/list?company_id=${companyId}`, { headers: headers(t) })
    const j = await r.json(); setJoq(j.items || [])
  }
  const loadIVs = async (t: string) => {
    const r = await fetch(`/api/interviews/list?company_id=${companyId}`, { headers: headers(t) })
    const j = await r.json()
    const items = j.items || []
    setIvs(items)
    // 從 session 帶回的 already_feedback 建立快取（避免已提交的面試還跳提醒）
    const map: Record<string, boolean> = {}
    ;(Array.isArray(items) ? items : []).forEach((iv: any) => {
      const rawSession = iv?.interview_sessions
      const s = Array.isArray(rawSession) ? rawSession[0] : rawSession
      map[String(iv?.id || '')] = !!s?.already_feedback
    })
    setAlreadyFeedbackByInterviewId(map)
  }
  const loadInterviewQuota = async (t: string) => {
    const r = await fetch(`/api/company/interview-quota/get?company_id=${companyId}`, { headers: headers(t) })
    const j = await r.json().catch(() => ({}))
    if (r.ok && j?.ok) {
      setInterviewQuota({
        used_count: Number(j.used_count || 0),
        free_quota: Number(j.free_quota || 3),
        remaining: Number(j.remaining || 0),
      })
    }
  }
  const loadReviewStandards = async (t: string, jobOpeningId?: string) => {
    const q = new URLSearchParams({ company_id: companyId })
    if (jobOpeningId) q.set('job_opening_id', jobOpeningId)
    const r = await fetch(`/api/resume-review-standards/list?${q.toString()}`, { headers: headers(t) })
    const j = await r.json().catch(() => ({}))
    setReviewStandards(j.items || [])
  }
  const loadReviewResults = async (t: string, jobOpeningId?: string) => {
    const q = new URLSearchParams({ company_id: companyId, limit: '50', offset: '0' })
    if (jobOpeningId) q.set('job_opening_id', jobOpeningId)
    const r = await fetch(`/api/resume-reviews/list?${q.toString()}`, { headers: headers(t) })
    const j = await r.json().catch(() => ({}))
    setReviewResults(j.items || [])
  }
  const loadResumeReviewInviteQuota = async (t: string, companyIdForQuery: string) => {
    const q = new URLSearchParams({
      company_id: companyIdForQuery,
    })
    setIsResumeReviewInviteQuotaLoading(true)
    try {
      const r = await fetch(`/api/resume-reviews/invitation-quota/get?${q.toString()}`, {
        headers: headers(t),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok && j?.ok) {
        setResumeReviewInviteQuota({
          used_count: Number(j.used_count || 0),
          free_quota: Number(j.free_quota || 3),
          remaining: Number(j.remaining ?? 0),
        })
      }
    } finally {
      setIsResumeReviewInviteQuotaLoading(false)
    }
  }

  useEffect(() => {
    if (!token || !companyId) return
    if (tab !== 'resumeReview' || resumeReviewTab !== 'create') return

    const timer = window.setTimeout(() => {
      // 如果初始化已經載入成功，切換回 Tab 時就不要再閃動讀取狀態。
      if (resumeReviewInviteQuota.remaining != null && !isResumeReviewInviteQuotaLoading) return
      void loadResumeReviewInviteQuota(token, companyId)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [token, companyId, tab, resumeReviewTab, resumeReviewInviteQuota.remaining, isResumeReviewInviteQuotaLoading])

  // actions (minimal creates)
  const addMember = async (e: React.FormEvent) => {
    e.preventDefault(); if (!newMemberEmail) return
    await fetch('/api/company/members/add', { method: 'POST', headers: headers(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ company_id: companyId, email: newMemberEmail, company_role: newMemberRole }) })
    setNewMemberEmail(''); setNewMemberRole('recruiter'); await loadMembers(token)
  }
  const addAI = async (e: React.FormEvent) => {
    e.preventDefault(); if (!newAI.name) return
    if (!isValidJSON(newAI.model_config)) return alert('model_config 必須是有效的 JSON')
    await fetch('/api/ai-interviewer/create', { method: 'POST', headers: headers(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ company_id: companyId, name: newAI.name, model_name: newAI.model_name, model_config: newAI.model_config }) })
    setNewAI({ name: '', model_name: 'yuki.vrm', model_config: '{}' }); await loadAI(token)
  }
  const addJob = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newJob.job_title || !newJob.job_title.trim()) {
      alert('請輸入職種名稱')
      return
    }
    
    // 如果啟用了自訂評估項目，驗證 weight 總和
    if (newJob.enableCustomCriteria) {
      const totalWeight = newJob.customCriteria.reduce((sum, c) => sum + c.weight, 0)
      if (Math.abs(totalWeight - 1.0) > 0.01) {
        alert(`所有評估項目的比重總和必須為 1.0（目前：${totalWeight.toFixed(2)}）`)
        return
      }
      
      // 驗證必填欄位
      for (const criteria of newJob.customCriteria) {
        if (!criteria.key || !criteria.display_name) {
          alert('請填寫所有評估項目的 Key 和 Display Name')
          return
        }
      }
    }
    
    // 將表單數據轉換為 JSON
    const evaluation_policy = evalPolicyToJSON(newJob.evalPolicy)
    
    const r = await fetch('/api/job-opening/create', { 
      method: 'POST', 
      headers: headers(token, { 'Content-Type': 'application/json' }), 
      body: JSON.stringify({ 
        company_id: companyId, 
        job_title: newJob.job_title,
        use_ai_generate_question: newJob.use_ai_generate_question,
        result_notification_method: newJob.result_notification_method,
        target_hires: Math.max(1, Number(newJob.target_hires) || 1),
        evaluation_policy
      }) 
    })
    const createOk = r.ok
    
    if (r.status === 401 || r.status === 403) {
      await handleTokenRefresh()
      return
    }
    
    const result = await r.json()
    
    // 新增職種後：同步 evaluation_criteria（就算未展開「自訂評估項目」也要確保預設為綜合制）
    if (createOk && result.job_opening_id) {
      const desiredCriteria = (newJob.enableCustomCriteria ? newJob.customCriteria : DEFAULT_CUSTOM_CRITERIA) || []
      // 獲取該職種的 evaluation_criteria
      const criteriaRes = await fetch(
        `/api/evaluation-criteria/list?company_id=${companyId}&job_opening_id=${result.job_opening_id}`,
        { headers: headers(token) }
      )
      const criteriaData = await criteriaRes.json()
      const existingCriteria = criteriaData.items || []
      const existingByKey: Record<string, any> = {}
      ;(Array.isArray(existingCriteria) ? existingCriteria : []).forEach((c: any) => {
        if (c && typeof c.key === 'string') existingByKey[c.key] = c
      })
      
      // 更新或創建 evaluation_criteria
      for (let i = 0; i < desiredCriteria.length; i++) {
        const customCriteria = desiredCriteria[i]
        const existing = existingByKey[customCriteria.key]
        const logic = (customCriteria.scoring_logic || 'composite') as 'addition' | 'deduction' | 'composite'
        
        // 轉換規則為 JSONB 格式（字符串數組）
        const additionRulesArray = (logic === 'addition' || logic === 'composite')
          ? (customCriteria.addition_rules ? customCriteria.addition_rules.split('\n').filter(r => r.trim()) : [])
          : null
        const deductionRulesArray = (logic === 'deduction' || logic === 'composite')
          ? (customCriteria.deduction_rules ? customCriteria.deduction_rules.split('\n').filter(r => r.trim()) : [])
          : null
        
        if (existing) {
          // 更新現有的
          await fetch('/api/evaluation-criteria/update', {
            method: 'POST',
            headers: headers(token, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              id: existing.id,
              company_id: companyId,
              key: customCriteria.key,
              display_name: customCriteria.display_name,
              weight: customCriteria.weight,
              // 自訂評估項目 max score 鎖死為 10
              max_score: 10,
              scoring_logic: logic,
              // 綜合制：同時帶入加分與扣分規則
              addition_rules: additionRulesArray,
              deduction_rules: deductionRulesArray,
              sort_order: i + 1
            })
          })
        } else {
          // 創建新的
          await fetch('/api/evaluation-criteria/create', {
            method: 'POST',
            headers: headers(token, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              company_id: companyId,
              job_opening_id: result.job_opening_id,
              key: customCriteria.key,
              display_name: customCriteria.display_name,
              weight: customCriteria.weight,
              // 自訂評估項目 max score 鎖死為 10
              max_score: 10,
              scoring_logic: logic,
              // 綜合制：同時帶入加分與扣分規則
              addition_rules: additionRulesArray,
              deduction_rules: deductionRulesArray,
              sort_order: i + 1
            })
          })
        }
      }
      
      // 刪除多餘的 criteria
      if (newJob.enableCustomCriteria && existingCriteria.length > desiredCriteria.length) {
        const desiredKeys = new Set(desiredCriteria.map((c: any) => c.key))
        for (const c of existingCriteria) {
          if (!c?.id || !c?.key) continue
          if (desiredKeys.has(c.key)) continue
          await fetch('/api/evaluation-criteria/delete', {
            method: 'POST',
            headers: headers(token, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              id: c.id,
              company_id: companyId
            })
          })
        }
      }
    }
    
    setNewJob({ 
      job_title: '', 
      use_ai_generate_question: false, 
      result_notification_method: 'immediate',
      target_hires: 1,
      enableCustomCriteria: false,
      evalPolicy: {
        overall_threshold: '',
        criteria_minimums: {},
        active_criteria: Object.keys(criteriaNames)
      },
      customCriteria: DEFAULT_CUSTOM_CRITERIA
    })
    await loadJobs(token)
    // 教學 step6：建立完成一個職種後進到 step7（共用題庫）
    if (isTutorialActive && tutorial.step === 6 && createOk && result?.job_opening_id) {
      advanceTutorial(7)
    }
  }
  const addQB = async (e: React.FormEvent) => {
    e.preventDefault(); 
    if (!newQB.name || !newQB.name.trim()) {
      alert('請輸入題庫名稱')
      return
    }
    // 過濾掉空白問題，確保至少有一題有內容
    const trimmedQuestions = newQB.questions
      .map(q => q.trim())
      .filter(q => q.length > 0)

    if (trimmedQuestions.length === 0) {
      alert('問題內容不能為空，請至少輸入一個有效問題')
      return
    }
    
    // 將問題列表轉換為 JSON 格式
    const detail = {
      questions: trimmedQuestions
    }
    
    const r = await fetch('/api/question-bank/create', { 
      method: 'POST', 
      headers: headers(token, { 'Content-Type': 'application/json' }), 
      body: JSON.stringify({ 
        company_id: companyId, 
        name: newQB.name,
        source: newQB.source,
        detail 
      }) 
    })
    
    if (r.status === 401 || r.status === 403) {
      await handleTokenRefresh()
      return
    }
    
    setNewQB({ name: '', source: 'USER', questions: [], showForm: false })
    await loadQB(token)
  }
  const addJOQ = async (e: React.FormEvent) => {
    e.preventDefault(); 
    if (!newJOQ.job_opening_id) {
      alert('請選擇職種')
      return
    }

    // 過濾掉空白問題，確保至少有一題有內容
    const trimmedQuestions = newJOQ.questions
      .map(q => q.trim())
      .filter(q => q.length > 0)

    if (trimmedQuestions.length === 0) {
      alert('問題內容不能為空，請至少輸入一個有效問題')
      return
    }
    
    // 將問題列表轉換為 JSON 格式
    const detail = {
      questions: trimmedQuestions
    }
    
    const r = await fetch('/api/job-opening-questions/create', { 
      method: 'POST', 
      headers: headers(token, { 'Content-Type': 'application/json' }), 
      body: JSON.stringify({ 
        company_id: companyId, 
        job_opening_id: newJOQ.job_opening_id,
        question_bank_id: newJOQ.question_bank_id || null,
        detail 
      }) 
    })
    
    if (r.status === 401 || r.status === 403) {
      await handleTokenRefresh()
      return
    }

    // 教學 step9：成功建立一個題庫後進到 step10（面試管理）
    if (isTutorialActive && tutorial.step === 9 && r.ok) {
      advanceTutorial(10)
    }

    setNewJOQ({ job_opening_id: '', question_bank_id: '', questions: [], showForm: false })
    await loadJOQ(token)
  }
  const generateJOQQuestionsWithAI = async (mode: 'new' | 'edit') => {
    const target = mode === 'new' ? newJOQ : editJOQ
    const jobOpeningId = target.job_opening_id

    if (!jobOpeningId) {
      alert('請先選擇職種，才可使用 AI 生成問題')
      return
    }
    if (!companyId) {
      alert('公司資訊缺失，請重新整理頁面後再試')
      return
    }
    const job = jobs.find(j => j.id === jobOpeningId)
    const jobTitle = job?.job_title || ''
    if (!jobTitle) {
      alert('找不到對應的職種名稱，請重新選擇職種後再試')
      return
    }

    const ss = settingsStore.getState()
    const aiService = ss.selectAIService as AIService

    if (ss.selectAIService === 'dify') {
      alert('目前「AI 生成問題」僅支援一般 AI 服務，請在設定中選擇 OpenAI / Groq 等服務後再試')
      return
    }

    setIsGeneratingJOQAI(true)
    try {
      const criteriaRes = await fetch(
        `/api/evaluation-criteria/list?company_id=${companyId}&job_opening_id=${jobOpeningId}`,
        { headers: headers(token) }
      )
      if (!criteriaRes.ok) {
        console.error('載入 evaluation_criteria 失敗', await criteriaRes.text())
        alert('載入評價標準失敗，無法使用 AI 生成問題')
        return
      }
      const criteriaJson = await criteriaRes.json()
      const criteriaItems = Array.isArray(criteriaJson)
        ? criteriaJson
        : (criteriaJson.items || [])

      if (!Array.isArray(criteriaItems) || criteriaItems.length === 0) {
        alert('找不到此職種的評價標準，無法使用 AI 生成問題')
        return
      }

      const criteriaText = criteriaItems
        .map((c: any, idx: number) => {
          const additionRules = Array.isArray(c.addition_rules)
            ? c.addition_rules
            : (c.addition_rules ? [c.addition_rules] : [])
          const deductionRules = Array.isArray(c.deduction_rules)
            ? c.deduction_rules
            : (c.deduction_rules ? [c.deduction_rules] : [])
          return [
            `${idx + 1}. key: ${c.key}`,
            `   display_name: ${c.display_name}`,
            `   scoring_logic: ${c.scoring_logic || 'composite'}`,
            `   addition_rules: ${additionRules.filter((r: string) => r && r.trim()).join('；') || '無'}`,
            `   deduction_rules: ${deductionRules.filter((r: string) => r && r.trim()).join('；') || '無'}`,
          ].join('\n')
        })
        .join('\n')

      const prompt = `
你是一個專業的面試官，這次要面試的職種為「${jobTitle}」。
該職種的評價標準如下（每項包含 key、display_name、scoring_logic、addition_rules、deduction_rules）：
${criteriaText}

請根據上述職種以及評價標準，生成 5〜10 題適合的面試問題。
請只輸出問題列表本身，可以使用編號或分行，每行代表一題，不需要額外解釋。`.trim()

      let apiKey = ''
      if (typeof aiService === 'string' && aiService !== 'dify') {
        apiKey = (ss[`${aiService}Key` as keyof typeof ss] as string) || ''
      }

      const requestData: any = {
        messages: [
          { role: 'system', content: '你是一位專業的人資面試官，請用繁體中文回答。' },
          { role: 'user', content: prompt },
        ],
        stream: false,
        apiKey,
        aiService,
        model: ss.selectAIModel,
        localLlmUrl: ss.localLlmUrl,
        azureEndpoint: ss.azureEndpoint,
        temperature: ss.temperature,
        maxTokens: ss.maxTokens,
      }

      const aiRes = await fetch('/api/ai/generate-joq-questions', {
        method: 'POST',
        headers: headers(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ ...requestData, company_id: companyId }),
      })

      if (!aiRes.ok) {
        const err = await aiRes.json().catch(() => ({} as any))
        console.error('AI 生成問題失敗', err)
        alert(err?.message || 'AI 生成問題失敗，請稍後再試')
        return
      }

      const aiJson = await aiRes.json()
      const aiText = typeof aiJson.text === 'string' ? aiJson.text : ''

      if (!aiText.trim()) {
        alert('AI 沒有返回可用的問題，請稍後再試')
        return
      }

      const lines = aiText
        .split(/\r?\n/)
        .map((l: string) => l.trim())
        .filter(Boolean)

      const parsedQuestions = lines
        .map((line: string) =>
          line.replace(/^(\d+[\.\)]\s*|\d+\s+|[-•]\s*)/, '').trim()
        )
        .filter((line: string) => line.length > 0)

      if (parsedQuestions.length === 0) {
        alert('無法從 AI 回覆中解析出問題，請稍後再試')
        return
      }

      if (mode === 'new') {
        const base = newJOQ.questions
        const hasOnlyEmpty = base.length === 0 || (base.length === 1 && !base[0].trim())
        const merged = hasOnlyEmpty ? parsedQuestions : [...base, ...parsedQuestions]
        setNewJOQ({ ...newJOQ, questions: merged })
      } else {
        const base = editJOQ.questions
        const hasOnlyEmpty = base.length === 0 || (base.length === 1 && !base[0].trim())
        const merged = hasOnlyEmpty ? parsedQuestions : [...base, ...parsedQuestions]
        setEditJOQ({ ...editJOQ, questions: merged })
      }
    } catch (error) {
      console.error('AI 生成問題例外:', error)
      alert('AI 生成問題發生錯誤，請稍後再試')
    } finally {
      setIsGeneratingJOQAI(false)
    }
  }
  const addIV = async (e: React.FormEvent) => {
    e.preventDefault(); 
    if (!newIV.job_opening_id || !newIV.start_time) {
      alert('請填寫職種和開始時間')
      return
    }
    
    // 驗證至少填寫 profiles_id 或 candidate_email 其中一項
    const hasProfilesId = newIV.profiles_id && newIV.profiles_id.trim()
    const hasCandidateEmail = newIV.candidate_email && newIV.candidate_email.trim()
    
    if (!hasProfilesId && !hasCandidateEmail) {
      alert('請填寫候選人用戶 ID 或 Email（至少需填寫其中一項）')
      return
    }
    
    // 準備 payload，空字串的 profiles_id 和 candidate_email 設為 undefined
    const payload: any = {
      company_id: companyId,
      job_opening_id: newIV.job_opening_id,
      start_time: newIV.start_time
    }
    
    if (hasProfilesId) {
      payload.profiles_id = newIV.profiles_id.trim()
    }
    
    if (newIV.end_time && newIV.end_time.trim()) {
      payload.end_time = newIV.end_time.trim()
    }
    
    if (hasCandidateEmail) {
      payload.candidate_email = newIV.candidate_email.trim()
    }

    // 評價方式（AI / HUMAN）：預設 AI，可選人類或混合
    if (newIV.review_type && ['AI', 'HUMAN', 'MIXED'].includes(newIV.review_type)) {
      payload.review_type = newIV.review_type
    }
    
    const r = await fetch('/api/interviews/create', { 
      method: 'POST', 
      headers: headers(token, { 'Content-Type': 'application/json' }), 
      body: JSON.stringify(payload) 
    })
    
    if (r.status === 401 || r.status === 403) {
      await handleTokenRefresh()
      return
    }
    
    if (!r.ok) {
      const result = await r.json()
      let errorMsg = '建立失敗'
      if (result.error === 'XOR_PROFILE_EMAIL') {
        errorMsg = '用戶 ID 與 Email 只能填寫其中一項，且至少需要填寫其中一項'
      } else if (result.error === 'PROFILE_ID_NOT_FOUND') {
        errorMsg = '找不到該用戶 ID，請確認 ID 是否正確'
      } else if (result.error === 'CAPACITY_REACHED') {
        errorMsg = '此職種已達招募目標人數，無法再建立面試'
      } else if (result.error === 'INTERVIEW_QUOTA_EXCEEDED') {
        errorMsg = '公司面試免費配額已用完（3/3）'
      } else if (result.error === 'CANDIDATE_NOT_JOBSEEKER') {
        errorMsg = '候選人必須是 jobSeeker，請更換候選人'
      } else if (result.error === 'CREATE_FAILED') {
        errorMsg = '建立失敗，請確認輸入的資料是否正確'
      }
      alert(errorMsg)
      return
    }
    
    setNewIV({ job_opening_id: '', start_time: '', end_time: '', profiles_id: '', candidate_email: '', review_type: 'HUMAN' }); 
    await Promise.all([loadIVs(token), loadInterviewQuota(token)])
  }
  const createReviewStandards = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newReviewStandardJobOpeningId) {
      alert('請先選擇職種')
      return
    }
    const validDrafts = reviewStandardDrafts
      .map((x) => ({ ...x, name: x.name.trim() }))
      .filter((x) => x.name.length > 0)
    if (validDrafts.length === 0) {
      alert('請至少輸入一個標準名稱')
      return
    }
    const baseSortOrder =
      reviewStandards.filter((x) => x.job_opening_id === newReviewStandardJobOpeningId).length + 1

    for (let i = 0; i < validDrafts.length; i++) {
      const draft = validDrafts[i]
      const r = await fetch('/api/resume-review-standards/create', {
        method: 'POST',
        headers: headers(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          company_id: companyId,
          job_opening_id: newReviewStandardJobOpeningId,
          name: draft.name,
          label: draft.label,
          sort_order: baseSortOrder + i,
        }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        if (isUnauthorizedResponse(r, j)) {
          await handleTokenRefresh()
          return
        }
        alert(j.error || '建立審查標準失敗')
        return
      }
    }

    setReviewStandardDrafts([{ name: '', label: 'MUST' }])
    await loadReviewStandards(token, newReviewStandardJobOpeningId)
  }
  const updateReviewStandard = async (item: ResumeReviewStandard, patch: Partial<ResumeReviewStandard>) => {
    const r = await fetch('/api/resume-review-standards/update', {
      method: 'POST',
      headers: headers(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        id: item.id,
        company_id: companyId,
        name: patch.name ?? item.name,
        label: patch.label ?? item.label,
        sort_order: patch.sort_order ?? item.sort_order,
      }),
    })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      if (isUnauthorizedResponse(r, j)) {
        await handleTokenRefresh()
        return
      }
      alert(j.error || '更新審查標準失敗')
      return
    }
    await loadReviewStandards(token, item.job_opening_id)
  }
  const removeReviewStandard = async (item: ResumeReviewStandard) => {
    const r = await fetch('/api/resume-review-standards/delete', {
      method: 'POST',
      headers: headers(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: item.id, company_id: companyId }),
    })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      if (isUnauthorizedResponse(r, j)) {
        await handleTokenRefresh()
        return
      }
      alert(j.error || '刪除審查標準失敗')
      return
    }
    await loadReviewStandards(token, item.job_opening_id)
  }
  const createResumeReviewRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newReviewRequest.job_opening_id || !newReviewRequest.candidate_email.trim()) {
      alert('請輸入職種與候選人 Email')
      return
    }
    const r = await fetch('/api/resume-reviews/create', {
      method: 'POST',
      headers: headers(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        company_id: companyId,
        job_opening_id: newReviewRequest.job_opening_id,
        candidate_email: newReviewRequest.candidate_email.trim(),
        ...(newReviewRequest.remarks.trim() ? { remarks: newReviewRequest.remarks.trim() } : {}),
      }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      if (isUnauthorizedResponse(r, j)) {
        await handleTokenRefresh()
        return
      }
      if (j.error === 'MISSING_REVIEW_STANDARD') {
        alert('此職種尚未設定審查標準，請先到「審查標準」新增')
        return
      }
      if (j.error === 'CAPACITY_REACHED') {
        alert('此職種已達招募目標人數，無法再建立履歷審查')
        return
      }
      if (j.error === 'INVITATION_LIMIT_EXCEEDED') {
        alert('此公司最多免費使用 3 次履歷審查功能')
        await loadResumeReviewInviteQuota(token, companyId)
        return
      }
      alert(j.error || '建立履歷審查失敗')
      return
    }
    alert('履歷審查邀請已建立並寄送')
    setNewReviewRequest({ ...newReviewRequest, candidate_email: '', remarks: '' })
    await Promise.all([loadReviewResults(token), loadResumeReviewInviteQuota(token, companyId)])
  }
  const removeReviewResult = async (item: any) => {
    const reviewResultId = String(item?.review_result_id || '')
    if (!reviewResultId) return

    const candidateLabel = item?.candidate_name || item?.candidate_email || '此筆資料'
    const confirmed = window.confirm(`確定要刪除「${candidateLabel}」的審查結果嗎？`)
    if (!confirmed) return

    setDeletingReviewResultId(reviewResultId)
    try {
      const r = await fetch('/api/resume-reviews/delete', {
        method: 'POST',
        headers: headers(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          review_result_id: reviewResultId,
          company_id: companyId,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        if (isUnauthorizedResponse(r, j)) {
          await handleTokenRefresh()
          return
        }
        if (j.error === 'NOT_FOUND') {
          alert('此審查結果已不存在，將重新整理列表')
          await loadReviewResults(token, reviewResultFilterJobOpeningId || undefined)
          return
        }
        alert(j.error || '刪除審查結果失敗')
        return
      }

      setReviewResults((prev) => prev.filter((x: any) => String(x.review_result_id) !== reviewResultId))
    } finally {
      setDeletingReviewResultId(null)
    }
  }
  const evalIV = async (id: string, result: 'hired' | 'rejected') => {
    if (reviewingLoading) return
    setReviewingLoading(true)
    try {
      const r = await fetch('/api/interviews/evaluate', { 
        method: 'POST', 
        headers: headers(token, { 'Content-Type': 'application/json' }), 
        body: JSON.stringify({ interviews_id: id, interview_result: result }) 
      })
      const j = await r.json().catch(() => ({} as any))
      if (!r.ok) {
        if (isUnauthorizedResponse(r, j)) {
          await handleTokenRefresh()
          return
        }
        alert(j.error || '評價失敗')
        return
      }
      alert(result === 'hired' ? '已標記為錄取' : '已標記為拒絕')
      setReviewingIV(null)
      await Promise.all([loadIVs(token), loadJobs(token)])
    } catch (err) {
      console.error('評價失敗:', err)
      alert('評價失敗，請稍後再試')
    } finally {
      setReviewingLoading(false)
    }
  }

  // update handlers
  const updateAI = async (id: string) => {
    if (!isValidJSON(editAI.model_config)) return alert('model_config 必須是有效的 JSON')
    await fetch('/api/ai-interviewer/update', { method: 'POST', headers: headers(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ id, company_id: companyId, ...editAI }) })
    setEditingAI(null); await loadAI(token)
  }
  const updateJob = async (id: string) => {
    // 如果啟用了自訂評估項目，驗證 weight 總和
    if (editJob.enableCustomCriteria) {
      const totalWeight = editJob.customCriteria.reduce((sum, c) => sum + c.weight, 0)
      if (Math.abs(totalWeight - 1.0) > 0.01) {
        alert(`所有評估項目的比重總和必須為 1.0（目前：${totalWeight.toFixed(2)}）`)
        return
      }
      // 驗證必要的欄位
      const hasEmptyFields = editJob.customCriteria.some(c => !c.key || !c.display_name)
      if (hasEmptyFields) {
        alert('請填寫所有評估項目的 Key 和 Display Name')
        return
      }
    }

    const evaluation_policy = evalPolicyToJSON(editJob.evalPolicy)
    const r = await fetch('/api/job-opening/update', { 
      method: 'POST', 
      headers: headers(token, { 'Content-Type': 'application/json' }), 
      body: JSON.stringify({ 
        id, 
        company_id: companyId, 
        job_title: editJob.job_title,
        use_ai_generate_question: editJob.use_ai_generate_question,
        result_notification_method: editJob.result_notification_method,
        target_hires: Math.max(1, Number(editJob.target_hires) || 1),
        evaluation_policy 
      }) 
    })
    
    if (!r.ok) {
      const errorData = await r.json()
      if (isUnauthorizedResponse(r, errorData)) {
        await handleTokenRefresh()
        return
      }
      alert(errorData.error || '更新職種失敗')
      return
    }
    
    // 如果啟用了自訂評估項目，更新 evaluation_criteria
    if (editJob.enableCustomCriteria) {
      // 獲取該職種的 evaluation_criteria
      const criteriaRes = await fetch(
        `/api/evaluation-criteria/list?company_id=${companyId}&job_opening_id=${id}`,
        { headers: headers(token) }
      )
      const criteriaData = criteriaRes.ok ? await criteriaRes.json() : { items: [] }
      const existingCriteria = Array.isArray(criteriaData) ? criteriaData : (criteriaData.items || [])
      const existingIds = new Set(existingCriteria.map((c: EvaluationCriteria) => c.id))

      // 更新或創建 evaluation_criteria
      for (const criteria of editJob.customCriteria) {
        const additionRulesArray = Array.isArray(criteria.addition_rules)
          ? criteria.addition_rules
          : (criteria.addition_rules ? criteria.addition_rules.split('\n').filter((r: string) => r.trim()) : null)
        const deductionRulesArray = Array.isArray(criteria.deduction_rules)
          ? criteria.deduction_rules
          : (criteria.deduction_rules ? criteria.deduction_rules.split('\n').filter((r: string) => r.trim()) : null)

        const payload = {
          company_id: companyId,
          job_opening_id: id,
          key: criteria.key,
          display_name: criteria.display_name,
          weight: criteria.weight,
          // 自訂評估項目 max score 鎖死為 10
          max_score: 10,
          scoring_logic: criteria.scoring_logic,
          // 綜合制：同時帶入加分與扣分規則
          addition_rules: (criteria.scoring_logic === 'addition' || criteria.scoring_logic === 'composite') ? additionRulesArray : null,
          deduction_rules: (criteria.scoring_logic === 'deduction' || criteria.scoring_logic === 'composite') ? deductionRulesArray : null,
          sort_order: editJob.customCriteria.indexOf(criteria) + 1
        }

        if (criteria.id && existingIds.has(criteria.id)) {
          // 更新現有的
          await fetch('/api/evaluation-criteria/update', {
            method: 'POST',
            headers: headers(token, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({ id: criteria.id, ...payload })
          })
        } else {
          // 創建新的
          await fetch('/api/evaluation-criteria/create', {
            method: 'POST',
            headers: headers(token, { 'Content-Type': 'application/json' }),
            body: JSON.stringify(payload)
          })
        }
      }

      // 刪除已移除的 criteria
      const currentIds = new Set(editJob.customCriteria.filter(c => c.id).map(c => c.id))
      for (const existing of existingCriteria) {
        if (!currentIds.has(existing.id)) {
          await fetch('/api/evaluation-criteria/delete', {
            method: 'POST',
            headers: headers(token, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({ id: existing.id, company_id: companyId })
          })
        }
      }
    } else {
      // 如果禁用了自訂評估項目，刪除所有相關的 criteria
      const criteriaRes = await fetch(
        `/api/evaluation-criteria/list?company_id=${companyId}&job_opening_id=${id}`,
        { headers: headers(token) }
      )
      if (criteriaRes.ok) {
        const criteriaData = await criteriaRes.json()
        const existingCriteria = Array.isArray(criteriaData) ? criteriaData : (criteriaData.items || [])
        for (const existing of existingCriteria) {
          await fetch('/api/evaluation-criteria/delete', {
            method: 'POST',
            headers: headers(token, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({ id: existing.id, company_id: companyId })
          })
        }
      }
    }

    setEditingJob(null); await loadJobs(token)
  }
  const updateQB = async (id: string) => {
    if (!editQB.name) {
      alert('請輸入題庫名稱')
      return
    }
    if (editQB.questions.length === 0 || editQB.questions.every(q => !q.trim())) {
      alert('請至少保留一個問題')
      return
    }
    
    const detail = {
      questions: editQB.questions.filter(q => q.trim())
    }
    
    await fetch('/api/question-bank/update', { 
      method: 'POST', 
      headers: headers(token, { 'Content-Type': 'application/json' }), 
      body: JSON.stringify({ 
        id, 
        company_id: companyId, 
        name: editQB.name,
        source: editQB.source,
        detail 
      }) 
    })
    setEditingQB(null); await loadQB(token)
  }
  const updateJOQ = async (id: string) => {
    if (!editJOQ.job_opening_id) {
      alert('請選擇職種')
      return
    }
    if (editJOQ.questions.length === 0 || editJOQ.questions.every(q => !q.trim())) {
      alert('請至少保留一個問題')
      return
    }
    
    const detail = {
      questions: editJOQ.questions.filter(q => q.trim())
    }
    
    await fetch('/api/job-opening-questions/update', { 
      method: 'POST', 
      headers: headers(token, { 'Content-Type': 'application/json' }), 
      body: JSON.stringify({ 
        id, 
        company_id: companyId, 
        job_opening_id: editJOQ.job_opening_id,
        question_bank_id: editJOQ.question_bank_id || null,
        detail 
      }) 
    })
    setEditingJOQ(null); await loadJOQ(token)
  }
  const updateIV = async (id: string) => {
    // 準備 payload，空字串的 profiles_id 和 candidate_email 設為 undefined
    const payload: any = {
      id,
      company_id: companyId,
      job_opening_id: editIV.job_opening_id,
      start_time: editIV.start_time
    }
    
    if (editIV.end_time && editIV.end_time.trim()) {
      payload.end_time = editIV.end_time.trim()
    }
    
    if (editIV.profiles_id && editIV.profiles_id.trim()) {
      payload.profiles_id = editIV.profiles_id.trim()
    }
    
    if (editIV.candidate_email && editIV.candidate_email.trim()) {
      payload.candidate_email = editIV.candidate_email.trim()
    }
    
    const r = await fetch('/api/interviews/update', { 
      method: 'POST', 
      headers: headers(token, { 'Content-Type': 'application/json' }), 
      body: JSON.stringify(payload) 
    })
    
    if (r.status === 401 || r.status === 403) {
      await handleTokenRefresh()
      return
    }
    
    if (!r.ok) {
      const result = await r.json()
      if (isUnauthorizedResponse(r, result)) {
        await handleTokenRefresh()
        return
      }
      alert(result.error === 'XOR_PROFILE_EMAIL' ? '用戶 ID 與 Email 只能填寫其中一項' : result.error === 'PROFILE_ID_NOT_FOUND' ? '找不到該用戶 ID' : '更新失敗')
      return
    }
    
    setEditingIV(null); 
    await loadIVs(token)
  }

  // delete handlers
  const deleteAI = async (id: string) => {
    if (!confirm('刪除這個 AI 面試官？')) return
    await fetch('/api/ai-interviewer/delete', { method: 'POST', headers: headers(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ id, company_id: companyId }) })
    await loadAI(token)
  }
  const deleteJob = async (id: string) => {
    if (!confirm('刪除這個職種？')) return
    await fetch('/api/job-opening/delete', { method: 'POST', headers: headers(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ id, company_id: companyId }) })
    await loadJobs(token)
  }
  const deleteQB = async (id: string) => {
    if (!confirm('刪除這個題庫？')) return
    await fetch('/api/question-bank/delete', { method: 'POST', headers: headers(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ id, company_id: companyId }) })
    await loadQB(token)
  }
  const deleteJOQ = async (id: string) => {
    if (!confirm('刪除這個職種個別題庫？')) return
    await fetch('/api/job-opening-questions/delete', { method: 'POST', headers: headers(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ id, company_id: companyId }) })
    await loadJOQ(token)
  }
  const deleteIV = async (id: string) => {
    if (!confirm('刪除這個面試？')) return
    await fetch('/api/interviews/delete', { method: 'POST', headers: headers(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ id, company_id: companyId }) })
    await loadIVs(token)
  }

  // start edit helpers
  const startEditAI = (item: AIInterviewer) => {
    setEditAI({ name: item.name, model_name: item.model_name, model_config: typeof item.model_config === 'object' ? JSON.stringify(item.model_config, null, 2) : item.model_config || '{}' })
    setEditingAI(item.id)
  }
  const startEditJob = async (item: JobOpening) => {
    let evalPolicy = {
      overall_threshold: '',
      criteria_minimums: {} as Record<string, string>,
      active_criteria: [] as string[]
    }

    // 解析現有的 evaluation_policy
    if (item.evaluation_policy && typeof item.evaluation_policy === 'object') {
      const policy = item.evaluation_policy as any
      if (policy.overall_threshold) {
        evalPolicy.overall_threshold = String(policy.overall_threshold)
      }
      if (policy.per_criteria_minimums && typeof policy.per_criteria_minimums === 'object') {
        Object.keys(policy.per_criteria_minimums).forEach(key => {
          const value = policy.per_criteria_minimums[key]
          evalPolicy.active_criteria.push(key)
          evalPolicy.criteria_minimums[key] = String((value * 100).toFixed(0)) // 轉換回 0-100
        })
      }
    }
    // UI 改為「輸入框預設打開」：若既有資料未設定 per_criteria_minimums，仍預設顯示全部項目可直接輸入
    if (!evalPolicy.active_criteria || evalPolicy.active_criteria.length === 0) {
      evalPolicy.active_criteria = Object.keys(criteriaNames)
    }

    // 載入 evaluation_criteria
    let customCriteria: Array<{ key: string; display_name: string; weight: number; max_score: number; scoring_logic: 'addition' | 'deduction' | 'composite'; addition_rules: string; deduction_rules: string; id?: string }> = []
    let enableCustomCriteria = false

    try {
      const criteriaRes = await fetch(
        `/api/evaluation-criteria/list?company_id=${companyId}&job_opening_id=${item.id}`,
        { headers: headers(token) }
      )
      if (criteriaRes.ok) {
        const criteriaData = await criteriaRes.json()
        const criteriaArray = Array.isArray(criteriaData) ? criteriaData : (criteriaData.items || [])
        if (criteriaArray && Array.isArray(criteriaArray) && criteriaArray.length > 0) {
          enableCustomCriteria = true
          customCriteria = criteriaArray.map((c: EvaluationCriteria) => ({
            id: c.id,
            key: c.key,
            display_name: c.display_name,
            weight: c.weight,
            // 自訂評估項目 max score 鎖死為 10（即使資料庫不是 10，也統一視為 10）
            max_score: 10,
            scoring_logic: c.scoring_logic || 'composite',
            addition_rules: Array.isArray(c.addition_rules) ? c.addition_rules.join('\n') : (typeof c.addition_rules === 'string' ? c.addition_rules : ''),
            deduction_rules: Array.isArray(c.deduction_rules) ? c.deduction_rules.join('\n') : (typeof c.deduction_rules === 'string' ? c.deduction_rules : '')
          }))
        }
      }
    } catch (error) {
      console.error('載入 evaluation_criteria 失敗:', error)
    }

    setEditJob({
      job_title: item.job_title,
      use_ai_generate_question: item.use_ai_generate_question || false,
      result_notification_method: item.result_notification_method || 'immediate',
      target_hires: Math.max(1, Number(item.target_hires) || 1),
      enableCustomCriteria,
      evalPolicy,
      customCriteria
    })
    setEditingJob(item.id)
  }
  const startEditQB = (item: Question) => {
    let questions: string[] = []
    
    // 解析 detail 獲取問題列表
    if (item.detail) {
      let detailObj: any = null
      if (typeof item.detail === 'object') {
        detailObj = item.detail
      } else if (typeof item.detail === 'string') {
        try {
          detailObj = JSON.parse(item.detail)
        } catch (e) {
          console.error('Failed to parse detail:', e)
        }
      }
      
      if (detailObj && detailObj.questions && Array.isArray(detailObj.questions)) {
        questions = detailObj.questions
      } else if (typeof detailObj === 'string') {
        // 如果 detail 本身是字串，當作單一問題
        questions = [detailObj]
      }
    }
    
    // 如果沒有問題，至少提供一個空的問題欄位
    if (questions.length === 0) {
      questions = ['']
    }
    
    setEditQB({
      name: item.name || '',
      source: item.source,
      questions
    })
    setEditingQB(item.id)
  }
  const startEditJOQ = (item: JOQ) => {
    let questions: string[] = []
    
    // 解析 detail 獲取問題列表
    if (item.detail) {
      let detailObj: any = null
      if (typeof item.detail === 'object') {
        detailObj = item.detail
      } else if (typeof item.detail === 'string') {
        try {
          detailObj = JSON.parse(item.detail)
        } catch (e) {
          console.error('Failed to parse detail:', e)
        }
      }
      
      if (detailObj && detailObj.questions && Array.isArray(detailObj.questions)) {
        questions = detailObj.questions
      }
    }
    
    // 如果沒有問題，至少提供一個空的問題欄位
    if (questions.length === 0) {
      questions = ['']
    }
    
    setEditJOQ({
      job_opening_id: item.job_opening_id,
      question_bank_id: item.question_bank_id || '',
      questions
    })
    setEditingJOQ(item.id)
  }
  const startEditIV = (item: Interview) => {
    setEditIV({
      job_opening_id: item.job_opening_id,
      start_time: item.start_time ? toLocalDatetimeInput(item.start_time) : '',
      end_time: item.end_time ? toLocalDatetimeInput(item.end_time) : '',
      profiles_id: item.profiles_id || '',
      candidate_email: item.candidate_email || '',
      review_type: ((item as any).review_type as 'AI' | 'HUMAN' | 'MIXED') || 'HUMAN',
    })
    setEditingIV(item.id)
  }

  const ensureCriteriaDisplayNames = async (jobOpeningId: string) => {
    if (!companyId || criteriaDisplayNames[jobOpeningId] || criteriaLoadingRef.current.has(jobOpeningId)) return

    criteriaLoadingRef.current.add(jobOpeningId)
    try {
      const r = await fetch(
        `/api/evaluation-criteria/list?company_id=${companyId}&job_opening_id=${jobOpeningId}`,
        { headers: headers() }
      )
      if (!r.ok) return
      const j = await r.json()
      const items = Array.isArray(j) ? j : (j.items || [])
      const map: Record<string, string> = {}
      const list: Array<{ key: string; display_name: string; sort_order?: number }> = []
      items.forEach((c: any) => {
        if (c && c.key && c.display_name) {
          map[c.key] = c.display_name
          list.push({ key: c.key, display_name: c.display_name, sort_order: c.sort_order })
        }
      })
      setCriteriaDisplayNames(prev => ({
        ...prev,
        [jobOpeningId]: map
      }))
      setCriteriaListByJobOpeningId(prev => ({
        ...prev,
        [jobOpeningId]: list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      }))
    } catch (error) {
      console.error('載入 evaluation_criteria 失敗:', error)
    } finally {
      criteriaLoadingRef.current.delete(jobOpeningId)
    }
  }

  const ensureMyRecruiterFeedback = async (interviewId: string) => {
    if (!interviewId || recruiterFeedbackByInterviewId[interviewId] || recruiterFeedbackLoadingRef.current.has(interviewId)) return
    recruiterFeedbackLoadingRef.current.add(interviewId)
    setRecruiterFeedbackStatusByInterviewId(prev => ({
      ...prev,
      [interviewId]: { ...(prev[interviewId] || {}), loading: true, error: null }
    }))
    try {
      const r = await fetch(
        `/api/interviews/feedback/recruiter?interview_id=${encodeURIComponent(interviewId)}`,
        { headers: headers() }
      )
      if (!r.ok) {
        const txt = await r.text().catch(() => '')
        throw new Error(txt || `HTTP ${r.status}`)
      }
      const j = await r.json()
      setRecruiterFeedbackByInterviewId(prev => ({ ...prev, [interviewId]: j.feedback || null }))
      // 從 API 端回傳同步 already_feedback（方便不 reload 時也能立刻抑制提醒）
      if (typeof j?.already_feedback === 'boolean') {
        setAlreadyFeedbackByInterviewId(prev => ({ ...prev, [interviewId]: j.already_feedback }))
      }

      // 如果尚未有 draft，優先用已提交內容初始化
      if (!recruiterDraftByInterviewId[interviewId]) {
        const p = j?.feedback?.payload
        if (p && typeof p === 'object') {
          setRecruiterDraftByInterviewId(prev => ({
            ...prev,
            [interviewId]: {
              criteria_bias: (p.criteria_bias && typeof p.criteria_bias === 'object') ? p.criteria_bias : {},
              overall_decision_bias: Number(p.overall_decision_bias) || 0,
              explainability: Number(p.explainability) || 3,
              reason_flags: Array.isArray(p.reason_flags) ? p.reason_flags : [],
              other_detail: typeof p.other_detail === 'string' ? p.other_detail : '',
              comment: typeof p.comment === 'string' ? p.comment : '',
            }
          }))
          // 初始化後視為未修改
          setRecruiterDraftDirtyByInterviewId(prev => ({ ...prev, [interviewId]: false }))
        }
      }

      setRecruiterFeedbackStatusByInterviewId(prev => ({
        ...prev,
        [interviewId]: {
          ...(prev[interviewId] || {}),
          savedAt: j?.feedback?.updated_at || j?.feedback?.created_at || null,
        }
      }))
    } catch (e: any) {
      setRecruiterFeedbackStatusByInterviewId(prev => ({
        ...prev,
        [interviewId]: { ...(prev[interviewId] || {}), error: e?.message || '載入回饋失敗' }
      }))
    } finally {
      recruiterFeedbackLoadingRef.current.delete(interviewId)
      setRecruiterFeedbackStatusByInterviewId(prev => ({
        ...prev,
        [interviewId]: { ...(prev[interviewId] || {}), loading: false }
      }))
    }
  }

  const submitRecruiterFeedback = async (interviewId: string) => {
    const draft = recruiterDraftByInterviewId[interviewId]
    if (!draft) return
    setRecruiterFeedbackStatusByInterviewId(prev => ({
      ...prev,
      [interviewId]: { ...(prev[interviewId] || {}), saving: true, error: null }
    }))
    try {
      const r = await fetch('/api/interviews/feedback/recruiter', {
        method: 'POST',
        headers: headers(undefined, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          interview_id: interviewId,
          criteria_bias: draft.criteria_bias,
          overall_decision_bias: draft.overall_decision_bias,
          explainability: draft.explainability,
          reason_flags: draft.reason_flags || [],
          other_detail: draft.other_detail || '',
          comment: draft.comment,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
      setRecruiterFeedbackByInterviewId(prev => ({ ...prev, [interviewId]: j.feedback || null }))
      setRecruiterFeedbackStatusByInterviewId(prev => ({
        ...prev,
        [interviewId]: {
          ...(prev[interviewId] || {}),
          savedAt: j?.feedback?.updated_at || j?.feedback?.created_at || new Date().toISOString(),
        }
      }))
      // 送出成功：清掉 dirty，並允許下次再改時再次提示一次
      setRecruiterDraftDirtyByInterviewId(prev => ({ ...prev, [interviewId]: false }))
      setRecruiterDraftPromptedByInterviewId(prev => ({ ...prev, [interviewId]: false }))
      // 一旦送出，該面試不再提醒（依使用者需求）
      setAlreadyFeedbackByInterviewId(prev => ({ ...prev, [interviewId]: true }))
      setRecruiterFeedbackNudge({ open: false, interviewId: null })
    } catch (e: any) {
      setRecruiterFeedbackStatusByInterviewId(prev => ({
        ...prev,
        [interviewId]: { ...(prev[interviewId] || {}), error: e?.message || '送出失敗' }
      }))
    } finally {
      setRecruiterFeedbackStatusByInterviewId(prev => ({
        ...prev,
        [interviewId]: { ...(prev[interviewId] || {}), saving: false }
      }))
    }
  }

  const maybePromptRecruiterFeedbackOnce = (interviewId: string) => {
    if (!interviewId) return
    const status = recruiterFeedbackStatusByInterviewId[interviewId] || {}
    if (status.saving) return
    const dirty = !!recruiterDraftDirtyByInterviewId[interviewId]
    if (!dirty) return
    // 已送出過回饋就不提醒
    if (alreadyFeedbackByInterviewId[interviewId]) return

    let already = !!recruiterDraftPromptedByInterviewId[interviewId]
    if (already) return

    // 輕提示一次（不追殺）
    setRecruiterFeedbackNudge({ open: true, interviewId })
    setRecruiterDraftPromptedByInterviewId(prev => ({ ...prev, [interviewId]: true }))
  }

  // 「未填回饋提醒」：不在展開瞬間跳，改成離開/切換時才提醒一次（避免擋住使用者）
  const maybeNudgeRecruiterFeedbackBeforeLeave = (
    interviewId: string | null | undefined,
    afterAction?: () => void
  ): boolean => {
    const id = String(interviewId || '')
    if (!id) return false
    if (alreadyFeedbackByInterviewId[id]) return false
    if (recruiterDraftPromptedByInterviewId[id]) return false
    setRecruiterFeedbackNudge({ open: true, interviewId: id })
    setRecruiterDraftPromptedByInterviewId(prev => ({ ...prev, [id]: true }))
    afterNudgeActionRef.current = afterAction || null
    return true
  }

  const closeNudgeAndProceed = () => {
    setRecruiterFeedbackNudge({ open: false, interviewId: null })
    const fn = afterNudgeActionRef.current
    afterNudgeActionRef.current = null
    try { fn?.() } catch { /* ignore */ }
  }

  // 攔截 Next.js 換頁（上一頁/下一頁、導頁），在離開前提醒一次
  useEffect(() => {
    const onRouteChangeStart = (url: string) => {
      const id = expandedIV
      if (!id) return
      const didNudge = maybeNudgeRecruiterFeedbackBeforeLeave(id, () => {
        try { void router.push(url) } catch { /* ignore */ }
      })
      if (didNudge) {
        router.events.emit('routeChangeError')
        // eslint-disable-next-line no-throw-literal
        throw 'Route change aborted by recruiter feedback nudge'
      }
    }
    router.events.on('routeChangeStart', onRouteChangeStart)
    return () => {
      router.events.off('routeChangeStart', onRouteChangeStart)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedIV, alreadyFeedbackByInterviewId, recruiterDraftPromptedByInterviewId])

  // 「點展開中的 <li> 以外」自動收合：用 document capture，避免被 stopPropagation 或容器範圍影響
  useEffect(() => {
    if (tab !== 'interviews') return
    if (!expandedIV) return

    const onPointerDownCapture = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (!target || !(target instanceof HTMLElement)) return

      // 點擊「展開/收合詳情」按鈕時，交給按鈕自己的切換邏輯（避免重複提示/互相打架）
      if (target.closest('[data-interview-toggle]')) {
        if (shouldDebugInterviewCollapse()) {
          // eslint-disable-next-line no-console
          console.log('[company/interviews] skip: clicked toggle', { expandedIV })
        }
        return
      }

      // 以 <li data-interview-id="..."> 作為一個面試 session 的界線
      const clickedLi = target.closest('li[data-interview-id]') as HTMLElement | null
      const clickedInterviewId = clickedLi?.dataset?.interviewId ?? null

      if (shouldDebugInterviewCollapse()) {
        // eslint-disable-next-line no-console
        console.log('[company/interviews] pointerdown(capture)', {
          expandedIV,
          clickedInterviewId,
          sameLi: clickedInterviewId === expandedIV,
          targetTag: target.tagName,
          targetText: (target as any)?.textContent?.slice?.(0, 80),
        })
      }

      // 點擊仍在展開中的那個 <li> 內 => 不收合
      if (clickedInterviewId === expandedIV) return

      const didNudge = maybeNudgeRecruiterFeedbackBeforeLeave(expandedIV, () => {
        setExpandedIV(null)
        setRecruiterFeedbackNudge({ open: false, interviewId: null })
      })

      if (shouldDebugInterviewCollapse()) {
        // eslint-disable-next-line no-console
        console.log('[company/interviews] collapse attempt', { expandedIV, didNudge })
      }

      if (didNudge) {
        event.preventDefault?.()
        event.stopPropagation?.()
        return
      }

      setExpandedIV(null)
      setRecruiterFeedbackNudge({ open: false, interviewId: null })
    }

    document.addEventListener('pointerdown', onPointerDownCapture, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDownCapture, true)
    }
  }, [tab, expandedIV])

  const requestTabChange = (nextTab: typeof tab) => {
    if (nextTab === tab) return
    if (expandedIV) {
      const didNudge = maybeNudgeRecruiterFeedbackBeforeLeave(expandedIV, () => setTab(nextTab))
      if (didNudge) return
    }
    setTab(nextTab)
  }

  // ================
  // Recruiter 教學（step5~9）
  // ================
  const closeTutorial = () => {
    setTutorial({ active: false, step: 0, companyId: null })
    clearTutorialState()
  }

  const advanceTutorial = (nextStep: number, patch?: Partial<RecruiterTutorialState>) => {
    setTutorial((prev) => {
      const next: RecruiterTutorialState = { ...prev, ...patch, active: true, step: nextStep }
      saveTutorialState(next)
      return next
    })
  }

  const isTutorialActive = tutorial.active && tutorial.step >= 5 && tutorial.step <= 10 && tutorial.companyId === companyId

  useEffect(() => {
    const saved = loadTutorialState()
    // 只在對應 companyId 才啟動教學；若帶錯公司，直接清掉避免卡住
    if (saved?.active && typeof saved.step === 'number' && saved.step >= 5) {
      if (saved.companyId && String(saved.companyId) === companyId) {
        setTutorial(saved)
      } else if (saved.companyId && companyId) {
        clearTutorialState()
        setTutorial({ active: false, step: 0, companyId: null })
      }
    }
  }, [companyId])

  // 自動切 tab（依 step）
  useEffect(() => {
    if (!isTutorialActive) return
    const desired: typeof tab =
      tutorial.step === 5 ? 'members'
      : tutorial.step === 6 ? 'jobs'
      : tutorial.step === 7 ? 'qbank'
      : tutorial.step === 8 ? 'joq'
      : tutorial.step === 9 ? 'joq'
      : 'interviews'
    if (tab !== desired) requestTabChange(desired)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTutorialActive, tutorial.step])

  // 教學狀態復原：重整/重啟後，依 step 把 UI 帶回「該 step 的標準起始狀態」
  useEffect(() => {
    if (!isTutorialActive) return
    if (tutorialHydratedStepRef.current === tutorial.step) return
    tutorialHydratedStepRef.current = tutorial.step

    // 讓每個 step 回到乾淨起始狀態，避免停在某個已展開的 form 擋住流程
    if (tutorial.step === 5) {
      setNewQB((p) => ({ ...p, showForm: false, questions: [], name: '', source: 'USER' }))
      setNewJOQ({ job_opening_id: '', question_bank_id: '', questions: [], showForm: false })
      return
    }
    if (tutorial.step === 6) {
      setNewQB((p) => ({ ...p, showForm: false, questions: [], name: '', source: 'USER' }))
      setNewJOQ({ job_opening_id: '', question_bank_id: '', questions: [], showForm: false })
      return
    }
    if (tutorial.step === 7) {
      // 共用題庫介紹：起始狀態不需要展開新增表單
      setNewQB((p) => ({ ...p, showForm: false, questions: [], name: '', source: 'USER' }))
      setNewJOQ({ job_opening_id: '', question_bank_id: '', questions: [], showForm: false })
      return
    }
    if (tutorial.step === 8) {
      // 職種個別題庫介紹：要聚焦「+ 新增職種個別題庫」按鈕，所以確保表單是收合狀態
      setNewJOQ({ job_opening_id: '', question_bank_id: '', questions: [], showForm: false })
      return
    }
    if (tutorial.step === 9) {
      // step9：聚焦輸入 form（確保表單是展開狀態）
      setNewJOQ((prev) => ({ ...prev, showForm: true, questions: prev.questions?.length ? prev.questions : [''] }))
      return
    }
    if (tutorial.step === 10) {
      return
    }
  }, [isTutorialActive, tutorial.step])

  const formatInterviewStatus = (status?: Interview['status']) => {
    if (status === 'waitToStart') return '等待開始'
    if (status === 'completed') return '已完成'
    if (status === 'lateButComplete') return '延遲但完成'
    if (status === 'noShow') return '未出席'
    if (status === 'cancelled') return '已取消'
    return status || '未知狀態'
  }

  const formatInterviewResult = (result?: 'hired' | 'rejected' | 'onHold' | 'cancelByUser' | null) => {
    if (result === 'hired') return '錄取'
    if (result === 'rejected') return '拒絕'
    if (result === 'onHold') return '保留觀察'
    if (result === 'cancelByUser') return '面試者提早結束'
    return '尚未評價'
  }

  const formatReviewType = (reviewType?: 'AI' | 'HUMAN' | 'MIXED' | null) => {
    if (reviewType === 'AI') return 'AI 評價'
    if (reviewType === 'HUMAN') return '人類評價'
    if (reviewType === 'MIXED') return '混合評價'
    return '未設定'
  }

  const formatDurationSeconds = (sec?: number | null) => {
    if (!sec || sec <= 0) return '—'
    const minutes = Math.floor(sec / 60)
    const seconds = sec % 60
    if (minutes === 0) return `${seconds} 秒`
    return `${minutes} 分 ${seconds} 秒`
  }

  const formatResultReason = (reason?: string | null) => {
    if (!reason) return '—'
    if (reason === 'passed threshold') return 'AI 評分通過門檻'
    if (reason === 'below threshold') return 'AI 評分低於門檻'
    if (reason === 'per_criteria_minimums/must_meet not satisfied') return '未達個別項目或必備條件'
    if (reason === 'cancelled_by_user') return '面試者提早結束（候選人主動結束面試）'
    return reason
  }

  const tabBtn = (k: typeof tab, label: string, tutorialId?: string) => (
    <button
      data-tutorial-id={tutorialId}
      onClick={() => requestTabChange(k)}
      style={{ padding: '8px 12px', borderBottom: tab === k ? '2px solid #111' : '2px solid transparent' }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ maxWidth: 1100, margin: '36px auto', padding: 24 }}>
      {isTutorialActive && (
        <GuidedOverlay
          open
          onClose={closeTutorial}
          targetId={
            tutorial.step === 5
              ? 'company_members_form'
              : tutorial.step === 6
                ? 'company_jobs_form'
                : tutorial.step === 9
                  ? 'company_joq_form'
                  : null
          }
          targetIds={
            tutorial.step === 7
              ? ['company_qbank_tab']
              : tutorial.step === 8
                ? ['company_joq_tab', 'company_joq_add_btn']
                : undefined
          }
          title="使用教學"
          message={
            tutorial.step === 5 ? (
              <div>成員頁面可以新增公司招募人員以及單獨的閱覽權限人員(需先註冊)</div>
            ) : tutorial.step === 6 ? (
              <div>
                在這邊新增要招募的職種，可設定平均及格線、單項及格線，新增評估項目以及評分規則。
                <br />
                請先建立一個職種以進行之後的使用說明。
              </div>
            ) : tutorial.step === 7 ? (
              <div>共用題庫是每一個職種都會詢問面試者的問題，比如公司相關的問題。</div>
            ) : tutorial.step === 8 ? (
              <div>職種個別題庫是每個要招募的職種所對應的題庫，並可以選擇該職種是否使用共用題庫。<br/>請按下新增職種個別題庫</div>
            ) : tutorial.step === 9 ? (
              <div>選擇您要建立題庫的職種，再輸入您的問題，並建立一個題庫。</div>
            ) : (
              <div>
                面試管理頁面用來管理面試日程以及檢視結果，評價方式若是人類評價，可在面試者完成面試後進行決定。使用說明到此為止。
              </div>
            )
          }
          actions={
            tutorial.step === 5
              ? [{ label: '下一步', variant: 'primary', onClick: () => advanceTutorial(6) }]
              : tutorial.step === 7
                ? [{ label: '下一步', variant: 'primary', onClick: () => advanceTutorial(8) }]
                : tutorial.step === 10
                  ? [{ label: '完成', variant: 'primary', onClick: closeTutorial }]
                  : []
          }
        />
      )}
      {recruiterFeedbackNudge.open && recruiterFeedbackNudge.interviewId && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeNudgeAndProceed}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            top:'5px',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(560px, 96vw)',
              background: '#fff',
              borderRadius: 12,
              boxShadow: '0 18px 60px rgba(0,0,0,0.25)',
              border: '1px solid rgba(0,0,0,0.08)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 800, fontSize: '1.05em' }}>使用者反饋</div>
              <button
                onClick={closeNudgeAndProceed}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: 18,
                  cursor: 'pointer',
                  padding: 6,
                  lineHeight: 1,
                  color: '#555',
                }}
                aria-label="關閉"
              >
                ✕
              </button>
            </div>
            <div style={{ padding: 18, color: '#222', lineHeight: 1.6 }}>
              為了提供更好的服務，希望能讓我們聆聽您寶貴的意見，填寫使用者反饋。
              <div style={{ marginTop: 10, fontSize: '0.9em', color: '#666' }}>
                提醒：反饋表單就在此面試詳情下方的「使用者反饋」區塊。
              </div>
            </div>
            <div style={{ padding: 18, borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={closeNudgeAndProceed}
                style={{
                  padding: '8px 12px',
                  background: '#f3f4f6',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                稍後
              </button>
              <button
                onClick={closeNudgeAndProceed}
                style={{
                  padding: '8px 12px',
                  background: '#1976D2',
                  color: 'white',
                  border: '1px solid #1976D2',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
      {companyName && (
        <h1 style={{ textAlign: 'center', fontSize: '2em', fontWeight: 'bold', marginBottom: 24 }}>
          {companyName}
        </h1>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid #e5e7eb' }}>
        {tabBtn('members', '成員')}
        {tabBtn('ai', 'AI面試官')}
        {tabBtn('jobs', '職種')}
          {tabBtn('qbank', '共用題庫', 'company_qbank_tab')}
        {tabBtn('joq', '職種個別題庫', 'company_joq_tab')}
        {tabBtn('interviews', '面試管理')}
        {tabBtn('resumeReview', '履歷審查')}
        </div>
        <button onClick={handleTokenRefresh} style={{ padding: '8px 16px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          刷新登入
        </button>
      </div>

      {tab === 'members' && (
        <div>
          <form
            data-tutorial-id="company_members_form"
            onSubmit={addMember}
            style={{ display: 'grid', gap: 12, padding: 12, border: '2px solid #000', background: '#e6f2ff', borderRadius: 8 }}
          >
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>成員 Email：</label>
              <input 
                placeholder="例如：member@example.com"
                value={newMemberEmail} 
                onChange={(e) => setNewMemberEmail(e.target.value)} 
                style={{ padding: 8, border: '2px solid #000', width: '100%' }} 
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>角色：</label>
              <select 
                value={newMemberRole} 
                onChange={(e) => setNewMemberRole(e.target.value as any)} 
                style={{ padding: 8, border: '2px solid #000', width: '100%' }}
              >
                <option value="recruiter">招募人員 (Recruiter)</option>
                <option value="viewer">檢視者 (Viewer)</option>
              </select>
            </div>
            <button type="submit" style={{ padding: '8px 12px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: 4 }}>新增成員</button>
          </form>
          <ul style={{ marginTop: 12 }}>
            {members.map((m) => (
              <li key={m.profile_id} style={{ padding: 8, border: '2px solid #000', background: '#e6f2ff', borderRadius: 6, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1 }}>{m.email || m.profile_id}</span>
                <select value={m.company_role} onChange={async (e) => {
                  await fetch('/api/company/members/update-role', { method: 'POST', headers: headers(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ company_id: companyId, profile_id: m.profile_id, company_role: e.target.value }) })
                  await loadMembers(token)
                }} style={{ padding: 6, border: '2px solid #000' }}>
                  <option value="admin">admin</option>
                  <option value="recruiter">recruiter</option>
                  <option value="viewer">viewer</option>
                </select>
                <button onClick={async () => { if (!confirm('確定要刪除嗎？')) return; await fetch('/api/company/members/remove', { method: 'POST', headers: headers(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ company_id: companyId, profile_id: m.profile_id }) }); await loadMembers(token) }} style={{ color: '#b00000' }}>刪除</button>
              </li>
            ))}
            {members.length === 0 && <div style={{ padding: 12, border: '2px dashed #000' }}>尚無成員</div>}
          </ul>
        </div>
      )}

      {tab === 'ai' && (
        <div>
          <form onSubmit={addAI} style={{ display: 'grid', gap: 12, padding: 12, border: '2px solid #000', background: '#e6f2ff', borderRadius: 8 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>AI 面試官名稱：</label>
              <input 
                placeholder="例如：Yuki"
                value={newAI.name} 
                onChange={(e) => setNewAI({ ...newAI, name: e.target.value })} 
                style={{ padding: 8, border: '2px solid #000', width: '100%' }} 
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>模型名稱：</label>
              <input 
                placeholder="例如：yuki.vrm"
                value={newAI.model_name} 
                onChange={(e) => setNewAI({ ...newAI, model_name: e.target.value })} 
                style={{ padding: 8, border: '2px solid #000', width: '100%' }} 
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>模型設定 (JSON，選填)：</label>
              <textarea 
                rows={3} 
                placeholder='例如：{"temperature": 0.7, "style": "professional"}' 
                value={newAI.model_config} 
                onChange={(e) => setNewAI({ ...newAI, model_config: e.target.value })} 
                style={{ padding: 8, border: '2px solid #000', width: '100%' }} 
              />
              <div style={{ fontSize: '0.8em', color: '#666', marginTop: 4 }}>留空會使用預設值：{}</div>
            </div>
            <button type="submit" style={{ padding: '8px 12px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: 4 }}>新增 AI 面試官</button>
          </form>
          <ul style={{ marginTop: 12 }}>
            {aiList.map((a) => (
              <li key={a.id} style={{ padding: 12, border: '2px solid #000', background: editingAI === a.id ? '#fff9e6' : '#e6f2ff', borderRadius: 6, marginBottom: 8 }}>
                {editingAI === a.id ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>AI 面試官名稱：</label>
                      <input 
                        value={editAI.name} 
                        onChange={(e) => setEditAI({ ...editAI, name: e.target.value })} 
                        style={{ padding: 8, border: '2px solid #000', width: '100%' }} 
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>模型名稱：</label>
                      <input 
                        value={editAI.model_name} 
                        onChange={(e) => setEditAI({ ...editAI, model_name: e.target.value })} 
                        style={{ padding: 8, border: '2px solid #000', width: '100%' }} 
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>模型設定 (JSON)：</label>
                      <textarea 
                        rows={3} 
                        value={editAI.model_config} 
                        onChange={(e) => setEditAI({ ...editAI, model_config: e.target.value })} 
                        style={{ padding: 8, border: '2px solid #000', width: '100%' }} 
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => updateAI(a.id)} style={{ padding: '6px 12px', background: '#4CAF50', color: 'white' }}>儲存</button>
                      <button onClick={() => setEditingAI(null)} style={{ padding: '6px 12px' }}>取消</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ flex: 1 }}>{a.name} / {a.model_name}</span>
                    <button onClick={() => startEditAI(a)} style={{ padding: '6px 12px', background: '#2196F3', color: 'white' }}>編輯</button>
                    <button onClick={() => deleteAI(a.id)} style={{ padding: '6px 12px', background: '#f44336', color: 'white' }}>刪除</button>
                  </div>
                )}
              </li>
            ))}
            {aiList.length === 0 && <div style={{ padding: 12, border: '2px dashed #000' }}>尚無 AI 面試官</div>}
          </ul>
        </div>
      )}

      {tab === 'jobs' && (
        <div>
          <form
            data-tutorial-id="company_jobs_form"
            onSubmit={addJob}
            style={{ display: 'grid', gap: 12, padding: 12, border: '2px solid #000', background: '#e6f2ff', borderRadius: 8 }}
          >
            <input placeholder="職種名稱" value={newJob.job_title} onChange={(e) => setNewJob({ ...newJob, job_title: e.target.value })} style={{ padding: 8, border: '2px solid #000' }} />
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>招募目標人數：</label>
              <input
                type="number"
                min="1"
                placeholder="請輸入招募目標人數"
                value={newJob.target_hires}
                onChange={(e) => setNewJob({ ...newJob, target_hires: Math.max(1, Number(e.target.value) || 1) })}
                style={{ padding: 8, border: '2px solid #000', width: '100%' }}
              />
            </div>

            <select value={newJob.result_notification_method} onChange={(e) => setNewJob({ ...newJob, result_notification_method: e.target.value as 'immediate' | 'later' })} style={{ padding: 8, border: '2px solid #000' }}>
              <option value="immediate">即時通知</option>
              <option value="later">後續通知</option>
            </select>
            
            {/* Evaluation Policy UI */}
            <div style={{ padding: 12, background: '#fff', borderRadius: 4, border: '1px solid #ccc' }}>
              <div style={{ marginBottom: 8, fontWeight: 'bold' }}>評分設定（選填）</div>
              
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4 }}>平均及格分數（0-100分）：</label>
                <input 
                  type="number" 
                  min="0" 
                  max="100" 
                  placeholder="例如：70"
                  value={newJob.evalPolicy.overall_threshold} 
                  onChange={(e) => setNewJob({ 
                    ...newJob, 
                    evalPolicy: { ...newJob.evalPolicy, overall_threshold: e.target.value } 
                  })} 
                  style={{ padding: 8, border: '2px solid #000', width: '100%' }} 
                />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: 8 }}>個別項目及格線：</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                  {Object.keys(criteriaNames).map((key) => {
                    const isActive = newJob.evalPolicy.active_criteria.includes(key)
                    return (
                      <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (isActive) {
                              setNewJob({
                                ...newJob,
                                evalPolicy: {
                                  ...newJob.evalPolicy,
                                  active_criteria: newJob.evalPolicy.active_criteria.filter(k => k !== key),
                                  criteria_minimums: { ...newJob.evalPolicy.criteria_minimums, [key]: '' }
                                }
                              })
                            } else {
                              setNewJob({
                                ...newJob,
                                evalPolicy: {
                                  ...newJob.evalPolicy,
                                  active_criteria: [...newJob.evalPolicy.active_criteria, key],
                                  criteria_minimums: { ...newJob.evalPolicy.criteria_minimums, [key]: '' }
                                }
                              })
                            }
                          }}
                          style={{
                            padding: '6px 12px',
                            background: isActive ? '#4CAF50' : '#e0e0e0',
                            color: isActive ? 'white' : '#333',
                            border: 'none',
                            borderRadius: 4,
                            cursor: 'pointer'
                          }}
                        >
                          {criteriaNames[key]}
                        </button>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          placeholder={`例如：60（留空代表不啟用）`}
                          value={newJob.evalPolicy.criteria_minimums[key] || ''}
                          onChange={(e) => {
                            const nextValue = e.target.value
                            setNewJob({
                              ...newJob,
                              evalPolicy: {
                                ...newJob.evalPolicy,
                                // 直接輸入時自動視為啟用該項
                                active_criteria: newJob.evalPolicy.active_criteria.includes(key)
                                  ? newJob.evalPolicy.active_criteria
                                  : [...newJob.evalPolicy.active_criteria, key],
                                criteria_minimums: { ...newJob.evalPolicy.criteria_minimums, [key]: nextValue }
                              }
                            })
                          }}
                          style={{
                            padding: 6,
                            border: '1px solid #ccc',
                            borderRadius: 4,
                            opacity: isActive ? 1 : 0.7
                          }}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 自訂評估項目 */}
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #ddd' }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                  <input 
                    type="checkbox" 
                    checked={newJob.enableCustomCriteria} 
                    onChange={(e) => setNewJob({ ...newJob, enableCustomCriteria: e.target.checked })} 
                  />
                  <span style={{ fontWeight: 'bold' }}>啟用自訂評估項目</span>
                </label>
                
                {newJob.enableCustomCriteria && (
                  <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
                    <div style={{ marginBottom: 8, fontSize: '0.9em', color: '#666' }}>
                      所有項目比重總和需為 1.0（目前總和：{newJob.customCriteria.reduce((sum, c) => sum + c.weight, 0).toFixed(2)}）
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#ddd' }}>
                          <th style={{ padding: 8, textAlign: 'left' }}>Key (英文)</th>
                          <th style={{ padding: 8, textAlign: 'left' }}>Display Name (中文)</th>
                          <th style={{ padding: 8, textAlign: 'left' }}>比重 (0-1)</th>
                          <th style={{ padding: 8, textAlign: 'left' }}>Max Score</th>
                          <th style={{ padding: 8, textAlign: 'center' }}>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {newJob.customCriteria.map((criteria, idx) => (
                          <React.Fragment key={idx}>
                            <tr>
                              <td style={{ padding: 6 }}>
                                <input
                                  type="text"
                                  value={criteria.key}
                                  onChange={(e) => {
                                    const updated = [...newJob.customCriteria]
                                    updated[idx] = { ...criteria, key: e.target.value }
                                    setNewJob({ ...newJob, customCriteria: updated })
                                  }}
                                  style={{ padding: 4, border: '1px solid #ccc', borderRadius: 2, width: '100%' }}
                                />
                              </td>
                              <td style={{ padding: 6 }}>
                                <input
                                  type="text"
                                  value={criteria.display_name}
                                  onChange={(e) => {
                                    const updated = [...newJob.customCriteria]
                                    updated[idx] = { ...criteria, display_name: e.target.value }
                                    setNewJob({ ...newJob, customCriteria: updated })
                                  }}
                                  style={{ padding: 4, border: '1px solid #ccc', borderRadius: 2, width: '100%' }}
                                />
                              </td>
                              <td style={{ padding: 6 }}>
                                <input
                                  type="number"
                                  min="0"
                                  max="1"
                                  step="0.01"
                                  value={criteria.weight}
                                  onChange={(e) => {
                                    const updated = [...newJob.customCriteria]
                                    updated[idx] = { ...criteria, weight: parseFloat(e.target.value) || 0 }
                                    setNewJob({ ...newJob, customCriteria: updated })
                                  }}
                                  style={{ padding: 4, border: '1px solid #ccc', borderRadius: 2, width: '100%' }}
                                />
                              </td>
                              <td style={{ padding: 6 }}>
                                <input
                                  type="number"
                                  min="1"
                                  value={10}
                                  disabled
                                  style={{ padding: 4, border: '1px solid #ccc', borderRadius: 2, width: '80px' }}
                                />
                              </td>
                              <td style={{ padding: 6, textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = newJob.customCriteria.filter((_, i) => i !== idx)
                                    setNewJob({ ...newJob, customCriteria: updated })
                                  }}
                                  style={{ padding: '4px 8px', background: '#f44336', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                                >
                                  刪除
                                </button>
                              </td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #ccc' }}>
                              <td colSpan={5} style={{ padding: 6 }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: '150px' }}>
                                      <label style={{ fontSize: '0.9em', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                      計算邏輯
                                    </label>
                                    <select
                                      value={criteria.scoring_logic || 'composite'}
                                      onChange={(e) => {
                                        const newLogic = e.target.value as 'addition' | 'deduction' | 'composite'
                                        const updated = [...newJob.customCriteria]
                                        updated[idx] = { 
                                          ...criteria, 
                                          scoring_logic: newLogic,
                                          // 切換時依邏輯清空/保留規則：
                                          // - addition: 只需要加分規則，扣分規則清空
                                          // - deduction: 只需要扣分規則，加分規則清空
                                          // - composite: 兩者都需要，保留既有內容
                                          addition_rules: newLogic === 'deduction' ? '' : (criteria.addition_rules || ''),
                                          deduction_rules: newLogic === 'addition' ? '' : (criteria.deduction_rules || '')
                                        }
                                        setNewJob({ ...newJob, customCriteria: updated })
                                      }}
                                      style={{ padding: 4, border: '1px solid #ccc', borderRadius: 2, width: '100%' }}
                                    >
                                      <option value="deduction">扣分制</option>
                                      <option value="addition">加分制</option>
                                      <option value="composite">綜合制</option>
                                    </select>
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', textAlign: 'center', marginBottom: 4, fontSize: '0.9em', fontWeight: 'bold' }}>
                                      加分邏輯 {(criteria.scoring_logic === 'addition' || criteria.scoring_logic === 'composite') && '(必填)'}
                                    </label>
                                    <textarea
                                      value={criteria.addition_rules || ''}
                                      onChange={(e) => {
                                        const updated = [...newJob.customCriteria]
                                        updated[idx] = { ...criteria, addition_rules: e.target.value }
                                        setNewJob({ ...newJob, customCriteria: updated })
                                        // 自動調整高度
                                        e.target.style.height = 'auto'
                                        e.target.style.height = `${e.target.scrollHeight}px`
                                      }}
                                      onInput={(e) => {
                                        // 確保每次輸入都調整高度
                                        const target = e.target as HTMLTextAreaElement
                                        target.style.height = 'auto'
                                        target.style.height = `${target.scrollHeight}px`
                                      }}
                                      ref={(textarea) => {
                                        if (textarea) {
                                          // 初始調整高度
                                          textarea.style.height = 'auto'
                                          textarea.style.height = `${textarea.scrollHeight}px`
                                        }
                                      }}
                                      disabled={criteria.scoring_logic === 'deduction'}
                                      placeholder={
                                        criteria.scoring_logic === 'addition' || criteria.scoring_logic === 'composite'
                                          ? '例如：正確回答專業問題+2.5分'
                                          : '加分制或綜合制時才需填寫'
                                      }
                                      style={{ 
                                        width: '100%', 
                                        padding: 4, 
                                        border: '1px solid #ccc', 
                                        borderRadius: 2,
                                        minHeight: '60px',
                                        resize: 'none',
                                        overflow: 'hidden',
                                        opacity: criteria.scoring_logic === 'deduction' ? 0.5 : 1
                                      }}
                                    />
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', textAlign: 'center', marginBottom: 4, fontSize: '0.9em', fontWeight: 'bold' }}>
                                      減分邏輯 {(criteria.scoring_logic === 'deduction' || criteria.scoring_logic === 'composite') && '(必填)'}
                                    </label>
                                    <textarea
                                      value={criteria.deduction_rules || ''}
                                      onChange={(e) => {
                                        const updated = [...newJob.customCriteria]
                                        updated[idx] = { ...criteria, deduction_rules: e.target.value }
                                        setNewJob({ ...newJob, customCriteria: updated })
                                        // 自動調整高度
                                        e.target.style.height = 'auto'
                                        e.target.style.height = `${e.target.scrollHeight}px`
                                      }}
                                      onInput={(e) => {
                                        // 確保每次輸入都調整高度
                                        const target = e.target as HTMLTextAreaElement
                                        target.style.height = 'auto'
                                        target.style.height = `${target.scrollHeight}px`
                                      }}
                                      ref={(textarea) => {
                                        if (textarea) {
                                          // 初始調整高度
                                          textarea.style.height = 'auto'
                                          textarea.style.height = `${textarea.scrollHeight}px`
                                        }
                                      }}
                                      disabled={criteria.scoring_logic === 'addition'}
                                      placeholder={
                                        criteria.scoring_logic === 'deduction' || criteria.scoring_logic === 'composite'
                                          ? '例如：答非所問-2分'
                                          : '扣分制或綜合制時才需填寫'
                                      }
                                      style={{ 
                                        width: '100%', 
                                        padding: 4, 
                                        border: '1px solid #ccc', 
                                        borderRadius: 2,
                                        minHeight: '60px',
                                        resize: 'none',
                                        overflow: 'hidden',
                                        opacity: criteria.scoring_logic === 'addition' ? 0.5 : 1
                                      }}
                                    />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                    <button
                      type="button"
                      onClick={() => {
                        setNewJob({ 
                          ...newJob, 
                          customCriteria: [...newJob.customCriteria, { 
                            key: '', 
                            display_name: '', 
                            weight: 0, 
                            max_score: 10,
                            scoring_logic: 'deduction' as const,
                            addition_rules: '',
                            deduction_rules: ''
                          }] 
                        })
                      }}
                      style={{ marginTop: 8, padding: '6px 12px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                    >
                      + 新增項目
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            <button type="submit" style={{ padding: '8px 12px' }}>新增職種</button>
          </form>
          <ul style={{ marginTop: 12 }}>
            {jobs.map((j) => (
              <li key={j.id} style={{ padding: 12, border: '2px solid #000', background: editingJob === j.id ? '#fff9e6' : '#e6f2ff', borderRadius: 6, marginBottom: 8 }}>
                {editingJob === j.id ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <input value={editJob.job_title} onChange={(e) => setEditJob({ ...editJob, job_title: e.target.value })} style={{ padding: 8, border: '2px solid #000' }} />
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>招募目標人數：</label>
                      <input
                        type="number"
                        min="1"
                        value={editJob.target_hires}
                        onChange={(e) => setEditJob({ ...editJob, target_hires: Math.max(1, Number(e.target.value) || 1) })}
                        style={{ padding: 8, border: '2px solid #000', width: '100%' }}
                      />
                    </div>
                    <select value={editJob.result_notification_method} onChange={(e) => setEditJob({ ...editJob, result_notification_method: e.target.value as 'immediate' | 'later' })} style={{ padding: 8, border: '2px solid #000' }}>
                      <option value="immediate">即時通知</option>
                      <option value="later">後續通知</option>
                    </select>
                    
                    {/* Evaluation Policy UI */}
                    <div style={{ padding: 12, background: '#fff', borderRadius: 4, border: '1px solid #ccc' }}>
                      <div style={{ marginBottom: 8, fontWeight: 'bold' }}>評分設定（選填）</div>
                      
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ display: 'block', marginBottom: 4 }}>平均及格分數（0-100分）：</label>
                        <input 
                          type="number" 
                          min="0" 
                          max="100" 
                          placeholder="例如：70"
                          value={editJob.evalPolicy.overall_threshold} 
                          onChange={(e) => setEditJob({ 
                            ...editJob, 
                            evalPolicy: { ...editJob.evalPolicy, overall_threshold: e.target.value } 
                          })} 
                          style={{ padding: 8, border: '2px solid #000', width: '100%' }} 
                        />
                      </div>
                      
                      <div>
                        <label style={{ display: 'block', marginBottom: 8 }}>個別項目及格線：</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                          {Object.keys(criteriaNames).map((key) => {
                            const isActive = editJob.evalPolicy.active_criteria.includes(key)
                            return (
                              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isActive) {
                                      setEditJob({
                                        ...editJob,
                                        evalPolicy: {
                                          ...editJob.evalPolicy,
                                          active_criteria: editJob.evalPolicy.active_criteria.filter(k => k !== key),
                                          criteria_minimums: { ...editJob.evalPolicy.criteria_minimums, [key]: '' }
                                        }
                                      })
                                    } else {
                                      setEditJob({
                                        ...editJob,
                                        evalPolicy: {
                                          ...editJob.evalPolicy,
                                          active_criteria: [...editJob.evalPolicy.active_criteria, key],
                                          criteria_minimums: { ...editJob.evalPolicy.criteria_minimums, [key]: '' }
                                        }
                                      })
                                    }
                                  }}
                                  style={{
                                    padding: '6px 12px',
                                    background: isActive ? '#4CAF50' : '#e0e0e0',
                                    color: isActive ? 'white' : '#333',
                                    border: 'none',
                                    borderRadius: 4,
                                    cursor: 'pointer'
                                  }}
                                >
                                  {criteriaNames[key]}
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  placeholder={`例如：60（留空代表不啟用）`}
                                  value={editJob.evalPolicy.criteria_minimums[key] || ''}
                                  onChange={(e) => {
                                    const nextValue = e.target.value
                                    setEditJob({
                                      ...editJob,
                                      evalPolicy: {
                                        ...editJob.evalPolicy,
                                        active_criteria: editJob.evalPolicy.active_criteria.includes(key)
                                          ? editJob.evalPolicy.active_criteria
                                          : [...editJob.evalPolicy.active_criteria, key],
                                        criteria_minimums: { ...editJob.evalPolicy.criteria_minimums, [key]: nextValue }
                                      }
                                    })
                                  }}
                                  style={{
                                    padding: 6,
                                    border: '1px solid #ccc',
                                    borderRadius: 4,
                                    opacity: isActive ? 1 : 0.7
                                  }}
                                />
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    {/* 自訂評估項目 */}
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #ddd' }}>
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                        <input 
                          type="checkbox" 
                          checked={editJob.enableCustomCriteria} 
                          onChange={(e) => {
                            const isChecked = e.target.checked
                            // 如果啟用且目前沒有評估項目，則填入預設的五個項目
                            if (isChecked && editJob.customCriteria.length === 0) {
                              setEditJob({ 
                                ...editJob, 
                                enableCustomCriteria: true,
                                customCriteria: [
                                  { key: 'content_integrity', display_name: '內容完整性', weight: 0.2, max_score: 10, scoring_logic: 'composite' as const, deduction_rules: '答非所問-1.5分\n回答不完整或缺少關鍵資訊-1分', addition_rules: '切題且至少回答問題核心+0.5分\n提供具體例子/步驟/數據+1分' },
                                  { key: 'logical_clarity', display_name: '邏輯清晰度', weight: 0.2, max_score: 10, scoring_logic: 'composite' as const, deduction_rules: '條理不清-1分\n自相矛盾或邏輯錯誤-1.5分', addition_rules: '回答有結構（先結論後理由）+0.5分\n前後一致、因果清楚+1分' },
                                  { key: 'professional_depth', display_name: '專業深度', weight: 0.2, max_score: 10, scoring_logic: 'composite' as const, deduction_rules: '專業知識明顯錯誤-1.5分\n無法舉出實務案例或只背誦定義-1分', addition_rules: '使用正確基本概念/術語+0.5分\n能解釋trade-off或提出實務案例+2分\n展現深度理解（拆解原因/限制）+1分' },
                                  { key: 'communication', display_name: '溝通能力', weight: 0.2, max_score: 10, scoring_logic: 'composite' as const, deduction_rules: '表達不清晰-1分\n表達不流暢或跳躍導致難以理解-1分', addition_rules: '表達清楚、重點明確+0.5分\n主動釐清前提/確認需求/條列化表達+1分' },
                                  { key: 'personal_attributes', display_name: '個人特質', weight: 0.2, max_score: 10, scoring_logic: 'composite' as const, deduction_rules: '缺乏企圖心與主動性-1.5分\n對學習成長明顯消極-1分\n團隊合作態度不佳或推責-1.5分\n抗壓與面對挫折態度消極-1分', addition_rules: '展現正常職場合作/學習態度+0.5分\n向上心求知慾（具體例子）+1.5分\n持續學習（具體做法）+1.5分\n抗壓與面對挫折成熟+1.5分\n主動性/負責任態度+1.5分' }
                                ]
                              })
                            } else {
                              setEditJob({ ...editJob, enableCustomCriteria: isChecked })
                            }
                          }} 
                        />
                        <span style={{ fontWeight: 'bold' }}>啟用自訂評估項目</span>
                      </label>
                      
                      {editJob.enableCustomCriteria && (
                        <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
                          <div style={{ marginBottom: 8, fontSize: '0.9em', color: '#666' }}>
                            所有項目比重總和需為 1.0（目前總和：{editJob.customCriteria.reduce((sum, c) => sum + c.weight, 0).toFixed(2)}）
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ background: '#ddd' }}>
                                <th style={{ padding: 8, textAlign: 'left' }}>Key (英文)</th>
                                <th style={{ padding: 8, textAlign: 'left' }}>Display Name (中文)</th>
                                <th style={{ padding: 8, textAlign: 'left' }}>比重 (0-1)</th>
                                <th style={{ padding: 8, textAlign: 'left' }}>Max Score</th>
                                <th style={{ padding: 8, textAlign: 'center' }}>操作</th>
                              </tr>
                            </thead>
                            <tbody>
                              {editJob.customCriteria.map((criteria, idx) => (
                                <React.Fragment key={criteria.id || idx}>
                                  <tr>
                                    <td style={{ padding: 6 }}>
                                      <input
                                        type="text"
                                        value={criteria.key}
                                        onChange={(e) => {
                                          const updated = [...editJob.customCriteria]
                                          updated[idx] = { ...criteria, key: e.target.value }
                                          setEditJob({ ...editJob, customCriteria: updated })
                                        }}
                                        style={{ padding: 4, border: '1px solid #ccc', borderRadius: 2, width: '100%' }}
                                      />
                                    </td>
                                    <td style={{ padding: 6 }}>
                                      <input
                                        type="text"
                                        value={criteria.display_name}
                                        onChange={(e) => {
                                          const updated = [...editJob.customCriteria]
                                          updated[idx] = { ...criteria, display_name: e.target.value }
                                          setEditJob({ ...editJob, customCriteria: updated })
                                        }}
                                        style={{ padding: 4, border: '1px solid #ccc', borderRadius: 2, width: '100%' }}
                                      />
                                    </td>
                                    <td style={{ padding: 6 }}>
                                      <input
                                        type="number"
                                        min="0"
                                        max="1"
                                        step="0.01"
                                        value={criteria.weight}
                                        onChange={(e) => {
                                          const updated = [...editJob.customCriteria]
                                          updated[idx] = { ...criteria, weight: parseFloat(e.target.value) || 0 }
                                          setEditJob({ ...editJob, customCriteria: updated })
                                        }}
                                        style={{ padding: 4, border: '1px solid #ccc', borderRadius: 2, width: '100%' }}
                                      />
                                    </td>
                                    <td style={{ padding: 6 }}>
                                      <input
                                        type="number"
                                        min="1"
                                        value={10}
                                        disabled
                                        style={{ padding: 4, border: '1px solid #ccc', borderRadius: 2, width: '80px' }}
                                      />
                                    </td>
                                    <td style={{ padding: 6, textAlign: 'center' }}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = editJob.customCriteria.filter((_, i) => i !== idx)
                                          setEditJob({ ...editJob, customCriteria: updated })
                                        }}
                                        style={{ padding: '4px 8px', background: '#f44336', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                                      >
                                        刪除
                                      </button>
                                    </td>
                                  </tr>
                                  <tr style={{ borderBottom: '1px solid #ccc' }}>
                                    <td colSpan={5} style={{ padding: 6 }}>
                                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: '150px' }}>
                                          <label style={{ fontSize: '0.9em', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                            計算邏輯
                                          </label>
                                          <select
                                            value={criteria.scoring_logic || 'composite'}
                                            onChange={(e) => {
                                              const newLogic = e.target.value as 'addition' | 'deduction' | 'composite'
                                              const updated = [...editJob.customCriteria]
                                              updated[idx] = { 
                                                ...criteria, 
                                                scoring_logic: newLogic,
                                                // 與新增職種時相同的邏輯：
                                                // - addition: 只保留加分規則
                                                // - deduction: 只保留扣分規則
                                                // - composite: 同時保留兩者
                                                addition_rules: newLogic === 'deduction' ? '' : (criteria.addition_rules || ''),
                                                deduction_rules: newLogic === 'addition' ? '' : (criteria.deduction_rules || '')
                                              }
                                              setEditJob({ ...editJob, customCriteria: updated })
                                            }}
                                            style={{ padding: 4, border: '1px solid #ccc', borderRadius: 2, width: '100%' }}
                                          >
                                            <option value="deduction">扣分制</option>
                                            <option value="addition">加分制</option>
                                            <option value="composite">綜合制</option>
                                          </select>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                          <label style={{ display: 'block', textAlign: 'center', marginBottom: 4, fontSize: '0.9em', fontWeight: 'bold' }}>
                                            加分邏輯 {criteria.scoring_logic === 'addition' && '(必填)'}
                                          </label>
                                          <textarea
                                            value={criteria.addition_rules || ''}
                                            onChange={(e) => {
                                              const updated = [...editJob.customCriteria]
                                              updated[idx] = { ...criteria, addition_rules: e.target.value }
                                              setEditJob({ ...editJob, customCriteria: updated })
                                              e.target.style.height = 'auto'
                                              e.target.style.height = `${e.target.scrollHeight}px`
                                            }}
                                            onInput={(e) => {
                                              const target = e.target as HTMLTextAreaElement
                                              target.style.height = 'auto'
                                              target.style.height = `${target.scrollHeight}px`
                                            }}
                                            disabled={criteria.scoring_logic === 'deduction'}
                                            placeholder={criteria.scoring_logic === 'addition' ? '例如：正確回答專業問題+2.5分' : '加分制時才需填寫'}
                                            style={{ 
                                              width: '100%', 
                                              padding: 4, 
                                              border: '1px solid #ccc', 
                                              borderRadius: 2,
                                              minHeight: '60px',
                                              resize: 'none',
                                              overflow: 'hidden',
                                              opacity: criteria.scoring_logic === 'deduction' ? 0.5 : 1
                                            }}
                                          />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                          <label style={{ display: 'block', textAlign: 'center', marginBottom: 4, fontSize: '0.9em', fontWeight: 'bold' }}>
                                            扣分邏輯 {criteria.scoring_logic === 'deduction' && '(必填)'}
                                          </label>
                                          <textarea
                                            value={criteria.deduction_rules || ''}
                                            onChange={(e) => {
                                              const updated = [...editJob.customCriteria]
                                              updated[idx] = { ...criteria, deduction_rules: e.target.value }
                                              setEditJob({ ...editJob, customCriteria: updated })
                                              e.target.style.height = 'auto'
                                              e.target.style.height = `${e.target.scrollHeight}px`
                                            }}
                                            onInput={(e) => {
                                              const target = e.target as HTMLTextAreaElement
                                              target.style.height = 'auto'
                                              target.style.height = `${target.scrollHeight}px`
                                            }}
                                            disabled={criteria.scoring_logic === 'addition'}
                                            placeholder={criteria.scoring_logic === 'deduction' ? '例如：答非所問-2分' : '扣分制時才需填寫'}
                                            style={{ 
                                              width: '100%', 
                                              padding: 4, 
                                              border: '1px solid #ccc', 
                                              borderRadius: 2,
                                              minHeight: '60px',
                                              resize: 'none',
                                              overflow: 'hidden',
                                              opacity: criteria.scoring_logic === 'addition' ? 0.5 : 1
                                            }}
                                          />
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                </React.Fragment>
                              ))}
                            </tbody>
                          </table>
                          <button
                            type="button"
                            onClick={() => {
                              setEditJob({ 
                                ...editJob, 
                                customCriteria: [...editJob.customCriteria, { 
                                  key: '', 
                                  display_name: '', 
                                  weight: 0, 
                                  max_score: 10,
                                  scoring_logic: 'deduction' as const,
                                  addition_rules: '',
                                  deduction_rules: ''
                                }] 
                              })
                            }}
                            style={{ marginTop: 8, padding: '6px 12px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                          >
                            + 新增項目
                          </button>
                        </div>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => updateJob(j.id)} style={{ padding: '6px 12px', background: '#4CAF50', color: 'white' }}>儲存</button>
                      <button onClick={() => setEditingJob(null)} style={{ padding: '6px 12px' }}>取消</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold' }}>{j.job_title}</div>
                      <div style={{ fontSize: '0.9em', color: '#666' }}>AI問題: {j.use_ai_generate_question ? '是' : '否'} / 通知: {j.result_notification_method === 'immediate' ? '即時通知' : j.result_notification_method === 'later' ? '後續通知' : j.result_notification_method}</div>
                      <div style={{ fontSize: '0.9em', color: '#111' }}>錄取進度：{j.hired_count || 0} / {j.target_hires || 1}</div>
                    </div>
                    <button onClick={() => startEditJob(j)} style={{ padding: '6px 12px', background: '#2196F3', color: 'white' }}>編輯</button>
                    <button onClick={() => deleteJob(j.id)} style={{ padding: '6px 12px', background: '#f44336', color: 'white' }}>刪除</button>
                  </div>
                )}
              </li>
            ))}
            {jobs.length === 0 && <div style={{ padding: 12, border: '2px dashed #000' }}>尚無職缺</div>}
          </ul>
        </div>
      )}

      {tab === 'qbank' && (
        <div>
          {!newQB.showForm ? (
            <button 
              onClick={() => setNewQB({ ...newQB, showForm: true, questions: [''] })} 
              style={{ padding: '10px 16px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', marginBottom: 12 }}
            >
              + 新增共用題庫
            </button>
          ) : (
            <form onSubmit={addQB} style={{ display: 'grid', gap: 12, padding: 12, border: '2px solid #000', background: '#e6f2ff', borderRadius: 8 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>題庫名稱：</label>
                <input 
                  placeholder="例如：技術面試題庫"
                  value={newQB.name} 
                  onChange={(e) => setNewQB({ ...newQB, name: e.target.value })} 
                  style={{ padding: 8, border: '2px solid #000', width: '100%' }} 
                />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>題目生成方式：</label>
                <select 
                  value={newQB.source} 
                  onChange={(e) => setNewQB({ ...newQB, source: e.target.value as any })} 
                  style={{ padding: 8, border: '2px solid #000', width: '100%' }}
                >
                  <option value="USER">使用者手動建立</option>
                  <option value="AI">AI 生成</option>
                </select>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontWeight: 'bold' }}>問題列表：</label>
                  <button
                    type="button"
                    onClick={() => setNewQB({ ...newQB, questions: [...newQB.questions, ''] })}
                    style={{ padding: '4px 8px', background: '#2196F3', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                  >
                    + 新增問題
                  </button>
                </div>
                {newQB.questions.map((question, idx) => (
                  <div key={idx} style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: '0.9em' }}>問題 {idx + 1}：</label>
                      <textarea
                        rows={2}
                        placeholder={`請輸入問題 ${idx + 1} 的內容`}
                        value={question}
                        onChange={(e) => {
                          const updated = [...newQB.questions]
                          updated[idx] = e.target.value
                          setNewQB({ ...newQB, questions: updated })
                        }}
                        style={{ padding: 8, border: '2px solid #000', width: '100%' }}
                      />
                    </div>
                    {newQB.questions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = newQB.questions.filter((_, i) => i !== idx)
                          setNewQB({ ...newQB, questions: updated })
                        }}
                        style={{ padding: '8px 12px', background: '#f44336', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', alignSelf: 'flex-end' }}
                      >
                        刪除
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" style={{ padding: '8px 16px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: 4 }}>建立題庫</button>
                <button 
                  type="button"
                  onClick={() => setNewQB({ name: '', source: 'USER', questions: [], showForm: false })} 
                  style={{ padding: '8px 16px', background: '#999', color: 'white', border: 'none', borderRadius: 4 }}
                >
                  取消
                </button>
              </div>
            </form>
          )}
          <ul style={{ marginTop: 12 }}>
            {qb.map((q) => (
              <li key={q.id} style={{ padding: 12, border: '2px solid #000', background: editingQB === q.id ? '#fff9e6' : '#e6f2ff', borderRadius: 6, marginBottom: 8 }}>
                {editingQB === q.id ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>題庫名稱：</label>
                      <input 
                        value={editQB.name} 
                        onChange={(e) => setEditQB({ ...editQB, name: e.target.value })} 
                        style={{ padding: 8, border: '2px solid #000', width: '100%' }} 
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>題目生成方式：</label>
                      <select 
                        value={editQB.source} 
                        onChange={(e) => setEditQB({ ...editQB, source: e.target.value as 'AI' | 'USER' })} 
                        style={{ padding: 8, border: '2px solid #000', width: '100%' }}
                      >
                        <option value="USER">使用者手動建立</option>
                        <option value="AI">AI 生成</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <label style={{ fontWeight: 'bold' }}>問題列表：</label>
                        <button
                          type="button"
                          onClick={() => setEditQB({ ...editQB, questions: [...editQB.questions, ''] })}
                          style={{ padding: '4px 8px', background: '#2196F3', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                        >
                          + 新增問題
                        </button>
                      </div>
                      {editQB.questions.map((question, idx) => (
                        <div key={idx} style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.9em' }}>問題 {idx + 1}：</label>
                            <textarea
                              rows={2}
                              value={question}
                              onChange={(e) => {
                                const updated = [...editQB.questions]
                                updated[idx] = e.target.value
                                setEditQB({ ...editQB, questions: updated })
                              }}
                              style={{ padding: 8, border: '2px solid #000', width: '100%' }}
                            />
                          </div>
                          {editQB.questions.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = editQB.questions.filter((_, i) => i !== idx)
                                setEditQB({ ...editQB, questions: updated })
                              }}
                              style={{ padding: '8px 12px', background: '#f44336', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', alignSelf: 'flex-end' }}
                            >
                              刪除
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => updateQB(q.id)} style={{ padding: '6px 12px', background: '#4CAF50', color: 'white' }}>儲存</button>
                      <button onClick={() => setEditingQB(null)} style={{ padding: '6px 12px' }}>取消</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold' }}>{q.name || '(noname)'}</div>
                      <div style={{ fontSize: '0.9em', color: '#666' }}>來源: {q.source === 'AI' ? 'AI 生成' : q.source === 'USER' ? '使用者手動建立' : q.source}</div>
                    </div>
                    <button onClick={() => startEditQB(q)} style={{ padding: '6px 12px', background: '#2196F3', color: 'white' }}>編輯</button>
                    <button onClick={() => deleteQB(q.id)} style={{ padding: '6px 12px', background: '#f44336', color: 'white' }}>刪除</button>
                  </div>
                )}
              </li>
            ))}
            {qb.length === 0 && <div style={{ padding: 12, border: '2px dashed #000' }}>尚無題庫</div>}
          </ul>
        </div>
      )}

      {tab === 'joq' && (
        <div>
          {jobs.length === 0 ? (
            <div style={{ padding: 24, border: '2px dashed #f44336', background: '#ffebee', borderRadius: 8, textAlign: 'center' }}>
              <strong style={{ color: '#f44336' }}>請先創建職種再添加職種個別題庫</strong>
            </div>
          ) : (
            <>
          {!newJOQ.showForm ? (
            <button 
              data-tutorial-id="company_joq_add_btn"
              onClick={() => {
                setNewJOQ({ ...newJOQ, showForm: true, questions: [''] })
                if (isTutorialActive && tutorial.step === 8) {
                  advanceTutorial(9)
                }
              }}
              style={{ padding: '10px 16px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', marginBottom: 12 }}
            >
              + 新增職種個別題庫
            </button>
          ) : (
          <form
            data-tutorial-id="company_joq_form"
            onSubmit={addJOQ}
            style={{ display: 'grid', gap: 12, padding: 12, border: '2px solid #000', background: '#e6f2ff', borderRadius: 8 }}
          >
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>選擇職種：</label>
              <select 
                value={newJOQ.job_opening_id} 
                onChange={(e) => setNewJOQ({ ...newJOQ, job_opening_id: e.target.value })} 
                style={{ padding: 8, border: '2px solid #000', width: '100%' }}
              >
                <option value="">-- 請選擇職種 --</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>{j.job_title}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>選擇共用題庫（選填）：</label>
              <select 
                value={newJOQ.question_bank_id} 
                onChange={(e) => setNewJOQ({ ...newJOQ, question_bank_id: e.target.value })} 
                style={{ padding: 8, border: '2px solid #000', width: '100%' }}
              >
                <option value="">-- 不使用共用題庫 --</option>
                {qb.map((q) => (
                  <option key={q.id} value={q.id}>{q.name || '(noname)'}</option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontWeight: 'bold' }}>問題列表：</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setNewJOQ({ ...newJOQ, questions: [...newJOQ.questions, ''] })}
                    style={{ padding: '4px 8px', background: '#2196F3', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                  >
                    + 新增問題
                  </button>
                  <button
                    type="button"
                    disabled={isGeneratingJOQAI}
                    onClick={() => generateJOQQuestionsWithAI('new')}
                    style={{ padding: '4px 8px', background: isGeneratingJOQAI ? '#9e9e9e' : '#673ab7', color: 'white', border: 'none', borderRadius: 4, cursor: isGeneratingJOQAI ? 'not-allowed' : 'pointer' }}
                  >
                    {isGeneratingJOQAI ? 'AI 生成中…' : 'AI 生成問題'}
                  </button>
                </div>
              </div>
              {newJOQ.questions.map((question, idx) => (
                <div key={idx} style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: '0.9em' }}>問題 {idx + 1}：</label>
                    <textarea
                      rows={2}
                      placeholder={`請輸入問題 ${idx + 1} 的內容`}
                      value={question}
                      onChange={(e) => {
                        const updated = [...newJOQ.questions]
                        updated[idx] = e.target.value
                        setNewJOQ({ ...newJOQ, questions: updated })
                      }}
                      style={{ padding: 8, border: '2px solid #000', width: '100%' }}
                    />
                  </div>
                  {newJOQ.questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const updated = newJOQ.questions.filter((_, i) => i !== idx)
                        setNewJOQ({ ...newJOQ, questions: updated })
                      }}
                      style={{ padding: '8px 12px', background: '#f44336', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', alignSelf: 'flex-end' }}
                    >
                      刪除
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" style={{ padding: '8px 16px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: 4 }}>建立題庫</button>
              <button 
                type="button"
                onClick={() => setNewJOQ({ job_opening_id: '', question_bank_id: '', questions: [], showForm: false })} 
                style={{ padding: '8px 16px', background: '#999', color: 'white', border: 'none', borderRadius: 4 }}
              >
                取消
              </button>
            </div>
          </form>
          )}
          <ul style={{ marginTop: 12 }}>
                {joq.map((x) => {
                  const job = jobs.find(j => j.id === x.job_opening_id)
                  return (
                    <li key={x.id} style={{ padding: 12, border: '2px solid #000', background: editingJOQ === x.id ? '#fff9e6' : '#e6f2ff', borderRadius: 6, marginBottom: 8 }}>
                      {editingJOQ === x.id ? (
                        <div style={{ display: 'grid', gap: 12 }}>
                          <div>
                            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>選擇職種：</label>
                            <select 
                              value={editJOQ.job_opening_id} 
                              onChange={(e) => setEditJOQ({ ...editJOQ, job_opening_id: e.target.value })} 
                              style={{ padding: 8, border: '2px solid #000', width: '100%' }}
                            >
                              {jobs.map((j) => (
                                <option key={j.id} value={j.id}>{j.job_title}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>選擇共用題庫（選填）：</label>
                            <select 
                              value={editJOQ.question_bank_id} 
                              onChange={(e) => setEditJOQ({ ...editJOQ, question_bank_id: e.target.value })} 
                              style={{ padding: 8, border: '2px solid #000', width: '100%' }}
                            >
                              <option value="">無</option>
                              {qb.map((q) => (
                                <option key={q.id} value={q.id}>{q.name || '(noname)'}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <label style={{ fontWeight: 'bold' }}>問題列表：</label>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  type="button"
                                  onClick={() => setEditJOQ({ ...editJOQ, questions: [...editJOQ.questions, ''] })}
                                  style={{ padding: '4px 8px', background: '#2196F3', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                                >
                                  + 新增問題
                                </button>
                                <button
                                  type="button"
                                  disabled={isGeneratingJOQAI}
                                  onClick={() => generateJOQQuestionsWithAI('edit')}
                                  style={{ padding: '4px 8px', background: isGeneratingJOQAI ? '#9e9e9e' : '#673ab7', color: 'white', border: 'none', borderRadius: 4, cursor: isGeneratingJOQAI ? 'not-allowed' : 'pointer' }}
                                >
                                  {isGeneratingJOQAI ? 'AI 生成中…' : 'AI 生成問題'}
                                </button>
                              </div>
                            </div>
                            {editJOQ.questions.map((question, idx) => (
                              <div key={idx} style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                  <label style={{ display: 'block', marginBottom: 4, fontSize: '0.9em' }}>問題 {idx + 1}：</label>
                                  <textarea
                                    rows={2}
                                    value={question}
                                    onChange={(e) => {
                                      const updated = [...editJOQ.questions]
                                      updated[idx] = e.target.value
                                      setEditJOQ({ ...editJOQ, questions: updated })
                                    }}
                                    style={{ padding: 8, border: '2px solid #000', width: '100%' }}
                                  />
                                </div>
                                {editJOQ.questions.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = editJOQ.questions.filter((_, i) => i !== idx)
                                      setEditJOQ({ ...editJOQ, questions: updated })
                                    }}
                                    style={{ padding: '8px 12px', background: '#f44336', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', alignSelf: 'flex-end' }}
                                  >
                                    刪除
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => updateJOQ(x.id)} style={{ padding: '6px 12px', background: '#4CAF50', color: 'white' }}>儲存</button>
                            <button onClick={() => setEditingJOQ(null)} style={{ padding: '6px 12px' }}>取消</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 'bold' }}>職種: {job?.job_title || x.job_opening_id}</div>
                            <div style={{ fontSize: '0.9em', color: '#666' }}>
                              共用題庫: {x.question_bank_id ? (qb.find(q => q.id === x.question_bank_id)?.name || '(noname)') : '無'}
                            </div>
                          </div>
                          <button onClick={() => startEditJOQ(x)} style={{ padding: '6px 12px', background: '#2196F3', color: 'white' }}>編輯</button>
                          <button onClick={() => deleteJOQ(x.id)} style={{ padding: '6px 12px', background: '#f44336', color: 'white' }}>刪除</button>
                        </div>
                      )}
                    </li>
                  )
                })}
            {joq.length === 0 && <div style={{ padding: 12, border: '2px dashed #000' }}>尚無職缺問題</div>}
          </ul>
            </>
          )}
        </div>
      )}

      {tab === 'interviews' && (
        <div>
          <div style={{ marginBottom: 12, padding: 12, border: '2px solid #000', borderRadius: 8, background: '#fff7e6' }}>
            公司面試配額剩餘：{Math.max(0, interviewQuota.free_quota - interviewQuota.used_count)} / {interviewQuota.free_quota}
          </div>
          <form onSubmit={addIV} style={{ display: 'grid', gap: 12, padding: 12, border: '2px solid #000', background: '#e6f2ff', borderRadius: 8 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>選擇職種：</label>
              <select 
                value={newIV.job_opening_id} 
                onChange={(e) => setNewIV({ ...newIV, job_opening_id: e.target.value })} 
                style={{ padding: 8, border: '2px solid #000', width: '100%' }}
              >
                <option value="">-- 請選擇職種 --</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>{j.job_title}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>開始時間：</label>
              <input 
                type="datetime-local" 
                value={newIV.start_time} 
                onChange={(e) => setNewIV({ ...newIV, start_time: e.target.value })} 
                style={{ padding: 8, border: '2px solid #000', width: '100%' }} 
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>結束時間（選填）：</label>
              <input 
                type="datetime-local" 
                value={newIV.end_time} 
                onChange={(e) => setNewIV({ ...newIV, end_time: e.target.value })} 
                style={{ padding: 8, border: '2px solid #000', width: '100%' }} 
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>候選人用戶 ID（選填）：</label>
              <input 
                placeholder="如果候選人已有帳號，請輸入用戶 ID"
                value={newIV.profiles_id} 
                onChange={(e) => setNewIV({ ...newIV, profiles_id: e.target.value, candidate_email: '' })} 
                style={{ padding: 8, border: '2px solid #000', width: '100%' }} 
              />
              <div style={{ fontSize: '0.8em', color: '#666', marginTop: 4 }}>注意：用戶 ID 與 Email 只能填寫其中一項</div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>候選人 Email（選填）：</label>
              <input 
                placeholder="如果候選人尚未註冊，請輸入 Email"
                value={newIV.candidate_email} 
                onChange={(e) => setNewIV({ ...newIV, candidate_email: e.target.value, profiles_id: '' })} 
                style={{ padding: 8, border: '2px solid #000', width: '100%' }} 
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>評價方式：</label>
              <select
                value={newIV.review_type}
                onChange={(e) => setNewIV({ ...newIV, review_type: e.target.value as 'AI' | 'HUMAN' | 'MIXED' })}
                style={{ padding: 8, border: '2px solid #000', width: '100%' }}
              >
                <option value="AI">AI 評價（不允許人類標記錄取／拒絕）</option>
                <option value="HUMAN">人類評價（可由招募方手動決定結果）</option>
                <option value="MIXED">混合（保留，未來可同時使用 AI 與人類）</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={interviewQuota.remaining <= 0}
              style={{
                padding: '8px 12px',
                background: interviewQuota.remaining <= 0 ? '#9ca3af' : '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: interviewQuota.remaining <= 0 ? 'not-allowed' : 'pointer',
              }}
            >
              新增面試
            </button>
            {interviewQuota.remaining <= 0 && (
              <div style={{ color: '#b00000', fontSize: '0.9em' }}>面試免費配額已用完</div>
            )}
          </form>
          <ul 
            style={{ marginTop: 12 }}
          >
            {ivs.map((iv) => {
            const job = jobs.find(j => j.id === iv.job_opening_id)
            return (
              <li 
                key={iv.id} 
                data-interview-id={iv.id}
                style={{ padding: 12, border: '2px solid #000', background: editingIV === iv.id ? '#fff9e6' : '#e6f2ff', borderRadius: 6, marginBottom: 8 }}
              >
                  {editingIV === iv.id ? (
                    <div style={{ display: 'grid', gap: 12 }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>選擇職種：</label>
                        <select 
                          value={editIV.job_opening_id} 
                          onChange={(e) => setEditIV({ ...editIV, job_opening_id: e.target.value })} 
                          style={{ padding: 8, border: '2px solid #000', width: '100%' }}
                        >
                          {jobs.map((j) => (
                            <option key={j.id} value={j.id}>{j.job_title}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>開始時間：</label>
                        <input 
                          type="datetime-local" 
                          value={editIV.start_time} 
                          onChange={(e) => setEditIV({ ...editIV, start_time: e.target.value })} 
                          style={{ padding: 8, border: '2px solid #000', width: '100%' }} 
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>結束時間（選填）：</label>
                        <input 
                          type="datetime-local" 
                          value={editIV.end_time} 
                          onChange={(e) => setEditIV({ ...editIV, end_time: e.target.value })} 
                          style={{ padding: 8, border: '2px solid #000', width: '100%' }} 
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>候選人用戶 ID（選填）：</label>
                        <input 
                          placeholder="如果候選人已有帳號，請輸入用戶 ID"
                          value={editIV.profiles_id} 
                          onChange={(e) => setEditIV({ ...editIV, profiles_id: e.target.value, candidate_email: '' })} 
                          style={{ padding: 8, border: '2px solid #000', width: '100%' }} 
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>候選人 Email（選填）：</label>
                        <input 
                          placeholder="如果候選人尚未註冊，請輸入 Email"
                          value={editIV.candidate_email} 
                          onChange={(e) => setEditIV({ ...editIV, candidate_email: e.target.value, profiles_id: '' })} 
                          style={{ padding: 8, border: '2px solid #000', width: '100%' }} 
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>評價方式：</label>
                        <select
                          value={editIV.review_type}
                          onChange={(e) => setEditIV({ ...editIV, review_type: e.target.value as 'AI' | 'HUMAN' | 'MIXED' })}
                          style={{ padding: 8, border: '2px solid #000', width: '100%' }}
                        >
                          <option value="AI">AI 評價（不允許人類標記錄取／拒絕）</option>
                          <option value="HUMAN">人類評價（可由招募方手動決定結果）</option>
                          <option value="MIXED">混合（保留，未來可同時使用 AI 與人類）</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => updateIV(iv.id)} style={{ padding: '6px 12px', background: '#4CAF50', color: 'white' }}>儲存</button>
                        <button onClick={() => setEditingIV(null)} style={{ padding: '6px 12px' }}>取消</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {(() => {
                        const rawSession = (iv as any).interview_sessions
                        const session = Array.isArray(rawSession) ? rawSession[0] : rawSession
                        const sessionReviewType = session?.review_type as 'AI' | 'HUMAN' | 'MIXED' | undefined
                        const interviewReviewType = (iv as any).review_type as 'AI' | 'HUMAN' | 'MIXED' | undefined
                        const reviewType = sessionReviewType || interviewReviewType
                        const canHumanReview = !!session && reviewType === 'HUMAN'
                        const hasSession = !!session
                        const candidateProfile = (iv as any).profiles as
                          | { family_name?: string | null; given_name?: string | null }
                          | null
                          | undefined
                        const candidateName = [
                          candidateProfile?.family_name || '',
                          candidateProfile?.given_name || '',
                        ]
                          .filter(Boolean)
                          .join('')
                        const candidateDisplay = candidateName || iv.candidate_email || iv.profiles_id || '-'

                        return (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                              <div style={{ flex: 1, minWidth: 250 }}>
                                <div style={{ fontWeight: 'bold' }}>職種: {job?.job_title || iv.job_opening_id}</div>
                                <div style={{ fontWeight: 'bold' }}>面試者: {candidateDisplay}</div>
                                <div style={{ fontSize: '0.9em', color: '#666' }}>
                                  開始: {iv.start_time}<br />
                                  狀態: {formatInterviewStatus(iv.status)}<br />
                                  {hasSession && (
                                    <>
                                      面試結果: {formatInterviewResult(session?.interview_result)}<br />
                                      評價方式: {formatReviewType(reviewType || null)}<br />
                                      總分: {typeof session?.total_score === 'number' ? `${session.total_score} 分` : '尚未計算'}
                                      <br />
                                    </>
                                  )}
                                  {iv.profiles_id && <span>用戶 ID: {iv.profiles_id}<br /></span>}
                                  {iv.candidate_email && <span>Email: {iv.candidate_email}</span>}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button
                                  onClick={() => startEditIV(iv)}
                                  style={{ padding: '6px 12px', background: '#2196F3', color: 'white' }}
                                >
                                  編輯
                                </button>
                                <button
                                  data-interview-toggle
                                  onClick={() => {
                                    if (expandedIV === iv.id) {
                                      // 收合前：若尚未提交過回饋，提醒一次（非展開當下跳）
                                      const didNudge = maybeNudgeRecruiterFeedbackBeforeLeave(iv.id, () => {
                                        setExpandedIV(null)
                                        setRecruiterFeedbackNudge({ open: false, interviewId: null })
                                      })
                                      if (didNudge) return
                                      setExpandedIV(null)
                                      setRecruiterFeedbackNudge({ open: false, interviewId: null })
                                    } else {
                                      // 切換到另一筆前：若尚未提交過回饋，提醒一次（再切換）
                                      if (expandedIV) {
                                        const didNudge = maybeNudgeRecruiterFeedbackBeforeLeave(expandedIV, () => setExpandedIV(iv.id))
                                        if (didNudge) return
                                      }
                                      setExpandedIV(iv.id)
                                      if (!criteriaDisplayNames[iv.job_opening_id]) {
                                        void ensureCriteriaDisplayNames(iv.job_opening_id)
                                      }
                                      void ensureMyRecruiterFeedback(iv.id)
                                    }
                                  }}
                                  style={{ padding: '6px 12px', background: '#607D8B', color: 'white' }}
                                >
                                  {expandedIV === iv.id ? '收合詳情' : '展開詳情'}
                                </button>
                                {reviewingIV === iv.id ? (
                                  <>
                                    <button
                                      disabled={!canHumanReview || reviewingLoading}
                                      onClick={() => evalIV(iv.id, 'hired')}
                                      style={{
                                        padding: '6px 12px',
                                        background: !canHumanReview || reviewingLoading ? '#c8e6c9' : '#4CAF50',
                                        color: 'white',
                                        cursor: !canHumanReview || reviewingLoading ? 'not-allowed' : 'pointer',
                                      }}
                                    >
                                      錄取
                                    </button>
                                    <button
                                      disabled={!canHumanReview || reviewingLoading}
                                      onClick={() => evalIV(iv.id, 'rejected')}
                                      style={{
                                        padding: '6px 12px',
                                        background: !canHumanReview || reviewingLoading ? '#ffcdd2' : '#f44336',
                                        color: 'white',
                                        cursor: !canHumanReview || reviewingLoading ? 'not-allowed' : 'pointer',
                                      }}
                                    >
                                      拒絕
                                    </button>
                                    <button
                                      onClick={() => setReviewingIV(null)}
                                      style={{ padding: '6px 12px' }}
                                    >
                                      取消
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    disabled={!canHumanReview}
                                    onClick={() => setReviewingIV(iv.id)}
                                    style={{
                                      padding: '6px 12px',
                                      background: canHumanReview ? '#9C27B0' : '#BDBDBD',
                                      color: 'white',
                                      cursor: canHumanReview ? 'pointer' : 'not-allowed',
                                    }}
                                  >
                                    評價
                                  </button>
                                )}
                                <button
                                  onClick={() => deleteIV(iv.id)}
                                  style={{ padding: '6px 12px', background: '#f44336', color: 'white' }}
                                >
                                  刪除
                                </button>
                              </div>
                            </div>

                            {expandedIV === iv.id && (
                              <div
                                data-interview-detail
                                onClick={(e) => {
                                  // 阻止事件冒泡，避免點擊詳情區域時觸發收合
                                  e.stopPropagation()
                                }}
                                style={{
                                  marginTop: 12,
                                  padding: 12,
                                  background: '#ffffff',
                                  borderRadius: 6,
                                  border: '1px dashed #9e9e9e',
                                }}
                              >
                                {hasSession ? (
                                  <div style={{ display: 'grid', gap: 8 }}>
                                    <div>
                                      <strong>總分：</strong>
                                      {typeof session.total_score === 'number' ? `${session.total_score} 分` : '尚未計算'}
                                    </div>
                                    <div>
                                      <strong>面試結果：</strong>
                                      {formatInterviewResult(session.interview_result)}
                                    </div>
                                    <div>
                                      <strong>結果理由：</strong>
                                      {formatResultReason(session.result_reason)}
                                    </div>
                                    <div>
                                      <strong>評價方式：</strong>
                                      {formatReviewType(reviewType || null)}
                                    </div>
                                    <div>
                                      <strong>面試時長：</strong>
                                      {formatDurationSeconds(session.duration_seconds)}
                                    </div>
                                    <div>
                                      <strong>Token 使用量：</strong>
                                      {(() => {
                                        // 優先使用逐回合 transcript token_usage 加總，避免 session 累加誤差
                                        const transcript = Array.isArray((session as any)?.interview_transcript)
                                          ? (session as any).interview_transcript
                                          : []
                                        let tIn = 0
                                        let tOut = 0
                                        let hasTranscriptToken = false
                                        for (const row of transcript) {
                                          const usage = row?.token_usage
                                          if (!usage || typeof usage !== 'object') continue
                                          const ti = Number((usage as any).tokens_input)
                                          const to = Number((usage as any).tokens_output)
                                          if (Number.isFinite(ti) && ti >= 0) {
                                            tIn += Math.floor(ti)
                                            hasTranscriptToken = true
                                          }
                                          if (Number.isFinite(to) && to >= 0) {
                                            tOut += Math.floor(to)
                                            hasTranscriptToken = true
                                          }
                                        }

                                        const si = Number((session as any)?.tokens_input)
                                        const so = Number((session as any)?.tokens_output)
                                        const hasSessionToken = Number.isFinite(si) || Number.isFinite(so)
                                        if (!hasTranscriptToken && !hasSessionToken) return '—'

                                        const inTok = hasTranscriptToken
                                          ? tIn
                                          : (Number.isFinite(si) ? Math.max(0, Math.floor(si)) : 0)
                                        const outTok = hasTranscriptToken
                                          ? tOut
                                          : (Number.isFinite(so) ? Math.max(0, Math.floor(so)) : 0)
                                        const total = Math.max(0, inTok + outTok)
                                        return `輸入 ${inTok} / 輸出 ${outTok} / 總計 ${total}`
                                      })()}
                                    </div>
                                    <div>
                                      <strong>錄影路徑：</strong>
                                      {session.video_path || '—'}
                                    </div>
                                    <div>
                                      <strong>AI 評分：</strong>
                                      {Array.isArray(session.ai_evaluations) && session.ai_evaluations.length > 0 ? (
                                        <ul style={{ marginTop: 4, paddingLeft: 16 }}>
                                          {session.ai_evaluations.map((e: any, idx: number) => (
                                            <li key={idx} style={{ fontSize: '0.9em' }}>
                                              {(
                                                criteriaDisplayNames[iv.job_opening_id]?.[e.key] ||
                                                criteriaNames[e.key] ||
                                                e.key
                                              )}: {e.score}
                                              {e.evidence ? `（說明：${e.evidence}）` : ''}
                                            </li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <span>尚無 AI 評分</span>
                                      )}
                                    </div>
                                    <div>
                                      <strong>面試詳細內容：</strong>
                                      {Array.isArray(session.interview_transcript) &&
                                      session.interview_transcript.length > 0 ? (
                                        <div
                                          style={{
                                            maxHeight: 560,
                                            overflowY: 'auto',
                                            marginTop: 4,
                                            padding: 8,
                                            border: '1px solid #e0e0e0',
                                            background: '#fafafa',
                                          }}
                                        >
                                          {session.interview_transcript.map((t: any, idx: number) => {
                                            const additionsDetail = (t.additions_detail || '').trim()
                                            const deductionsDetail = (t.deductions_detail || '').trim()
                                            const tu = t?.token_usage && typeof t.token_usage === 'object' ? t.token_usage : null
                                            const hasCurrentScores =
                                              t.current_scores &&
                                              typeof t.current_scores === 'object' &&
                                              Object.keys(t.current_scores).length > 0

                                            return (
                                              <div
                                                key={idx}
                                                style={{
                                                  marginBottom: 10,
                                                  fontSize: '0.9em',
                                                  padding: 8,
                                                  borderRadius: 4,
                                                  background: t.role === 'ai' ? '#e3f2fd' : '#fff',
                                                  border: '1px solid #e0e0e0',
                                                }}
                                              >
                                                <div style={{ marginBottom: 4 }}>
                                                  <span style={{ fontWeight: 'bold' }}>
                                                    {t.role === 'ai' ? 'AI' : '候選人'}：
                                                  </span>
                                                  <span>{t.content}</span>
                                                </div>

                                                {t.aiFeedback && String(t.aiFeedback).trim() && (
                                                  <div style={{ marginBottom: 2 }}>
                                                    <span style={{ fontWeight: 'bold' }}>AI 評語：</span>
                                                    <span>{t.aiFeedback}</span>
                                                  </div>
                                                )}

                                                {tu && (
                                                  <div style={{ marginBottom: 2 }}>
                                                    <span style={{ fontWeight: 'bold' }}>本題 Token：</span>
                                                    <span>
                                                      {`輸入 ${Math.max(0, Number(tu.tokens_input) || 0)} / 輸出 ${Math.max(0, Number(tu.tokens_output) || 0)} / 總計 ${Math.max(0, Number(tu.tokens_total) || ((Number(tu.tokens_input) || 0) + (Number(tu.tokens_output) || 0)))}`}
                                                    </span>
                                                  </div>
                                                )}

                                                {(() => {
                                                  const scoreEvents = t.score_events
                                                  if (!scoreEvents || typeof scoreEvents !== 'object') return null

                                                  const additions = scoreEvents.additions
                                                  const deductions = scoreEvents.deductions
                                                  const hasAdditions = additions && typeof additions === 'object' && Object.keys(additions).length > 0
                                                  const hasDeductions = deductions && typeof deductions === 'object' && Object.keys(deductions).length > 0

                                                  if (!hasAdditions && !hasDeductions) return null

                                                  return (
                                                    <div style={{ marginBottom: 2, marginTop: 4 }}>
                                                      {(hasAdditions || hasDeductions) && (
                                                        <div style={{ fontWeight: 'bold', marginBottom: 4 }}>評分事件：</div>
                                                      )}
                                                      
                                                      {hasAdditions && (
                                                        <div style={{ marginBottom: 6 }}>
                                                          <div style={{ fontWeight: 'bold', fontSize: '0.85em', marginBottom: 4, color: '#2e7d32' }}>加分項目：</div>
                                                          <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.85em' }}>
                                                            {Object.entries(additions).map(([key, items]) => {
                                                              if (!Array.isArray(items) || items.length === 0) return null
                                                              const criteriaName = criteriaDisplayNames[iv.job_opening_id]?.[key] || criteriaNames[key] || key
                                                              return (
                                                                <li key={key} style={{ marginBottom: 4 }}>
                                                                  <div style={{ fontWeight: 'bold' }}>{criteriaName}：</div>
                                                                  <ul style={{ margin: '2px 0 0 16px', padding: 0 }}>
                                                                    {items.map((item: any, idx: number) => (
                                                                      <li key={idx} style={{ marginBottom: 2 }}>
                                                                        {item.detail || '（無說明）'}
                                                                        {typeof item.points === 'number' && (
                                                                          <span style={{ color: '#2e7d32', fontWeight: 'bold' }}> (+{item.points}分)</span>
                                                                        )}
                                                                      </li>
                                                                    ))}
                                                                  </ul>
                                                                </li>
                                                              )
                                                            })}
                                                          </ul>
                                                        </div>
                                                      )}

                                                      {hasDeductions && (
                                                        <div>
                                                          <div style={{ fontWeight: 'bold', fontSize: '0.85em', marginBottom: 4, color: '#d32f2f' }}>扣分項目：</div>
                                                          <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.85em' }}>
                                                            {Object.entries(deductions).map(([key, items]) => {
                                                              if (!Array.isArray(items) || items.length === 0) return null
                                                              const criteriaName = criteriaDisplayNames[iv.job_opening_id]?.[key] || criteriaNames[key] || key
                                                              return (
                                                                <li key={key} style={{ marginBottom: 4 }}>
                                                                  <div style={{ fontWeight: 'bold' }}>{criteriaName}：</div>
                                                                  <ul style={{ margin: '2px 0 0 16px', padding: 0 }}>
                                                                    {items.map((item: any, idx: number) => (
                                                                      <li key={idx} style={{ marginBottom: 2 }}>
                                                                        {item.detail || '（無說明）'}
                                                                        {typeof item.points === 'number' && (
                                                                          <span style={{ color: '#d32f2f', fontWeight: 'bold' }}> ({item.points}分)</span>
                                                                        )}
                                                                      </li>
                                                                    ))}
                                                                  </ul>
                                                                </li>
                                                              )
                                                            })}
                                                          </ul>
                                                        </div>
                                                      )}
                                                    </div>
                                                  )
                                                })()}

                                                {hasCurrentScores && (
                                                  <div style={{ marginBottom: 2 }}>
                                                    <span style={{ fontWeight: 'bold' }}>當前分數：</span>
                                                    <ul style={{ margin: '4px 0 0 16px' }}>
                                                      {Object.entries(t.current_scores).map(([key, value]) => (
                                                        <li key={key}>
                                                          {(
                                                            criteriaDisplayNames[iv.job_opening_id]?.[key] ||
                                                            criteriaNames[key] ||
                                                            key
                                                          )}
                                                          ：{String(value)}
                                                        </li>
                                                      ))}
                                                    </ul>
                                                  </div>
                                                )}

                                                {additionsDetail && (
                                                  <div style={{ marginBottom: 2 }}>
                                                    <span style={{ fontWeight: 'bold' }}>加分說明：</span>
                                                    <span>{additionsDetail}</span>
                                                  </div>
                                                )}

                                                {deductionsDetail && (
                                                  <div style={{ marginBottom: 2 }}>
                                                    <span style={{ fontWeight: 'bold' }}>扣分說明：</span>
                                                    <span>{deductionsDetail}</span>
                                                  </div>
                                                )}
                                              </div>
                                            )
                                          })}
                                        </div>
                                      ) : (
                                        <span>尚無面試對話紀錄</span>
                                      )}
                                      {(() => {
                                        if (!Array.isArray(session.interview_transcript) || session.interview_transcript.length === 0) return null
                                        const parsePersonality = (raw: any) => {
                                          if (!raw) return null
                                          if (typeof raw === 'object') return raw
                                          if (typeof raw === 'string') {
                                            try {
                                              const parsed = JSON.parse(raw)
                                              return parsed && typeof parsed === 'object' ? parsed : null
                                            } catch {
                                              return null
                                            }
                                          }
                                          return null
                                        }
                                        const reversed = [...session.interview_transcript].reverse()
                                        const latest = reversed.find((item: any) => {
                                          if (!item || item.role !== 'ai') return false
                                          return !!parsePersonality(item.personality)
                                        })
                                        const personalityData = latest ? parsePersonality(latest.personality) : null
                                        if (!personalityData) return null

                                        return (
                                          <div style={{ marginTop: 12 }}>
                                            <div style={{ fontWeight: 'bold', marginBottom: 6 }}>人格分析：</div>
                                            <PersonalityAnalysisPanel personality={personalityData} />
                                          </div>
                                        )
                                      })()}
                                    </div>
                                    <div>
                                      <strong>使用者反饋：</strong>
                                      {(() => {
                                        const draft =
                                          recruiterDraftByInterviewId[iv.id] || {
                                            criteria_bias: {},
                                            overall_decision_bias: 0,
                                            explainability: 3,
                                            reason_flags: [],
                                            other_detail: '',
                                            comment: '',
                                          }
                                        const status = recruiterFeedbackStatusByInterviewId[iv.id] || {}
                                        const criteriaItems =
                                          criteriaListByJobOpeningId[iv.job_opening_id] ||
                                          (Array.isArray(session.ai_evaluations)
                                            ? session.ai_evaluations.map((e: any) => ({
                                                key: e?.key,
                                                display_name:
                                                  criteriaDisplayNames[iv.job_opening_id]?.[e?.key] ||
                                                  criteriaNames[e?.key] ||
                                                  e?.key,
                                              }))
                                            : [])

                                        const biasOptions: Array<{ label: string; value: number }> = [
                                          { label: '過大評價', value: 2 },
                                          { label: '稍許過大評價', value: 1 },
                                          { label: '正確', value: 0 },
                                          { label: '稍許過小評價', value: -1 },
                                          { label: '過小評價', value: -2 },
                                        ]
                                        const reasonOptions: Array<{ key: string; label: string }> = [
                                          { key: 'insufficient_evidence', label: '證據不足 / 解釋不清' },
                                          { key: 'logic_issue', label: '邏輯或前後一致性問題' },
                                          { key: 'risk_missed', label: '忽略風險 / 紅旗' },
                                          { key: 'followup_inappropriate', label: '追問不適切 / 過度追問' },
                                          { key: 'other', label: '其他' },
                                        ]

                                        const setDraft = (next: typeof draft) => {
                                          setRecruiterDraftByInterviewId((prev) => ({ ...prev, [iv.id]: next }))
                                          setRecruiterDraftDirtyByInterviewId((prev) => ({ ...prev, [iv.id]: true }))
                                        }

                                        return (
                                          <div style={{ marginTop: 6, padding: 10, border: '1px solid #e0e0e0', borderRadius: 6, background: '#fafafa' }}>
                                            {status.error && (
                                              <div style={{ color: '#d32f2f', fontSize: '0.9em', marginBottom: 6 }}>
                                                {status.error}
                                              </div>
                                            )}
                                            {status.savedAt && (
                                              <div style={{ color: '#2e7d32', fontSize: '0.85em', marginBottom: 6 }}>
                                                已提交（最後更新：{new Date(status.savedAt).toLocaleString('zh-TW')}）
                                              </div>
                                            )}

                                            <div style={{ display: 'grid', gap: 10 }}>
                                              <div>
                                                <div style={{ fontWeight: 'bold', marginBottom: 6 }}>各項目準確度</div>
                                                <div style={{ display: 'grid', gap: 8 }}>
                                                  {(criteriaItems || []).map((c: any) => {
                                                    const key = String(c?.key || '')
                                                    if (!key) return null
                                                    const name =
                                                      c?.display_name ||
                                                      criteriaDisplayNames[iv.job_opening_id]?.[key] ||
                                                      criteriaNames[key] ||
                                                      key
                                                    const current = Number((draft.criteria_bias || {})[key] ?? 0)
                                                    return (
                                                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                                        <div style={{ minWidth: 140 }}>{name}</div>
                                                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                                          {biasOptions.map((opt) => (
                                                            <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.9em' }}>
                                                              <input
                                                                type="radio"
                                                                name={`bias-${iv.id}-${key}`}
                                                                checked={current === opt.value}
                                                                onChange={() =>
                                                                  setDraft({
                                                                    ...draft,
                                                                    criteria_bias: { ...(draft.criteria_bias || {}), [key]: opt.value },
                                                                  })
                                                                }
                                                              />
                                                              {opt.label}
                                                            </label>
                                                          ))}
                                                        </div>
                                                      </div>
                                                    )
                                                  })}
                                                  {(!criteriaItems || criteriaItems.length === 0) && (
                                                    <div style={{ fontSize: '0.9em', color: '#666' }}>尚無可校正的評估項目</div>
                                                  )}
                                                </div>
                                              </div>

                                              <div>
                                                <div style={{ fontWeight: 'bold', marginBottom: 6 }}>整體判定校正</div>
                                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                                  {biasOptions.map((opt) => (
                                                    <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.9em' }}>
                                                      <input
                                                        type="radio"
                                                        name={`overall-bias-${iv.id}`}
                                                        checked={Number(draft.overall_decision_bias) === opt.value}
                                                        onChange={() => setDraft({ ...draft, overall_decision_bias: opt.value })}
                                                      />
                                                      {opt.label}
                                                    </label>
                                                  ))}
                                                </div>
                                              </div>

                                              <div>
                                                <div style={{ fontWeight: 'bold', marginBottom: 6 }}>證據/解釋是否足夠（1-5）</div>
                                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                                  {[1, 2, 3, 4, 5].map((v) => (
                                                    <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.9em' }}>
                                                      <input
                                                        type="radio"
                                                        name={`explainability-${iv.id}`}
                                                        checked={Number(draft.explainability) === v}
                                                        onChange={() => setDraft({ ...draft, explainability: v })}
                                                      />
                                                      {v}
                                                    </label>
                                                  ))}
                                                </div>
                                              </div>

                                              <div>
                                                <div style={{ fontWeight: 'bold', marginBottom: 6 }}>原因（可複選）</div>
                                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                                  {reasonOptions.map((opt) => {
                                                    const set = new Set<string>(Array.isArray(draft.reason_flags) ? draft.reason_flags : [])
                                                    const checked = set.has(opt.key)
                                                    return (
                                                      <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9em' }}>
                                                        <input
                                                          type="checkbox"
                                                          checked={checked}
                                                          onChange={() => {
                                                            if (set.has(opt.key)) set.delete(opt.key)
                                                            else set.add(opt.key)
                                                            const nextFlags = Array.from(set)
                                                            const next = { ...draft, reason_flags: nextFlags }
                                                            // 若取消「其他」，順便清掉文字
                                                            if (!set.has('other')) (next as any).other_detail = ''
                                                            setDraft(next)
                                                          }}
                                                        />
                                                        {opt.label}
                                                      </label>
                                                    )
                                                  })}
                                                </div>
                                                {(() => {
                                                  const set = new Set<string>(Array.isArray(draft.reason_flags) ? draft.reason_flags : [])
                                                  if (!set.has('other')) return null
                                                  return (
                                                    <div style={{ marginTop: 10 }}>
                                                      <div style={{ fontWeight: 'bold', marginBottom: 6, fontSize: '0.92em' }}>其他（請補充）</div>
                                                      <textarea
                                                        value={draft.other_detail || ''}
                                                        onChange={(e) => setDraft({ ...draft, other_detail: e.target.value })}
                                                        placeholder="請輸入其他原因..."
                                                        style={{ width: '100%', minHeight: 70, padding: 8, border: '1px solid #ccc', borderRadius: 6 }}
                                                      />
                                                    </div>
                                                  )
                                                })()}
                                              </div>

                                              <div>
                                                <div style={{ fontWeight: 'bold', marginBottom: 6 }}>意見反饋（自由記述）</div>
                                                <textarea
                                                  value={draft.comment}
                                                  onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
                                                  placeholder="例如：哪個項目常被高估/低估、希望 AI 補充的證據、常見誤判模式..."
                                                  style={{ width: '100%', minHeight: 90, padding: 8, border: '1px solid #ccc', borderRadius: 6 }}
                                                />
                                              </div>

                                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                                {status.loading && <div style={{ fontSize: '0.85em', color: '#666' }}>載入中...</div>}
                                                <button
                                                  disabled={!!status.saving}
                                                  onClick={() => submitRecruiterFeedback(iv.id)}
                                                  style={{
                                                    padding: '6px 12px',
                                                    background: status.saving ? '#BDBDBD' : '#1976D2',
                                                    color: 'white',
                                                    cursor: status.saving ? 'not-allowed' : 'pointer',
                                                  }}
                                                >
                                                  {status.saving ? '送出中...' : '送出校正回饋'}
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        )
                                      })()}
                                    </div>
                                    <div>
                                      <strong>建立時間：</strong>
                                      {session.created_at
                                        ? new Date(session.created_at).toLocaleString('zh-TW')
                                        : '—'}
                                    </div>
                                  </div>
                                ) : (
                                  <div>尚未產生面試紀錄</div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </>
                  )}
              </li>
              )
            })}
            {ivs.length === 0 && <div style={{ padding: 12, border: '2px dashed #000' }}>尚無面試</div>}
          </ul>
        </div>
      )}

      {tab === 'resumeReview' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={() => setResumeReviewTab('standards')} style={{ padding: '6px 10px', background: resumeReviewTab === 'standards' ? '#2563eb' : '#e5e7eb', color: resumeReviewTab === 'standards' ? '#fff' : '#111' }}>審查標準</button>
            <button onClick={() => setResumeReviewTab('create')} style={{ padding: '6px 10px', background: resumeReviewTab === 'create' ? '#2563eb' : '#e5e7eb', color: resumeReviewTab === 'create' ? '#fff' : '#111' }}>建立審查</button>
            <button onClick={() => setResumeReviewTab('results')} style={{ padding: '6px 10px', background: resumeReviewTab === 'results' ? '#2563eb' : '#e5e7eb', color: resumeReviewTab === 'results' ? '#fff' : '#111' }}>審查結果</button>
          </div>

          {resumeReviewTab === 'standards' && (
            <div>
              <form onSubmit={createReviewStandards} style={{ display: 'grid', gap: 10, padding: 12, border: '2px solid #000', background: '#e6f2ff', borderRadius: 8 }}>
                <select
                  value={newReviewStandardJobOpeningId}
                  onChange={(e) => {
                    const v = e.target.value
                    setNewReviewStandardJobOpeningId(v)
                    void loadReviewStandards(token, v)
                  }}
                  style={{ padding: 8, border: '2px solid #000' }}
                >
                  <option value="">-- 選擇職種 --</option>
                  {jobs.map((j) => <option key={j.id} value={j.id}>{j.job_title}</option>)}
                </select>
                <div style={{ display: 'grid', gap: 8 }}>
                  {reviewStandardDrafts.map((draft, idx) => (
                    <div key={`draft-${idx}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        placeholder={`標準名稱 #${idx + 1}（例：React 實務）`}
                        value={draft.name}
                        onChange={(e) =>
                          setReviewStandardDrafts((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x))
                          )
                        }
                        style={{ padding: 8, border: '2px solid #000', flex: 1 }}
                      />
                      <select
                        value={draft.label}
                        onChange={(e) =>
                          setReviewStandardDrafts((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, label: e.target.value as ResumeReviewLabel } : x))
                          )
                        }
                        style={{ padding: 8, border: '2px solid #000', minWidth: 220, maxWidth: 280 }}
                      >
                        {RESUME_REVIEW_LABEL_ORDER.map((lv) => (
                          <option key={lv} value={lv}>
                            {RESUME_REVIEW_LABEL_ZH[lv]}
                          </option>
                        ))}
                      </select>
                      {reviewStandardDrafts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setReviewStandardDrafts((prev) => prev.filter((_, i) => i !== idx))}
                          style={{ padding: '8px 10px', background: '#f44336', color: 'white', border: 'none', borderRadius: 4 }}
                        >
                          刪除
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setReviewStandardDrafts((prev) => [...prev, { name: '', label: 'MUST' }])}
                    style={{ padding: '8px 12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 4 }}
                  >
                    新增標準+
                  </button>
                  <button type="submit" style={{ padding: '8px 12px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: 4 }}>
                    儲存標準
                  </button>
                </div>
              </form>
              <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                {Object.entries(
                  reviewStandards.reduce((acc, s) => {
                    const key = s.job_opening_id
                    if (!acc[key]) acc[key] = []
                    acc[key].push(s)
                    return acc
                  }, {} as Record<string, ResumeReviewStandard[]>)
                ).map(([jobOpeningId, items]) => (
                  <div key={jobOpeningId} style={{ padding: 10, border: '2px solid #000', borderRadius: 6, background: '#e6f2ff', display: 'grid', gap: 8 }}>
                    <div style={{ fontWeight: 'bold' }}>職種：{jobs.find((j) => j.id === jobOpeningId)?.job_title || jobOpeningId}</div>
                    {items
                      .slice()
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((s) => (
                        <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#fff', border: '1px solid #999', borderRadius: 6, padding: 8 }}>
                          <input
                            value={s.name}
                            onChange={(e) => setReviewStandards((prev) => prev.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))}
                            style={{ padding: 8, border: '2px solid #000', flex: 1 }}
                          />
                          <select
                            value={s.label}
                            onChange={(e) => setReviewStandards((prev) => prev.map((x) => (x.id === s.id ? { ...x, label: e.target.value as any } : x)))}
                            style={{ padding: 8, border: '2px solid #000', minWidth: 220, maxWidth: 280 }}
                          >
                            {RESUME_REVIEW_LABEL_ORDER.map((lv) => (
                              <option key={lv} value={lv}>
                                {RESUME_REVIEW_LABEL_ZH[lv]}
                              </option>
                            ))}
                          </select>
                          <button onClick={() => updateReviewStandard(s, {})} style={{ padding: '6px 12px', background: '#2196F3', color: 'white' }}>儲存</button>
                          <button onClick={() => removeReviewStandard(s)} style={{ padding: '6px 12px', background: '#f44336', color: 'white' }}>刪除</button>
                        </div>
                      ))}
                  </div>
                ))}
                {reviewStandards.length === 0 && <div style={{ padding: 12, border: '2px dashed #000' }}>尚無審查標準</div>}
              </div>
            </div>
          )}

          {resumeReviewTab === 'create' && (
            <form onSubmit={createResumeReviewRequest} style={{ display: 'grid', gap: 10, padding: 12, border: '2px solid #000', background: '#e6f2ff', borderRadius: 8 }}>
              <select value={newReviewRequest.job_opening_id} onChange={(e) => setNewReviewRequest({ ...newReviewRequest, job_opening_id: e.target.value })} style={{ padding: 8, border: '2px solid #000' }}>
                <option value="">-- 選擇職種 --</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.job_title}（{j.hired_count || 0}/{j.target_hires || 1}）
                  </option>
                ))}
              </select>
              <input placeholder="候選人 Email" value={newReviewRequest.candidate_email} onChange={(e) => setNewReviewRequest({ ...newReviewRequest, candidate_email: e.target.value })} style={{ padding: 8, border: '2px solid #000' }} />
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>備註（選填）：</label>
                <textarea
                  placeholder="僅供內部參考，不會顯示給候選人"
                  rows={3}
                  value={newReviewRequest.remarks}
                  onChange={(e) => setNewReviewRequest({ ...newReviewRequest, remarks: e.target.value })}
                  style={{ padding: 8, border: '2px solid #000', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 12, padding: 12, border: '2px solid #000', borderRadius: 8, background: '#fff7e6' }}>
                履歷審查邀請剩餘： {resumeReviewInviteQuota.used_count == null ? '讀取中' : Math.max(0, resumeReviewInviteQuota.free_quota - resumeReviewInviteQuota.used_count)} / {resumeReviewInviteQuota.free_quota}
                {isResumeReviewInviteQuotaLoading && <span style={{ marginLeft: 8, color: '#666' }}>讀取中...</span>}
              </div>
              <button type="submit" style={{ padding: '8px 12px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: 4 }}>發送履歷審查邀請</button>
            </form>
          )}

          {resumeReviewTab === 'results' && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <select value={reviewResultFilterJobOpeningId} onChange={async (e) => { const v = e.target.value; setReviewResultFilterJobOpeningId(v); await loadReviewResults(token, v || undefined) }} style={{ padding: 8, border: '2px solid #000' }}>
                  <option value="">全部職種</option>
                  {jobs.map((j) => <option key={j.id} value={j.id}>{j.job_title}</option>)}
                </select>
                <button onClick={() => loadReviewResults(token, reviewResultFilterJobOpeningId || undefined)} style={{ padding: '8px 12px' }}>重新整理</button>
              </div>
              <ul>
                {reviewResults.map((x: any) => (
                  <li key={x.review_result_id} style={{ position: 'relative', padding: '40px 10px 10px', border: '2px solid #000', borderRadius: 6, marginBottom: 8, background: '#e6f2ff' }}>
                    <button
                      type="button"
                      onClick={() => removeReviewResult(x)}
                      disabled={deletingReviewResultId === String(x.review_result_id)}
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        padding: '4px 10px',
                        background: deletingReviewResultId === String(x.review_result_id) ? '#fca5a5' : '#dc2626',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        cursor: deletingReviewResultId === String(x.review_result_id) ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {deletingReviewResultId === String(x.review_result_id) ? '刪除中...' : '刪除此審查結果'}
                    </button>
                    {(() => {
                      const criteria = Array.isArray(x.criteria_results) ? x.criteria_results : []
                      const mustNotMatched = criteria.filter((c: any) => c?.label === 'MUST' && !c?.matched)
                      const ngMatched = criteria.filter((c: any) => c?.label === 'NG' && !!c?.matched)
                      const isPassed = mustNotMatched.length === 0 && ngMatched.length === 0
                      const failReasons: string[] = []
                      if (mustNotMatched.length > 0) {
                        failReasons.push(`必須條件未滿足：${mustNotMatched.map((c: any) => c.name).join('、')}`)
                      }
                      if (ngMatched.length > 0) {
                        failReasons.push(`命中禁止條件：${ngMatched.map((c: any) => c.name).join('、')}`)
                      }
                      return (
                        <div style={{ marginBottom: 8, padding: 8, borderRadius: 6, background: isPassed ? '#dcfce7' : '#fee2e2', color: isPassed ? '#166534' : '#991b1b' }}>
                          <b>{isPassed ? '審查通過' : '審查不通過'}</b>
                          {!isPassed && failReasons.length > 0 && <div style={{ marginTop: 4 }}>原因：{failReasons.join('；')}</div>}
                        </div>
                      )
                    })()}
                    <div style={{ fontWeight: 'bold', marginBottom: 6 }}>姓名：{x.candidate_name || '-'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div><b>USER-ID：</b>{x.candidate_profile_id || 'null'}</div>
                      <button
                        type="button"
                        disabled={!x.candidate_profile_id}
                        onClick={async () => {
                          const key = String(x.review_result_id || x.candidate_profile_id || '')
                          const v = String(x.candidate_profile_id || '')
                          if (!v) return
                          try {
                            await navigator.clipboard.writeText(v)
                          } catch (err) {
                            // Fallback for browsers/environments without clipboard permission.
                            const ta = document.createElement('textarea')
                            ta.value = v
                            ta.style.position = 'fixed'
                            ta.style.left = '-9999px'
                            document.body.appendChild(ta)
                            ta.select()
                            document.execCommand('copy')
                            document.body.removeChild(ta)
                          }

                          if (key) {
                            const prev = copiedReviewResultTimersRef.current[key]
                            if (prev?.fade) clearTimeout(prev.fade)
                            if (prev?.clear) clearTimeout(prev.clear)

                            setCopiedReviewResultState((s) => ({ ...s, [key]: 'show' }))
                            const fade = setTimeout(() => {
                              setCopiedReviewResultState((s) => ({ ...s, [key]: 'fade' }))
                            }, 800)
                            const clear = setTimeout(() => {
                              setCopiedReviewResultState((s) => {
                                const next = { ...s }
                                delete next[key]
                                return next
                              })
                            }, 1800)
                            copiedReviewResultTimersRef.current[key] = { fade, clear }
                          }
                        }}
                        style={{
                          padding: '4px 10px',
                          background: x.candidate_profile_id ? '#111827' : '#9ca3af',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 6,
                          cursor: x.candidate_profile_id ? 'pointer' : 'not-allowed',
                          opacity: x.candidate_profile_id ? 1 : 0.7,
                        }}
                      >
                        複製
                      </button>
                      {(() => {
                        const key = String(x.review_result_id || x.candidate_profile_id || '')
                        const state = key ? copiedReviewResultState[key] : null
                        if (!state) return null
                        return (
                          <span
                            style={{
                              fontSize: '0.9em',
                              color: '#166534',
                              opacity: state === 'fade' ? 0 : 1,
                              transition: 'opacity 800ms ease',
                            }}
                          >
                            複製成功
                          </span>
                        )
                      })()}
                    </div>
                    <div><b>Email：</b>{x.candidate_email}</div>
                    <div><b>備註：</b>{x.remarks?.trim() ? x.remarks : '—'}</div>
                    <div><b>職種：</b>{x.job_title || x.job_opening_id}</div>
                    <div><b>fit_score：</b>{x.fit_score}%</div>
                    <div><b>summary：</b>{x.summary || '-'}</div>
                    <div>
                      <b>特別注意：</b>
                      {Array.isArray(x.special_attention) && x.special_attention.length > 0
                        ? x.special_attention.join('；')
                        : '—'}
                    </div>
                    <div>
                      <b>非職務上經歷：</b>
                      {Array.isArray(x.non_job_experience) && x.non_job_experience.length > 0
                        ? x.non_job_experience.join('；')
                        : '—'}
                    </div>
                    <div>
                      <b>criteria：</b>
                      <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
                        {Array.isArray(x.criteria_results) && x.criteria_results.length > 0 ? (
                          x.criteria_results.map((c: any, idx: number) => (
                            <div key={`${x.review_result_id}-${idx}`} style={{ padding: 8, border: '1px solid #999', borderRadius: 6, background: '#fff' }}>
                              <div>
                                <b>{c.name}</b> [{RESUME_REVIEW_LABEL_ZH[c.label as ResumeReviewLabel] ?? c.label}] -{' '}
                                {c.matched ? '符合' : '不符合'}
                              </div>
                              <div>score: {typeof c.score === 'number' ? `${c.score}%` : '-'}</div>
                              <div style={{ color: '#374151' }}>reason: {c.reasoning || '-'}</div>
                            </div>
                          ))
                        ) : (
                          <div>-</div>
                        )}
                      </div>
                    </div>
                    <div><b>時間：</b>{x.created_at}</div>
                  </li>
                ))}
                {reviewResults.length === 0 && <div style={{ padding: 12, border: '2px dashed #000' }}>尚無審查結果</div>}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


