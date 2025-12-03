import React, { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'

type Member = { profile_id: string; company_role: 'admin' | 'recruiter' | 'viewer'; email?: string }
type AIInterviewer = { id: string; name: string; model_name: string; model_config?: any }
type JobOpening = { id: string; job_title: string; use_ai_generate_question?: boolean; result_notification_method?: 'immediate' | 'later'; evaluation_policy?: any }
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
  const [tab, setTab] = useState<'members' | 'ai' | 'jobs' | 'qbank' | 'joq' | 'interviews'>('members')

  // common lists
  const [members, setMembers] = useState<Member[]>([])
  const [aiList, setAiList] = useState<AIInterviewer[]>([])
  const [jobs, setJobs] = useState<JobOpening[]>([])
  const [qb, setQb] = useState<Question[]>([])
  const [joq, setJoq] = useState<JOQ[]>([])
  const [ivs, setIvs] = useState<Interview[]>([])

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
  const criteriaLoadingRef = useRef<Set<string>>(new Set())

  // evaluation policy form state
  const criteriaNames: Record<string, string> = {
    'content_integrity': '內容完整性',
    'logical_clarity': '邏輯清晰度',
    'professional_depth': '專業深度',
    'communication': '溝通能力',
    'personal_attributes': '個人特質'
  }

  const [newJob, setNewJob] = useState({ 
    job_title: '', 
    use_ai_generate_question: false, 
    result_notification_method: 'immediate' as 'immediate' | 'later',
    enableCustomCriteria: false,
    evalPolicy: {
      overall_threshold: '',
      criteria_minimums: {} as Record<string, string>,
      active_criteria: [] as string[]
    },
    customCriteria: [
      { key: 'content_integrity', display_name: '內容完整性', weight: 0.2, max_score: 10, scoring_logic: 'deduction' as const, deduction_rules: '答非所問-2分\n回答不完整-1分', addition_rules: '' },
      { key: 'logical_clarity', display_name: '邏輯清晰度', weight: 0.2, max_score: 10, scoring_logic: 'deduction' as const, deduction_rules: '條理不清-2分\n邏輯錯誤-1分', addition_rules: '' },
      // 專業深度：預設改為綜合制（composite）
      { key: 'professional_depth', display_name: '專業深度', weight: 0.2, max_score: 10, scoring_logic: 'composite' as const, deduction_rules: '專業知識明顯錯誤-2分\n無法舉出實務案例-1分\n只背誦定義缺乏深入思考-1分', addition_rules: '正確回答專業問題+2.5分\n展現深度理解+1分' },
      { key: 'communication', display_name: '溝通能力', weight: 0.2, max_score: 10, scoring_logic: 'deduction' as const, deduction_rules: '表達不清晰-1分\n表達不流暢-1分', addition_rules: '' },
      // 個人特質：預設改為綜合制（composite）
      { key: 'personal_attributes', display_name: '個人特質', weight: 0.2, max_score: 10, scoring_logic: 'composite' as const, deduction_rules: '缺乏企圖心與主動性-2分\n對學習成長明顯消極-1分\n團隊合作態度不佳-2分\n抗壓與面對挫折態度消極-1分', addition_rules: '向上心求知慾+2.5分\n持續學習+2.5分\n活潑外向+2.5分\n堅強抗壓+2.5分' }
    ] as Array<{ key: string; display_name: string; weight: number; max_score: number; scoring_logic: 'addition' | 'deduction' | 'composite'; addition_rules: string; deduction_rules: string }>
  })
  const [editJob, setEditJob] = useState({ 
    job_title: '', 
    use_ai_generate_question: false, 
    result_notification_method: 'immediate' as 'immediate' | 'later',
    enableCustomCriteria: false,
    evalPolicy: {
      overall_threshold: '',
      criteria_minimums: {} as Record<string, string>,
      active_criteria: [] as string[]
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
  const [newIV, setNewIV] = useState({ job_opening_id: '', start_time: '', end_time: '', profiles_id: '', candidate_email: '', review_type: 'AI' as 'AI' | 'HUMAN' | 'MIXED' })

  // edit forms (starts with empty)
  const [editAI, setEditAI] = useState({ name: '', model_name: 'yuki.vrm', model_config: '{}' })
  const [editQB, setEditQB] = useState({ name: '', source: 'USER' as 'USER' | 'AI', questions: [] as string[] })
  const [editJOQ, setEditJOQ] = useState({ job_opening_id: '', question_bank_id: '', questions: [] as string[] })
  const [editIV, setEditIV] = useState({ job_opening_id: '', start_time: '', end_time: '', profiles_id: '', candidate_email: '', review_type: 'AI' as 'AI' | 'HUMAN' | 'MIXED' })

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
        await Promise.all([
          loadMembers(t),
          loadAI(t),
          loadJobs(t),
          loadQB(t),
          loadJOQ(t),
          loadIVs(t)
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
    return tk ? { Authorization: `Bearer ${tk}`, ...extra } : { ...extra }
  }

  // 刷新 token 函數
  const handleTokenRefresh = async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession()
      if (!error && data.session) {
        setToken(data.session.access_token)
        alert('已自動刷新登入狀態，請重試')
        window.location.reload()
      } else {
        alert('登入已過期，正在跳轉到登入頁面...')
        router.push('/me')
      }
    } catch (err) {
      console.error('刷新 token 失敗:', err)
      alert('登入已過期，請重新登入')
      router.push('/me')
    }
  }

  // loaders
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
    const j = await r.json(); setIvs(j.items || [])
  }

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
    e.preventDefault(); if (!newJob.job_title) return
    
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
        evaluation_policy
      }) 
    })
    
    if (r.status === 401 || r.status === 403) {
      await handleTokenRefresh()
      return
    }
    
    const result = await r.json()
    
    // 如果啟用了自訂評估項目，更新 evaluation_criteria
    if (newJob.enableCustomCriteria && result.job_opening_id) {
      // 獲取該職種的 evaluation_criteria
      const criteriaRes = await fetch(
        `/api/evaluation-criteria/list?company_id=${companyId}&job_opening_id=${result.job_opening_id}`,
        { headers: headers(token) }
      )
      const criteriaData = await criteriaRes.json()
      const existingCriteria = criteriaData.items || []
      
      // 更新或創建 evaluation_criteria
      for (let i = 0; i < newJob.customCriteria.length; i++) {
        const customCriteria = newJob.customCriteria[i]
        const existing = existingCriteria[i]
        
        // 轉換規則為 JSONB 格式（字符串數組）
        const additionRulesArray = customCriteria.addition_rules 
          ? customCriteria.addition_rules.split('\n').filter(r => r.trim())
          : null
        const deductionRulesArray = customCriteria.deduction_rules 
          ? customCriteria.deduction_rules.split('\n').filter(r => r.trim())
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
              max_score: customCriteria.max_score,
              scoring_logic: customCriteria.scoring_logic || 'deduction',
              // 綜合制：同時帶入加分與扣分規則
              addition_rules: (customCriteria.scoring_logic === 'addition' || customCriteria.scoring_logic === 'composite') ? additionRulesArray : null,
              deduction_rules: (customCriteria.scoring_logic === 'deduction' || customCriteria.scoring_logic === 'composite') ? deductionRulesArray : null,
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
              max_score: customCriteria.max_score,
              scoring_logic: customCriteria.scoring_logic || 'deduction',
              // 綜合制：同時帶入加分與扣分規則
              addition_rules: (customCriteria.scoring_logic === 'addition' || customCriteria.scoring_logic === 'composite') ? additionRulesArray : null,
              deduction_rules: (customCriteria.scoring_logic === 'deduction' || customCriteria.scoring_logic === 'composite') ? deductionRulesArray : null,
              sort_order: i + 1
            })
          })
        }
      }
      
      // 刪除多餘的 criteria
      if (existingCriteria.length > newJob.customCriteria.length) {
        for (let i = newJob.customCriteria.length; i < existingCriteria.length; i++) {
          await fetch('/api/evaluation-criteria/delete', {
            method: 'POST',
            headers: headers(token, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              id: existingCriteria[i].id,
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
      enableCustomCriteria: false,
      evalPolicy: {
        overall_threshold: '',
        criteria_minimums: {},
        active_criteria: []
      },
      customCriteria: [
        { key: 'content_integrity', display_name: '內容完整性', weight: 0.2, max_score: 10, scoring_logic: 'deduction' as const, deduction_rules: '答非所問-2分\n回答不完整-1分', addition_rules: '' },
        { key: 'logical_clarity', display_name: '邏輯清晰度', weight: 0.2, max_score: 10, scoring_logic: 'deduction' as const, deduction_rules: '條理不清-2分\n邏輯錯誤-1分', addition_rules: '' },
        // 專業深度：預設改為綜合制（composite）
        { key: 'professional_depth', display_name: '專業深度', weight: 0.2, max_score: 10, scoring_logic: 'composite' as const, deduction_rules: '專業知識明顯錯誤-2分\n無法舉出實務案例-1分\n只背誦定義缺乏深入思考-1分', addition_rules: '正確回答專業問題+2.5分\n展現深度理解+1分' },
        { key: 'communication', display_name: '溝通能力', weight: 0.2, max_score: 10, scoring_logic: 'deduction' as const, deduction_rules: '表達不清晰-1分\n表達不流暢-1分', addition_rules: '' },
        // 個人特質：預設改為綜合制（composite）
        { key: 'personal_attributes', display_name: '個人特質', weight: 0.2, max_score: 10, scoring_logic: 'composite' as const, deduction_rules: '缺乏企圖心與主動性-2分\n對學習成長明顯消極-1分\n團隊合作態度不佳-2分\n抗壓與面對挫折態度消極-1分', addition_rules: '向上心求知慾+2.5分\n持續學習+2.5分\n活潑外向+2.5分\n堅強抗壓+2.5分' }
      ]
    })
    await loadJobs(token)
  }
  const addQB = async (e: React.FormEvent) => {
    e.preventDefault(); 
    if (!newQB.name) {
      alert('請輸入題庫名稱')
      return
    }
    if (newQB.questions.length === 0) {
      alert('請至少新增一個問題')
      return
    }
    
    // 將問題列表轉換為 JSON 格式
    const detail = {
      questions: newQB.questions.filter(q => q.trim())
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
    if (newJOQ.questions.length === 0) {
      alert('請至少新增一個問題')
      return
    }
    
    // 將問題列表轉換為 JSON 格式
    const detail = {
      questions: newJOQ.questions.filter(q => q.trim())
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
    
    setNewJOQ({ job_opening_id: '', question_bank_id: '', questions: [], showForm: false })
    await loadJOQ(token)
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
      } else if (result.error === 'CREATE_FAILED') {
        errorMsg = '建立失敗，請確認輸入的資料是否正確'
      }
      alert(errorMsg)
      return
    }
    
    setNewIV({ job_opening_id: '', start_time: '', end_time: '', profiles_id: '', candidate_email: '', review_type: 'AI' }); 
    await loadIVs(token)
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
        alert(j.error || '評價失敗')
        return
      }
      alert(result === 'hired' ? '已標記為錄取' : '已標記為拒絕')
      setReviewingIV(null)
      await loadIVs(token)
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
        evaluation_policy 
      }) 
    })
    
    if (!r.ok) {
      const errorData = await r.json()
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
          max_score: criteria.max_score,
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
            max_score: c.max_score,
            scoring_logic: c.scoring_logic || 'deduction',
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
      review_type: ((item as any).review_type as 'AI' | 'HUMAN' | 'MIXED') || 'AI',
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
      items.forEach((c: any) => {
        if (c && c.key && c.display_name) {
          map[c.key] = c.display_name
        }
      })
      setCriteriaDisplayNames(prev => ({
        ...prev,
        [jobOpeningId]: map
      }))
    } catch (error) {
      console.error('載入 evaluation_criteria 失敗:', error)
    } finally {
      criteriaLoadingRef.current.delete(jobOpeningId)
    }
  }

  const formatInterviewStatus = (status?: Interview['status']) => {
    if (status === 'waitToStart') return '等待開始'
    if (status === 'completed') return '已完成'
    if (status === 'lateButComplete') return '延遲但完成'
    if (status === 'noShow') return '未出席'
    if (status === 'cancelled') return '已取消'
    return status || '未知狀態'
  }

  const formatInterviewResult = (result?: 'hired' | 'rejected' | 'onHold' | null) => {
    if (result === 'hired') return '錄取'
    if (result === 'rejected') return '拒絕'
    if (result === 'onHold') return '保留觀察'
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
    return reason
  }

  const tabBtn = (k: typeof tab, label: string) => (
    <button onClick={() => setTab(k)} style={{ padding: '8px 12px', borderBottom: tab === k ? '2px solid #111' : '2px solid transparent' }}>{label}</button>
  )

  return (
    <div style={{ maxWidth: 1100, margin: '36px auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid #e5e7eb' }}>
        {tabBtn('members', '成員')}
        {tabBtn('ai', 'AI面試官')}
        {tabBtn('jobs', '職種')}
          {tabBtn('qbank', '共用題庫')}
        {tabBtn('joq', '職種個別題庫')}
        {tabBtn('interviews', '面試管理')}
        </div>
        <button onClick={handleTokenRefresh} style={{ padding: '8px 16px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          刷新登入
        </button>
      </div>

      {tab === 'members' && (
        <div>
          <form onSubmit={addMember} style={{ display: 'grid', gap: 12, padding: 12, border: '2px solid #000', background: '#e6f2ff', borderRadius: 8 }}>
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
          <form onSubmit={addJob} style={{ display: 'grid', gap: 12, padding: 12, border: '2px solid #000', background: '#e6f2ff', borderRadius: 8 }}>
            <input placeholder="職種名稱" value={newJob.job_title} onChange={(e) => setNewJob({ ...newJob, job_title: e.target.value })} style={{ padding: 8, border: '2px solid #000' }} />
            
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={newJob.use_ai_generate_question} onChange={(e) => setNewJob({ ...newJob, use_ai_generate_question: e.target.checked })} />
              <span>使用 AI 生成問題</span>
            </label>
            
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
                        {isActive && (
                          <input
                            type="number"
                            min="0"
                            max="100"
                            placeholder={`例如：60`}
                            value={newJob.evalPolicy.criteria_minimums[key] || ''}
                            onChange={(e) => setNewJob({
                              ...newJob,
                              evalPolicy: {
                                ...newJob.evalPolicy,
                                criteria_minimums: { ...newJob.evalPolicy.criteria_minimums, [key]: e.target.value }
                              }
                            })}
                            style={{ padding: 6, border: '1px solid #ccc', borderRadius: 4 }}
                          />
                        )}
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
                          <th style={{ padding: 8, textAlign: 'left' }}>Weight (0-1)</th>
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
                                  value={criteria.max_score}
                                  onChange={(e) => {
                                    const updated = [...newJob.customCriteria]
                                    updated[idx] = { ...criteria, max_score: parseInt(e.target.value) || 10 }
                                    setNewJob({ ...newJob, customCriteria: updated })
                                  }}
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
                                      value={criteria.scoring_logic || 'deduction'}
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
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="checkbox" checked={editJob.use_ai_generate_question} onChange={(e) => setEditJob({ ...editJob, use_ai_generate_question: e.target.checked })} />
                      <span>使用 AI 生成問題</span>
                    </label>
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
                                {isActive && (
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    placeholder={`例如：60`}
                                    value={editJob.evalPolicy.criteria_minimums[key] || ''}
                                    onChange={(e) => setEditJob({
                                      ...editJob,
                                      evalPolicy: {
                                        ...editJob.evalPolicy,
                                        criteria_minimums: { ...editJob.evalPolicy.criteria_minimums, [key]: e.target.value }
                                      }
                                    })}
                                    style={{ padding: 6, border: '1px solid #ccc', borderRadius: 4 }}
                                  />
                                )}
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
                                  { key: 'content_integrity', display_name: '內容完整性', weight: 0.2, max_score: 10, scoring_logic: 'deduction' as const, deduction_rules: '答非所問-2分\n回答不完整-1分', addition_rules: '' },
                                  { key: 'logical_clarity', display_name: '邏輯清晰度', weight: 0.2, max_score: 10, scoring_logic: 'deduction' as const, deduction_rules: '條理不清-2分\n邏輯錯誤-1分', addition_rules: '' },
                                  { key: 'professional_depth', display_name: '專業深度', weight: 0.2, max_score: 10, scoring_logic: 'addition' as const, deduction_rules: '', addition_rules: '正確回答專業問題+2.5分\n展現深度理解+1分' },
                                  { key: 'communication', display_name: '溝通能力', weight: 0.2, max_score: 10, scoring_logic: 'deduction' as const, deduction_rules: '表達不清晰-1分\n表達不流暢-1分', addition_rules: '' },
                                  { key: 'personal_attributes', display_name: '個人特質', weight: 0.2, max_score: 10, scoring_logic: 'addition' as const, deduction_rules: '', addition_rules: '向上心求知慾+2.5分\n持續學習+2.5分\n活潑外向+2.5分\n堅強抗壓+2.5分' }
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
                                <th style={{ padding: 8, textAlign: 'left' }}>Weight (0-1)</th>
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
                                        value={criteria.max_score}
                                        onChange={(e) => {
                                          const updated = [...editJob.customCriteria]
                                          updated[idx] = { ...criteria, max_score: parseInt(e.target.value) || 10 }
                                          setEditJob({ ...editJob, customCriteria: updated })
                                        }}
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
                                            value={criteria.scoring_logic || 'deduction'}
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
              onClick={() => setNewJOQ({ ...newJOQ, showForm: true, questions: [''] })} 
              style={{ padding: '10px 16px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', marginBottom: 12 }}
            >
              + 新增職種個別題庫
            </button>
          ) : (
          <form onSubmit={addJOQ} style={{ display: 'grid', gap: 12, padding: 12, border: '2px solid #000', background: '#e6f2ff', borderRadius: 8 }}>
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
                <button
                  type="button"
                  onClick={() => setNewJOQ({ ...newJOQ, questions: [...newJOQ.questions, ''] })}
                  style={{ padding: '4px 8px', background: '#2196F3', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                >
                  + 新增問題
                </button>
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
                              <button
                                type="button"
                                onClick={() => setEditJOQ({ ...editJOQ, questions: [...editJOQ.questions, ''] })}
                                style={{ padding: '4px 8px', background: '#2196F3', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                              >
                                + 新增問題
                              </button>
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
            <button type="submit" style={{ padding: '8px 12px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: 4 }}>新增面試</button>
          </form>
          <ul style={{ marginTop: 12 }}>
            {ivs.map((iv) => {
            const job = jobs.find(j => j.id === iv.job_opening_id)
            return (
              <li key={iv.id} style={{ padding: 12, border: '2px solid #000', background: editingIV === iv.id ? '#fff9e6' : '#e6f2ff', borderRadius: 6, marginBottom: 8 }}>
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

                        return (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                              <div style={{ flex: 1, minWidth: 250 }}>
                                <div style={{ fontWeight: 'bold' }}>職種: {job?.job_title || iv.job_opening_id}</div>
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
                                  onClick={() => {
                                    if (expandedIV === iv.id) {
                                      setExpandedIV(null)
                                    } else {
                                      setExpandedIV(iv.id)
                                      if (!criteriaDisplayNames[iv.job_opening_id]) {
                                        void ensureCriteriaDisplayNames(iv.job_opening_id)
                                      }
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
                                            maxHeight: 260,
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
                                            const hasCurrentScores =
                                              t.current_scores &&
                                              typeof t.current_scores === 'object' &&
                                              Object.keys(t.current_scores).length > 0
                                            const hasPersonality = t.personality && typeof t.personality === 'object'

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

                                                {hasPersonality && (
                                                  <div style={{ marginTop: 4 }}>
                                                    <span style={{ fontWeight: 'bold' }}>人格分析：</span>
                                                    <div style={{ marginLeft: 12 }}>
                                                      {t.personality.summaryText && (
                                                        <div>總結：{t.personality.summaryText}</div>
                                                      )}
                                                      {t.personality.extraversion && (
                                                        <div>外向傾向：{t.personality.extraversion}</div>
                                                      )}
                                                      {t.personality.conscientiousness && (
                                                        <div>盡責程度：{t.personality.conscientiousness}</div>
                                                      )}
                                                      {t.personality.detail_attentiveness && (
                                                        <div>細心程度：{t.personality.detail_attentiveness}</div>
                                                      )}
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            )
                                          })}
                                        </div>
                                      ) : (
                                        <span>尚無面試對話紀錄</span>
                                      )}
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
    </div>
  )
}


