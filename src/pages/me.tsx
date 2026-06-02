import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'
import { GuidedOverlay } from '@/components/tutorial/GuidedOverlay'

type TosResp = { accepted: boolean; version: string | null; accepted_at?: string }

type SubscriptionInfo = {
  status: 'free_testing' | 'none' | 'active' | 'past_due' | 'canceled'
  planName: string
  amountTwd: number | null
  billingCycle: 'monthly' | 'yearly' | null
  nextBillingDate: string | null
  currentPeriodEnd: string | null
  monthlyTokenRemaining?: number | null
  estimatedRemainingInterviews?: number | null
  requiredTokensForNewInterview?: number | null
  paymentMethodLabel: string | null
  cardStatus: 'none' | 'active' | 'card_update_required'
  cancelAtPeriodEnd: boolean
  canSubscribe: boolean
  canModifyPayment: boolean
  canCancel: boolean
  message: string
}

type InterviewCreditsInfo = {
  balance: {
    purchased_credits_remaining: number
    purchased_tokens_remaining: number
  }
  credits: {
    availableTokens: number
    estimatedRemainingInterviews: number
    requiredTokensForNewInterview: number
    historicalMaxInterviewTokens: number
    defaultEstimatedInterviewTokens: number
  }
  packages: Array<{
    id: string
    code: string
    name: string
    price_twd: number
    interview_count: number
    per_interview_token_cap: number
    token_amount: number
    is_active: boolean
  }>
  recent_purchases: Array<{
    id: string
    merchant_order_no: string
    amount: number
    interview_count: number
    token_amount: number
    status: string
    created_at: string
    updated_at: string
  }>
}

const formatTokens = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value >= 1000) return `${Math.floor(value / 1000).toLocaleString('zh-TW')}K`
  return value.toLocaleString('zh-TW')
}

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

export default function MePage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [familyName, setFamilyName] = useState<string>('')
  const [givenName, setGivenName] = useState<string>('')
  const [profileId, setProfileId] = useState<string>('')
  const [userRole, setUserRole] = useState<'jobSeeker' | 'recruiter' | null>(null)
  const [alreadyTeach, setAlreadyTeach] = useState<boolean | null>(null)
  const [preferredLanguage, setPreferredLanguage] = useState<'zh-TW' | 'en-US' | 'ja-JP'>('zh-TW')
  const [savingPreferredLanguage, setSavingPreferredLanguage] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tos, setTos] = useState<TosResp | null>(null)
  const [activeTab, setActiveTab] = useState<'profile' | 'company' | 'interviews' | 'subscription'>('profile')
  const [tabInitialized, setTabInitialized] = useState(false)
  const [companies, setCompanies] = useState<any[]>([])
  const [interviews, setInterviews] = useState<any[]>([])
  const [readInterviewIds, setReadInterviewIds] = useState<Set<string>>(new Set())
  const [accessToken, setAccessToken] = useState<string>('')
  const [centerNotice, setCenterNotice] = useState<string>('')
  const [quotaInfo, setQuotaInfo] = useState<{ remaining: number; used_count: number; free_quota: number } | null>(null)
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null)
  const [subscriptionLoading, setSubscriptionLoading] = useState(false)
  const [subscriptionError, setSubscriptionError] = useState<string>('')
  const [creditsInfo, setCreditsInfo] = useState<InterviewCreditsInfo | null>(null)
  const [creditsLoading, setCreditsLoading] = useState(false)
  const [creditsError, setCreditsError] = useState<string>('')
  const [purchaseCreating, setPurchaseCreating] = useState(false)
  const [startInterviewModal, setStartInterviewModal] = useState<{
    open: boolean
    interviewId: string | null
  }>({ open: false, interviewId: null })
  const [startingInterview, setStartingInterview] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [tutorial, setTutorial] = useState<RecruiterTutorialState>({ active: false, step: 0, companyId: null })
  const [form, setForm] = useState({
    company_name: '',
    company_phone_number: '',
    company_address: '',
    company_profile: '',
    ideal_candidate_profile: ''
  })
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<any>({ id: '', company_name: '', company_phone_number: '', company_address: '', company_profile: '', ideal_candidate_profile: '' })
  const tutorialHydratedStepRef = useRef<number | null>(null)

  const handleLogout = async () => {
    if (!confirm('確定要登出嗎？')) return
    const { error } = await supabase.auth.signOut()
    if (error) {
      alert('登出失敗：' + error.message)
      return
    }
    window.location.href = '/login'
  }

  // 處理 URL 參數中的 tab（在客戶端初始化時讀取）
  useEffect(() => {
    if (!tabInitialized) {
      // 先從 window.location 讀取（客戶端立即可用）
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        const tab = params.get('tab')
        if (tab === 'interviews' || tab === 'profile' || tab === 'company' || tab === 'subscription' || tab === 'credits') {
          setActiveTab(tab === 'credits' ? 'subscription' : tab)
          setTabInitialized(true)
          return
        }
      }
      // 如果 window 不可用，等待 router 準備好
      if (router.isReady) {
        const tabParam = router.query.tab as string | undefined
        if (tabParam === 'interviews' || tabParam === 'profile' || tabParam === 'company' || tabParam === 'subscription' || tabParam === 'credits') {
          setActiveTab(tabParam === 'credits' ? 'subscription' : tabParam)
        }
        setTabInitialized(true)
      }
    } else if (router.isReady) {
      // router 準備好後，如果 URL 參數改變，更新 tab
      const tabParam = router.query.tab as string | undefined
      if (tabParam === 'interviews' || tabParam === 'profile' || tabParam === 'company' || tabParam === 'subscription' || tabParam === 'credits') {
        setActiveTab(tabParam === 'credits' ? 'subscription' : tabParam)
      }
    }
  }, [router.isReady, router.query.tab, tabInitialized])

  // 當切換到面試標籤時（無論是從 URL 參數還是點擊按鈕），標記所有為已讀
  useEffect(() => {
    if (activeTab === 'interviews' && interviews.length > 0) {
      setReadInterviewIds(prevReadIds => {
        const newReadIds = new Set(prevReadIds)
        let hasNew = false
        interviews.forEach(iv => {
          if (!newReadIds.has(iv.id)) {
            newReadIds.add(iv.id)
            hasNew = true
          }
        })
        if (hasNew && typeof window !== 'undefined') {
          localStorage.setItem('read_interview_ids', JSON.stringify(Array.from(newReadIds)))
        }
        return newReadIds
      })
    }
  }, [activeTab, interviews])

  useEffect(() => {
    let unsub: { unsubscribe: () => void } | null = null
    let cancelled = false

    const init = async (sessionOverride?: any) => {
      if (cancelled) return
      // 先讀 localStorage（可在 profile 尚未載入前就恢復教學狀態）
      const saved = loadTutorialState()
      if (saved?.active) setTutorial(saved)

      const sess = sessionOverride ?? (await supabase.auth.getSession()).data.session
      const token = sess?.access_token
      setEmail(sess?.user?.email || '')
      let loadedRole: 'jobSeeker' | 'recruiter' | null = null
      
      // 獲取 profile ID 和 role
      if (token && sess?.user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, role, preferred_language, already_teach, family_name, given_name')
          .eq('auth_id', sess.user.id)
          .single()
        
        if (profile?.id) {
          setProfileId(profile.id)
        }
        setFamilyName(typeof (profile as any)?.family_name === 'string' ? (profile as any).family_name : '')
        setGivenName(typeof (profile as any)?.given_name === 'string' ? (profile as any).given_name : '')
        if (profile?.role) {
          loadedRole = profile.role as 'jobSeeker' | 'recruiter'
          setUserRole(profile.role as 'jobSeeker' | 'recruiter')
          // 不需要在這裡設定預設 tab，因為已經在初始化時從 URL 讀取了
          // 如果沒有 URL 參數，getInitialTab() 已經返回 'profile' 作為預設值
        }
        if (profile?.preferred_language) {
          setPreferredLanguage(
            profile.preferred_language as 'zh-TW' | 'en-US' | 'ja-JP'
          )
        }
        if (typeof profile?.already_teach === 'boolean') {
          setAlreadyTeach(profile.already_teach)
        } else {
          setAlreadyTeach(false)
        }
      }
      
      if (token) {
        const resp = await fetch('/api/me/tos', { headers: { 'x-supabase-token': token } })
        const json = (await resp.json()) as TosResp
        setTos(json)
        if (!json.accepted) {
          window.location.href = '/tos'
          return
        }

        // MFA 未完成則強制導去設定頁（首次登入 gate）
        const mfaResp = await fetch('/api/me/mfa', { headers: { 'x-supabase-token': token } })
        const mfaJson = await mfaResp.json()
        if (mfaResp.ok && mfaJson && mfaJson.mfa_enabled === false) {
          window.location.href = '/mfa/setup'
          return
        }
      }
      if (token) setAccessToken(token)

      // jobSeeker：顯示剩餘免費次數（free_quota - used_count）
      if (token) {
        try {
          const r = await fetch('/api/me/quota', { headers: { 'x-supabase-token': token } })
          const j = await r.json()
          if (r.ok && j?.ok) {
            setQuotaInfo({ remaining: j.remaining, used_count: j.used_count, free_quota: j.free_quota })
          }
        } catch {
          // ignore
        }
      }

      if (token && loadedRole === 'recruiter') {
        await loadSubscription(token)
        await loadInterviewCredits(token)
      }

      await loadCompanies(token || '')
      await loadInterviews(token || '')
      
      // 從 localStorage 讀取已讀面試 ID
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('read_interview_ids')
        if (saved) {
          try {
            setReadInterviewIds(new Set(JSON.parse(saved)))
          } catch (e) {
            // ignore
          }
        }
      }
    }

    // 先跑一次（有些情況下 session 還未同步，會在 auth state change 再補跑）
    init()

    // MFA 完成跳轉回來時，session 可能晚一步才可用：訂閱 auth state 變化後重跑 init
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // session 一旦到位就重跑，避免必須刷新才看到 recruiter 教學提示
      if (session?.access_token) init(session)
    })
    unsub = data.subscription

    return () => {
      cancelled = true
      try {
        unsub?.unsubscribe()
      } catch {
        // ignore
      }
    }
  }, [router.isReady])

  // recruiter 且未看過教學：如果不在教學流程中，就先顯示「準備開始」提示
  useEffect(() => {
    if (userRole !== 'recruiter') return
    if (alreadyTeach !== false) return
    const saved = loadTutorialState()
    if (saved?.active) return
    // 用 step=0 表示「準備開始」狀態（仍可刷新延續）
    const next: RecruiterTutorialState = { active: true, step: 0, companyId: null, startedAt: new Date().toISOString() }
    setTutorial(next)
    saveTutorialState(next)
  }, [userRole, alreadyTeach])

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

  const startTutorial = async () => {
    if (!profileId) {
      // 理論上不會發生；保險起見
      advanceTutorial(1)
      return
    }
    try {
      const { error } = await supabase.from('profiles').update({ already_teach: true }).eq('id', profileId)
      if (error) {
        // 不阻擋教學啟動
        console.warn('failed to update already_teach:', error.message)
      } else {
        setAlreadyTeach(true)
      }
    } catch {
      // ignore
    }
    advanceTutorial(1)
  }

  const restartTutorial = () => {
    const next: RecruiterTutorialState = { active: true, step: 0, companyId: null, startedAt: new Date().toISOString() }
    setTutorial(next)
    saveTutorialState(next)
  }

  const isTutorialActive = tutorial.active && tutorial.step > 0
  const isTutorialPrompt = tutorial.active && tutorial.step === 0

  const loadSubscription = async (token: string) => {
    if (!token) return
    setSubscriptionLoading(true)
    setSubscriptionError('')
    try {
      const response = await fetch('/api/subscriptions/me', {
        headers: { 'x-supabase-token': token },
      })
      const body = await response.json()
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error || 'SUBSCRIPTION_LOAD_FAILED')
      }
      setSubscriptionInfo(body.subscription as SubscriptionInfo)
    } catch (err) {
      setSubscriptionError('訂閱狀態暫時無法讀取，請稍後再試。')
    } finally {
      setSubscriptionLoading(false)
    }
  }

  const normalizeCreditsInfo = (body: any): InterviewCreditsInfo => ({
    balance: {
      purchased_credits_remaining: Number(
        body?.balance?.purchased_credits_remaining ??
          body?.credits?.purchasedCreditsRemaining ??
          0
      ),
      purchased_tokens_remaining: Number(
        body?.balance?.purchased_tokens_remaining ??
          body?.credits?.purchasedTokensRemaining ??
          body?.credits?.availableTokens ??
          0
      ),
    },
    credits: {
      availableTokens: Number(
        body?.credits?.availableTokens ??
          body?.balance?.purchased_tokens_remaining ??
          0
      ),
      estimatedRemainingInterviews: Number(
        body?.credits?.estimatedRemainingInterviews || 0
      ),
      requiredTokensForNewInterview: Number(
        body?.credits?.requiredTokensForNewInterview || 0
      ),
      historicalMaxInterviewTokens: Number(
        body?.credits?.historicalMaxInterviewTokens || 0
      ),
      defaultEstimatedInterviewTokens: Number(
        body?.credits?.defaultEstimatedInterviewTokens || 0
      ),
    },
    packages: ((body?.packages as any[]) || []).map((pkg) => ({
      id: pkg.id,
      code: pkg.code,
      name: pkg.name,
      price_twd: Number(pkg.price_twd ?? pkg.priceTwd ?? 0),
      interview_count: Number(pkg.interview_count ?? pkg.interviewCount ?? 0),
      per_interview_token_cap: Number(
        pkg.per_interview_token_cap ?? pkg.perInterviewTokenCap ?? 0
      ),
      token_amount: Number(pkg.token_amount ?? pkg.tokenAmount ?? 0),
      is_active: pkg.is_active !== false,
    })),
    recent_purchases: ((body?.recent_purchases as any[]) || []).map((purchase) => ({
      id: purchase.id,
      merchant_order_no: purchase.merchant_order_no,
      amount: Number(purchase.amount || 0),
      interview_count: Number(purchase.interview_count || 0),
      token_amount: Number(purchase.token_amount || 0),
      status: purchase.status,
      created_at: purchase.created_at,
      updated_at: purchase.updated_at,
    })),
  })

  const loadInterviewCredits = async (token: string) => {
    if (!token) return
    setCreditsLoading(true)
    setCreditsError('')
    try {
      const response = await fetch('/api/interview-credits/me', {
        headers: { 'x-supabase-token': token },
      })
      const body = await response.json()
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error || 'CREDITS_LOAD_FAILED')
      }
      setCreditsInfo(normalizeCreditsInfo(body))
    } catch {
      setCreditsError('TOKEN 方案暫時無法讀取，請稍後再試。')
    } finally {
      setCreditsLoading(false)
    }
  }

  const postToNewebPay = (
    gatewayUrl: string,
    fields: Record<string, string>
  ) => {
    const formEl = document.createElement('form')
    formEl.method = 'POST'
    formEl.action = gatewayUrl
    formEl.style.display = 'none'
    Object.entries(fields).forEach(([key, value]) => {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = key
      input.value = value
      formEl.appendChild(input)
    })
    document.body.appendChild(formEl)
    formEl.submit()
  }

  const handlePurchaseCredits = async (packageId: string) => {
    if (!accessToken || purchaseCreating) return
    const companyId = companies[0]?.id
    if (!companyId) {
      setCenterNotice('請先建立或加入公司後再購買 TOKEN 方案。')
      return
    }

    setPurchaseCreating(true)
    try {
      const response = await fetch('/api/interview-credit-purchases/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-supabase-token': accessToken,
        },
        body: JSON.stringify({ company_id: companyId, package_id: packageId }),
      })
      const body = await response.json()
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error || 'CREATE_PURCHASE_FAILED')
      }
      const gatewayUrl = body.gateway_url || body.gatewayUrl
      const fields = body.form_fields || body.fields
      if (!gatewayUrl || !fields) throw new Error('INVALID_PAYMENT_FIELDS')
      postToNewebPay(gatewayUrl, fields)
    } catch {
      setCenterNotice('建立付款訂單失敗，請稍後再試。')
      setPurchaseCreating(false)
    }
  }

  const shouldPrefillCompanyForm = userRole === 'recruiter' && isTutorialActive && tutorial.step === 2
  const prefillCompanyForm = () => {
    setForm({
      company_name: '範例：AITuber Inc.',
      company_phone_number: '02-1234-5678',
      company_address: '台北市中山區範例路 100 號',
      company_profile: '我們是一家專注於 AI 面試與招募流程自動化的公司，致力於提升面試效率與品質。',
      ideal_candidate_profile: '具備良好溝通能力、學習力與團隊合作精神，願意在快速迭代的環境中成長。',
    })
  }

  // 教學狀態復原：重整/重啟後，依 step 把 UI 帶回「該 step 的標準起始狀態」
  useEffect(() => {
    if (userRole !== 'recruiter') return
    if (!tutorial.active) return
    if (tutorial.step < 1 || tutorial.step > 4) return

    // 避免每次 render 都硬覆寫 UI；只在 step 第一次進入/從 storage 恢復時做一次
    if (tutorialHydratedStepRef.current === tutorial.step) return
    tutorialHydratedStepRef.current = tutorial.step

    const empty = {
      company_name: '',
      company_phone_number: '',
      company_address: '',
      company_profile: '',
      ideal_candidate_profile: '',
    }

    if (tutorial.step === 1) {
      // step1：重點是「公司 tab」，保持在個人頁也可以；確保建立表單不會意外打開
      setShowCreateForm(false)
      setForm(empty)
      return
    }

    // step2~4：都需要在公司 tab 才是正確起始狀態
    setActiveTab('company')

    if (tutorial.step === 2) {
      setShowCreateForm(false)
      setForm(empty)
      return
    }

    if (tutorial.step === 3) {
      setShowCreateForm(true)
      prefillCompanyForm()
      return
    }

    if (tutorial.step === 4) {
      setShowCreateForm(false)
      setForm(empty)
    }
  }, [tutorial.active, tutorial.step, userRole, prefillCompanyForm])

  const loadCompanies = async (token?: string) => {
    const r = await fetch('/api/company/list', { headers: token ? { 'x-supabase-token': token } : {} })
    const j = await r.json()
    setCompanies(j.items || [])
  }

  const loadInterviews = async (token?: string) => {
    const r = await fetch('/api/interviews/my-interviews', { headers: token ? { 'x-supabase-token': token } : {} })
    const j = await r.json()
    setInterviews(j.items || [])
  }

  const handleSavePreferredLanguage = async () => {
    if (!profileId) return
    setSavingPreferredLanguage(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ preferred_language: preferredLanguage })
        .eq('id', profileId)
      if (error) {
        alert('更新偏好語言失敗：' + error.message)
        return
      }
      alert('偏好面試語言已更新')
    } catch (e: any) {
      alert('更新偏好語言時發生錯誤')
    } finally {
      setSavingPreferredLanguage(false)
    }
  }

  const markInterviewAsRead = (interviewId: string) => {
    const newReadIds = new Set(readInterviewIds)
    newReadIds.add(interviewId)
    setReadInterviewIds(newReadIds)
    if (typeof window !== 'undefined') {
      localStorage.setItem('read_interview_ids', JSON.stringify(Array.from(newReadIds)))
    }
  }

  const canStartInterview = (startTime: string) => {
    return new Date() >= new Date(startTime)
  }

  const getUnreadCount = () => {
    return interviews.filter(iv => !readInterviewIds.has(iv.id) && iv.status === 'waitToStart').length
  }

  const handleStartInterview = (interviewId: string) => {
    const run = async () => {
      if (!accessToken) {
        window.location.href = '/login'
        return
      }

      // 先做 server-side gate 檢查（不扣點），避免 quota 用完還先跳轉到面試頁再被擋回來
      try {
        const r = await fetch(`/api/interviews/get?interview_id=${encodeURIComponent(interviewId)}`, {
          headers: { 'x-supabase-token': accessToken },
        })
        if (!r.ok) {
          const err = await r.json().catch(() => ({}))
          if (err?.error === 'FREE_QUOTA_EXCEEDED') {
            setCenterNotice('免費使用次數已用完，若需要再次使用請參考月費方案。')
            return
          }
          if (err?.error === 'MFA_REQUIRED') {
            window.location.href = '/mfa/setup'
            return
          }
          setCenterNotice('目前無法開始面試，請稍後再試。')
          return
        }
      } catch {
        setCenterNotice('目前無法開始面試，請稍後再試。')
        return
      }

      setStartInterviewModal({ open: true, interviewId })
    }
    run()
  }

  const handleConfirmStartInterview = async () => {
    const interviewId = startInterviewModal.interviewId
    if (!interviewId || !accessToken || startingInterview) return
    setStartingInterview(true)
    try {
      const startResp = await fetch('/api/interviews/start-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-supabase-token': accessToken },
        body: JSON.stringify({ interviews_id: interviewId }),
      })
      if (!startResp.ok) {
        const err = await startResp.json().catch(() => ({}))
        if (err?.error === 'MFA_REQUIRED') {
          window.location.href = '/mfa/setup'
          return
        }
        if (err?.error === 'FREE_QUOTA_EXCEEDED') {
          setCenterNotice('免費使用次數已用完，若需要再次使用請參考月費方案。')
          return
        }
        if (err?.error === 'INTERVIEW_NOT_STARTABLE') {
          setCenterNotice('此面試已無法開始（可能已完成/取消/超時）。')
          return
        }
        setCenterNotice(err?.message || '開始面試失敗，請稍後再試。')
        return
      }

      // 同步剩餘次數（若後端有回傳 usage）
      try {
        const body = await startResp.json().catch(() => ({}))
        const usage = body?.usage
        if (usage && typeof usage.used_count === 'number' && typeof usage.free_quota === 'number') {
          const remaining = Math.max(0, usage.free_quota - usage.used_count)
          setQuotaInfo({ remaining, used_count: usage.used_count, free_quota: usage.free_quota })
        }
      } catch {
        // ignore
      }

      setStartInterviewModal({ open: false, interviewId: null })
      markInterviewAsRead(interviewId)
      window.location.href = `/interview?interview_id=${interviewId}`
    } finally {
      setStartingInterview(false)
    }
  }

  const handleCancelStartInterview = () => {
    if (startingInterview) return
    setStartInterviewModal({ open: false, interviewId: null })
  }

  const startEdit = (c: any) => {
    setEditForm({
      id: c.id,
      company_name: c.company_name || '',
      company_phone_number: c.company_phone_number || '',
      company_address: c.company_address || '',
      company_profile: c.company_profile || '',
      ideal_candidate_profile: c.ideal_candidate_profile || ''
    })
    setEditing(true)
  }

  const onUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken || !editForm.id) return
    const r = await fetch('/api/company/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-supabase-token': accessToken },
      body: JSON.stringify(editForm)
    })
      if (!r.ok) {
      alert('更新失敗')
      return
    }
    setEditing(false)
    await loadCompanies(accessToken)
  }

  const onDeleteCompany = async (id: string) => {
    if (!accessToken) return
    if (!confirm('確定要刪除嗎？此操作無法復原。')) return
    const r = await fetch('/api/company/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-supabase-token': accessToken },
      body: JSON.stringify({ id })
    })
    if (!r.ok) {
      alert('刪除失敗')
      return
    }
    await loadCompanies(accessToken)
  }
  const onCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.company_name.trim()) return
    if (!accessToken) {
      alert('未登入或權限不足')
      return
    }
    setCreating(true)
    try {
      const r = await fetch('/api/company/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-supabase-token': accessToken },
        body: JSON.stringify(form)
      })
      if (!r.ok) {
        const errorData = await r.json().catch(() => ({}))
        if (errorData.error === 'ONLY_RECRUITER_CAN_CREATE_COMPANY') {
          alert('只有招募方（recruiter）可以建立公司')
        } else {
          alert('建立失敗')
        }
        return
      }
      const okJson = await r.json().catch(() => ({}))
      const createdCompanyId = okJson?.company_id as string | undefined
      setShowCreateForm(false)
      setForm({ company_name: '', company_phone_number: '', company_address: '', company_profile: '', ideal_candidate_profile: '' })
      await loadCompanies(accessToken)
      if (createdCompanyId && isTutorialActive && tutorial.step === 3) {
        // 等公司清單載入/DOM render 後再進入 step4，避免目標連結尚未出現就被遮罩卡住
        advanceTutorial(4, { companyId: createdCompanyId })
      }
    } catch (err) {
      alert('建立失敗')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: '36px auto', padding: 24 }}>
      {/* 教學開始提示（step=0） */}
      {userRole === 'recruiter' && isTutorialPrompt && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
          onClick={closeTutorial}
        >
          <div
            style={{
              width: 'min(620px, 92vw)',
              background: '#fff',
              borderRadius: 12,
              padding: 20,
              boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>提示</div>
            <div style={{ fontSize: 15, color: '#111827', lineHeight: 1.6 }}>
              接下來將進行使用教學，準備好請按開始
            </div>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={startTutorial}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: '1px solid #111827',
                  background: '#111827',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                開始
              </button>
              <button
                onClick={closeTutorial}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                稍後再說
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 教學 overlay（step1~4） */}
      {userRole === 'recruiter' && isTutorialActive && tutorial.step >= 1 && tutorial.step <= 4 && (
        <GuidedOverlay
          open
          onClose={closeTutorial}
          targetId={
            tutorial.step === 1
              ? 'me_company_tab'
              : tutorial.step === 2
                ? 'me_create_company_btn'
                : tutorial.step === 3
                  ? 'me_create_company_form'
                  : tutorial.step === 4
                    ? 'me_company_manage_link'
                    : null
          }
          title="使用教學"
          message={
            tutorial.step === 1 ? (
              <div>點擊公司標籤</div>
            ) : tutorial.step === 2 ? (
              <div>點擊建立公司</div>
            ) : tutorial.step === 3 ? (
              <div>完成輸入後點擊建立</div>
            ) : (
              <div>點擊公司管理</div>
            )
          }
          actions={
            // step1/2/3/4 都是事件驅動，不提供下一步
            []
          }
        />
      )}

      {centerNotice && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
          onClick={() => setCenterNotice('')}
        >
          <div
            style={{
              width: 'min(560px, 92vw)',
              background: '#fff',
              borderRadius: 12,
              padding: 20,
              boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>提示</div>
            <div style={{ fontSize: 15, color: '#111827', lineHeight: 1.6 }}>{centerNotice}</div>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={() => setCenterNotice('')}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, borderBottom: '1px solid #e5e7eb' }}>
          <button onClick={() => setActiveTab('profile')} style={{ padding: '8px 12px', borderBottom: activeTab === 'profile' ? '2px solid #111' : '2px solid transparent' }}>個人</button>
          {userRole === 'jobSeeker' && (
            <button 
              onClick={() => {
                setActiveTab('interviews')
                // 當切換到面試標籤時，標記所有為已讀
                interviews.forEach(iv => {
                  if (!readInterviewIds.has(iv.id)) {
                    markInterviewAsRead(iv.id)
                  }
                })
              }} 
              style={{ 
                padding: '8px 12px', 
                borderBottom: activeTab === 'interviews' ? '2px solid #111' : '2px solid transparent',
                position: 'relative'
              }}
            >
              面試預定
              {getUnreadCount() > 0 && (
                <span style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  background: '#f44336',
                  color: 'white',
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '10px',
                  fontWeight: 'bold'
                }}>
                  NEW
                </span>
              )}
            </button>
          )}
          {userRole === 'recruiter' && (
            <button
              data-tutorial-id="me_company_tab"
              onClick={() => {
                setActiveTab('company')
                if (isTutorialActive && tutorial.step === 1) {
                  advanceTutorial(2)
                }
              }}
              style={{ padding: '8px 12px', borderBottom: activeTab === 'company' ? '2px solid #111' : '2px solid transparent' }}
            >
              公司
            </button>
          )}
          {userRole === 'recruiter' && (
            <button
              onClick={() => {
                setActiveTab('subscription')
                if (accessToken) {
                  void loadSubscription(accessToken)
                  void loadInterviewCredits(accessToken)
                }
              }}
              style={{ padding: '8px 12px', borderBottom: activeTab === 'subscription' ? '2px solid #111' : '2px solid transparent' }}
            >
              訂閱
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              background: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            登出
          </button>
          {userRole === 'jobSeeker' && quotaInfo && (
            <div style={{ fontSize: 13, color: '#111827' }}>
              當前剩餘免費次數：<b>{quotaInfo.remaining}</b>（{quotaInfo.used_count}/{quotaInfo.free_quota}）
            </div>
          )}
        </div>
      </div>

      {activeTab === 'profile' && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>個人資料</h2>
          <div style={{ marginTop: 8 }}>
            您好，{[familyName, givenName].filter(Boolean).join('') || email || '訪客'}
          </div>
          {!!([familyName, givenName].filter(Boolean).join('')) && !!email && (
            <div style={{ marginTop: 4, fontSize: 13, color: '#666' }}>Email：{email}</div>
          )}
          {tos && (
            <div style={{ marginTop: 8, fontSize: 14, color: '#555' }}>
              最新ToS同意: {String(tos.accepted)} / version: {tos.version || '-'} {tos.accepted_at ? `(at ${tos.accepted_at})` : ''}
            </div>
          )}
          
          {profileId && (
            <div style={{ marginTop: 24, padding: 16, border: '2px solid #000', borderRadius: 8, background: '#e6f2ff' }}>
              <div style={{ marginBottom: 8, fontWeight: 'bold' }}>用戶 ID</div>
              <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>
                請將此 ID 提供給公司方，以便他們為您建立面試。
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ 
                  flex: 1, 
                  padding: '8px 12px', 
                  background: '#fff', 
                  border: '2px solid #000', 
                  borderRadius: 4,
                  fontFamily: 'monospace',
                  fontSize: '0.9em',
                  wordBreak: 'break-all'
                }}>
                  {profileId}
                </div>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(profileId)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    } catch (err) {
                      // Fallback for older browsers
                      const textArea = document.createElement('textarea')
                      textArea.value = profileId
                      textArea.style.position = 'fixed'
                      textArea.style.opacity = '0'
                      document.body.appendChild(textArea)
                      textArea.select()
                      document.execCommand('copy')
                      document.body.removeChild(textArea)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }
                  }}
                  style={{
                    padding: '8px 16px',
                    background: copied ? '#4CAF50' : '#2196F3',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {copied ? '已複製！' : '複製 ID'}
                </button>
              </div>
            </div>
          )}

          {profileId && (
            <div
              style={{
                marginTop: 24,
                padding: 16,
                border: '2px solid #000',
                borderRadius: 8,
                background: '#f9fafb',
              }}
            >
              <div style={{ marginBottom: 8, fontWeight: 'bold' }}>
                偏好面試語言
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <select
                  value={preferredLanguage}
                  onChange={(e) =>
                    setPreferredLanguage(
                      e.target.value as 'zh-TW' | 'en-US' | 'ja-JP'
                    )
                  }
                  style={{
                    padding: 8,
                    border: '2px solid #000',
                    borderRadius: 4,
                    background: '#fff',
                  }}
                >
                  <option value="zh-TW">繁體中文 (zh-TW)</option>
                  <option value="en-US">English (en-US)</option>
                  <option value="ja-JP">日本語 (ja-JP)</option>
                </select>
                <button
                  onClick={handleSavePreferredLanguage}
                  disabled={savingPreferredLanguage}
                  style={{
                    padding: '8px 16px',
                    background: '#111827',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  {savingPreferredLanguage ? '儲存中…' : '儲存偏好'}
                </button>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
                這個設定會用在 AI 面試官的問答語言上，之後可隨時在此修改。
              </div>
            </div>
          )}

          {userRole === 'recruiter' && (
            <div style={{ marginTop: 16 }}>
              <button
                onClick={restartTutorial}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                重新開始使用教學
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'company' && userRole === 'recruiter' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 18, fontWeight: 600 }}>公司</h2>
            <button
              data-tutorial-id="me_create_company_btn"
              onClick={() => {
                setShowCreateForm((v) => !v)
                if (isTutorialActive && tutorial.step === 2) {
                  // 教學狀態：先預填範例，方便使用者建立
                  prefillCompanyForm()
                  advanceTutorial(3)
                }
              }}
              style={{ padding: '6px 10px' }}
            >
              {showCreateForm ? '關閉' : '建立公司'}
            </button>
          </div>
          {showCreateForm && (
            <form
              data-tutorial-id="me_create_company_form"
              onSubmit={onCreateCompany}
              style={{ marginTop: 12, padding: 16, border: '2px solid #000', borderRadius: 8, display: 'grid', gap: 10, background: '#e6f2ff' }}
            >
              <div style={{ display: 'grid', gap: 6 }}>
                <label>
                  公司名稱（必填）
                  <input
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                    required
                    placeholder="例如：AITuber Inc."
                    style={{ width: '100%', padding: 8, marginTop: 4, border: '2px solid #000', background: '#f0f8ff' }}
                  />
                </label>
                <label>
                  電話
                  <input
                    value={form.company_phone_number}
                    onChange={(e) => setForm({ ...form, company_phone_number: e.target.value })}
                    style={{ width: '100%', padding: 8, marginTop: 4, border: '2px solid #000', background: '#f0f8ff' }}
                  />
                </label>
                <label>
                  地址
                  <input
                    value={form.company_address}
                    onChange={(e) => setForm({ ...form, company_address: e.target.value })}
                    style={{ width: '100%', padding: 8, marginTop: 4, border: '2px solid #000', background: '#f0f8ff' }}
                  />
                </label>
                <label>
                  公司簡介
                  <textarea
                    rows={3}
                    value={form.company_profile}
                    onChange={(e) => setForm({ ...form, company_profile: e.target.value })}
                    style={{ width: '100%', padding: 8, marginTop: 4, border: '2px solid #000', background: '#f0f8ff' }}
                  />
                </label>
                <label>
                  理想候選人簡介
                  <textarea
                    rows={3}
                    value={form.ideal_candidate_profile}
                    onChange={(e) => setForm({ ...form, ideal_candidate_profile: e.target.value })}
                    style={{ width: '100%', padding: 8, marginTop: 4, border: '2px solid #000', background: '#f0f8ff' }}
                  />
                </label>
              </div>
              <div>
                <button type="submit" disabled={creating || !form.company_name.trim()} style={{ padding: '6px 10px' }}>
                  {creating ? '建立中…' : '建立'}
                </button>
              </div>
            </form>
          )}
          <table style={{ width: '100%', marginTop: 12, borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '2px solid #000', padding: 8 }}>公司名稱</th>
                <th style={{ textAlign: 'left', borderBottom: '2px solid #000', padding: 8 }}>地址</th>
                <th style={{ textAlign: 'left', borderBottom: '2px solid #000', padding: 8 }}>電話</th>
                <th style={{ textAlign: 'left', borderBottom: '2px solid #000', padding: 8 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} style={{ background: '#e6f2ff', border: '2px solid #000' }}>
                  <td style={{ borderBottom: '2px solid #000', padding: 8 }}>{c.company_name}</td>
                  <td style={{ borderBottom: '2px solid #000', padding: 8 }}>{c.company_address || '-'}</td>
                  <td style={{ borderBottom: '2px solid #000', padding: 8 }}>{c.company_phone_number || '-'}</td>
                  <td style={{ borderBottom: '2px solid #000', padding: 8 }}>
                    <a
                      data-tutorial-id={
                        isTutorialActive && tutorial.step === 4 && tutorial.companyId && c.id === tutorial.companyId
                          ? 'me_company_manage_link'
                          : undefined
                      }
                      href={`/company/${c.id}`}
                      style={{ color: '#2563eb', marginRight: 8 }}
                      onClick={() => {
                        if (isTutorialActive && tutorial.step === 4 && tutorial.companyId && c.id === tutorial.companyId) {
                          // 下一段教學從 company 頁開始
                          const next: RecruiterTutorialState = { active: true, step: 5, companyId: c.id, startedAt: tutorial.startedAt }
                          saveTutorialState(next)
                        }
                      }}
                    >
                      公司管理
                    </a>
                    <button onClick={() => startEdit(c)} style={{ marginRight: 6 }}>編輯</button>
                    <button onClick={() => onDeleteCompany(c.id)} style={{ color: '#b00000' }}>刪除</button>
                  </td>
                </tr>
              ))}
              {companies.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 12, textAlign: 'center', border: '2px dashed #000', background: '#f0f8ff' }}>目前還沒有公司。請點擊上方的「建立公司」來新增。</td>
                </tr>
              )}
            </tbody>
          </table>
          {editing && (
            <form onSubmit={onUpdateCompany} style={{ marginTop: 12, padding: 16, border: '2px solid #000', borderRadius: 8, display: 'grid', gap: 10, background: '#fff6e6' }}>
              <div style={{ fontWeight: 600 }}>公司編輯</div>
              <label>
                公司名稱
                <input value={editForm.company_name} onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })} style={{ width: '100%', padding: 8, marginTop: 4, border: '2px solid #000', background: '#fff' }} />
              </label>
              <label>
                電話
                <input value={editForm.company_phone_number} onChange={(e) => setEditForm({ ...editForm, company_phone_number: e.target.value })} style={{ width: '100%', padding: 8, marginTop: 4, border: '2px solid #000', background: '#fff' }} />
              </label>
              <label>
                地址
                <input value={editForm.company_address} onChange={(e) => setEditForm({ ...editForm, company_address: e.target.value })} style={{ width: '100%', padding: 8, marginTop: 4, border: '2px solid #000', background: '#fff' }} />
              </label>
              <label>
                公司簡介
                <textarea rows={3} value={editForm.company_profile} onChange={(e) => setEditForm({ ...editForm, company_profile: e.target.value })} style={{ width: '100%', padding: 8, marginTop: 4, border: '2px solid #000', background: '#fff' }} />
              </label>
              <label>
                理想候選人簡介
                <textarea rows={3} value={editForm.ideal_candidate_profile} onChange={(e) => setEditForm({ ...editForm, ideal_candidate_profile: e.target.value })} style={{ width: '100%', padding: 8, marginTop: 4, border: '2px solid #000', background: '#fff' }} />
              </label>
              <div>
                <button type="submit" style={{ padding: '6px 10px', marginRight: 8 }}>更新</button>
                <button type="button" onClick={() => setEditing(false)} style={{ padding: '6px 10px' }}>取消</button>
              </div>
            </form>
          )}
        </div>
      )}

      {activeTab === 'subscription' && userRole === 'recruiter' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600 }}>訂閱</h2>
              <div style={{ marginTop: 6, fontSize: 14, color: '#4b5563' }}>
                企業端付費方案會用來解鎖公司面試、履歷審查與 AI 題目等用量限制。
              </div>
            </div>
            <button
              onClick={() => {
                if (!accessToken) return
                void loadSubscription(accessToken)
                void loadInterviewCredits(accessToken)
              }}
              disabled={subscriptionLoading || creditsLoading}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                background: '#fff',
                cursor: subscriptionLoading || creditsLoading ? 'not-allowed' : 'pointer',
                opacity: subscriptionLoading || creditsLoading ? 0.65 : 1,
              }}
            >
              {subscriptionLoading || creditsLoading ? '更新中…' : '重新整理'}
            </button>
          </div>

          {(subscriptionError || creditsError) && (
            <div style={{ marginTop: 16, padding: 12, border: '1px solid #f59e0b', borderRadius: 8, background: '#fffbeb', color: '#92400e' }}>
              {subscriptionError || creditsError}
            </div>
          )}

          <div style={{ marginTop: 16, display: 'grid', gap: 16 }}>
            <div style={{ padding: 18, border: '2px solid #000', borderRadius: 8, background: '#f9fafb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>當前訂閱狀態</div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>
                    {subscriptionInfo?.status === 'active'
                      ? '已訂閱'
                      : subscriptionInfo?.status === 'past_due'
                        ? '付款異常'
                        : subscriptionInfo?.status === 'free_testing'
                          ? '免費測試中'
                          : subscriptionInfo?.status === 'canceled'
                            ? '已取消'
                            : '尚未訂閱'}
                  </div>
                  <div style={{ marginTop: 8, color: '#374151', lineHeight: 1.6 }}>
                    {subscriptionInfo?.message || '正在準備企業訂閱方案。'}
                  </div>
                </div>
                <span
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    background:
                      subscriptionInfo?.status === 'active'
                        ? '#dcfce7'
                        : subscriptionInfo?.status === 'past_due' || subscriptionInfo?.cardStatus === 'card_update_required'
                          ? '#fee2e2'
                          : '#e0f2fe',
                    color:
                      subscriptionInfo?.status === 'active'
                        ? '#166534'
                        : subscriptionInfo?.status === 'past_due' || subscriptionInfo?.cardStatus === 'card_update_required'
                          ? '#991b1b'
                          : '#075985',
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {subscriptionInfo?.planName || '企業訂閱'}
                </span>
              </div>
            </div>

            <div style={{ padding: 18, border: '2px solid #000', borderRadius: 8, background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>TOKEN 方案</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>
                    目前可使用 TOKEN：{formatTokens(creditsInfo?.credits.availableTokens ?? creditsInfo?.balance.purchased_tokens_remaining ?? 0)}
                  </div>
                  <div style={{ marginTop: 4, fontWeight: 700 }}>
                    依當前使用狀況推測還可進行 {creditsInfo?.credits.estimatedRemainingInterviews ?? 0} 次面試
                  </div>
                  <div style={{ marginTop: 8, color: '#4b5563', lineHeight: 1.6 }}>
                    購買 TOKEN 方案後，付款成功需等待藍新 NotifyURL 通知完成，重新整理後會更新 TOKEN 餘額。
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                {(creditsInfo?.packages || [])
                  .filter((pkg) => pkg.token_amount > 0)
                  .map((pkg) => (
                    <div
                      key={pkg.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        padding: 12,
                        border: '1px solid #d1d5db',
                        borderRadius: 8,
                        background: '#f9fafb',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800 }}>{pkg.name}</div>
                        <div style={{ marginTop: 4, fontSize: 13, color: '#4b5563' }}>
                          NT${pkg.price_twd.toLocaleString('zh-TW')} / {formatTokens(pkg.token_amount)} TOKEN
                        </div>
                      </div>
                      <button
                        onClick={() => handlePurchaseCredits(pkg.id)}
                        disabled={purchaseCreating}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 8,
                          border: '1px solid #111827',
                          background: purchaseCreating ? '#e5e7eb' : '#111827',
                          color: purchaseCreating ? '#6b7280' : '#fff',
                          cursor: purchaseCreating ? 'not-allowed' : 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        {purchaseCreating ? '前往付款中…' : `購買 ${formatTokens(pkg.token_amount)} TOKEN`}
                      </button>
                    </div>
                  ))}
                {creditsInfo && creditsInfo.packages.filter((pkg) => pkg.token_amount > 0).length === 0 && (
                  <div style={{ padding: 12, border: '1px dashed #d1d5db', borderRadius: 8, color: '#6b7280' }}>
                    目前沒有可購買的 TOKEN 方案。
                  </div>
                )}
              </div>

              {(creditsInfo?.recent_purchases || []).length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>最近購買紀錄</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {creditsInfo!.recent_purchases.slice(0, 3).map((purchase) => (
                      <div
                        key={purchase.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                          padding: 10,
                          border: '1px solid #e5e7eb',
                          borderRadius: 8,
                          fontSize: 13,
                        }}
                      >
                        <span>{purchase.merchant_order_no}</span>
                        <span>
                          {purchase.status === 'paid'
                            ? '付款成功'
                            : purchase.status === 'failed'
                              ? '付款失敗'
                              : purchase.status === 'pending'
                                ? '付款確認中'
                                : purchase.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {[
                {
                  label: '方案',
                  value: subscriptionInfo?.planName || '尚未選擇',
                },
                {
                  label: '費用',
                  value:
                    typeof subscriptionInfo?.amountTwd === 'number'
                      ? `NT$${subscriptionInfo.amountTwd.toLocaleString('zh-TW')} / ${subscriptionInfo.billingCycle === 'yearly' ? '年' : '月'}`
                      : '免費測試期',
                },
                {
                  label: '預計續訂日期',
                  value: subscriptionInfo?.nextBillingDate || '尚未排定',
                },
                {
                  label: '本期可用至',
                  value: subscriptionInfo?.currentPeriodEnd || '免費測試期間',
                },
                {
                  label: '本期可用 TOKEN',
                  value:
                    typeof subscriptionInfo?.monthlyTokenRemaining === 'number'
                      ? formatTokens(subscriptionInfo.monthlyTokenRemaining)
                      : '尚未啟用',
                },
                {
                  label: '推測可面試數',
                  value:
                    typeof subscriptionInfo?.estimatedRemainingInterviews === 'number'
                      ? `${subscriptionInfo.estimatedRemainingInterviews} 次`
                      : '尚未啟用',
                },
                {
                  label: '付款方式',
                  value: subscriptionInfo?.paymentMethodLabel || '尚未綁定',
                },
                {
                  label: '卡片狀態',
                  value:
                    subscriptionInfo?.cardStatus === 'active'
                      ? '正常'
                      : subscriptionInfo?.cardStatus === 'card_update_required'
                        ? '需要更新'
                        : '尚未綁定',
                },
              ].map((item) => (
                <div key={item.label} style={{ padding: 14, border: '1px solid #d1d5db', borderRadius: 8, background: '#fff' }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{item.label}</div>
                  <div style={{ marginTop: 6, fontWeight: 700, color: '#111827' }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div style={{ padding: 16, border: '1px solid #d1d5db', borderRadius: 8, background: '#fff' }}>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>訂閱操作</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setCenterNotice('正式收費方案尚未啟用。NewebPay 定期定額串接完成後，這裡會導向訂閱付款流程。')}
                  disabled={!subscriptionInfo?.canSubscribe}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid #111827',
                    background: subscriptionInfo?.canSubscribe ? '#111827' : '#e5e7eb',
                    color: subscriptionInfo?.canSubscribe ? '#fff' : '#6b7280',
                    cursor: subscriptionInfo?.canSubscribe ? 'pointer' : 'not-allowed',
                    fontWeight: 700,
                  }}
                >
                  訂閱方案
                </button>
                <button
                  onClick={() => setCenterNotice('修改付費資訊會在重新綁卡流程完成後啟用。')}
                  disabled={!subscriptionInfo?.canModifyPayment}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid #9ca3af',
                    background: '#fff',
                    color: subscriptionInfo?.canModifyPayment ? '#111827' : '#9ca3af',
                    cursor: subscriptionInfo?.canModifyPayment ? 'pointer' : 'not-allowed',
                    fontWeight: 700,
                  }}
                >
                  修改付費資訊
                </button>
                <button
                  onClick={() => setCenterNotice('取消訂閱會在正式訂閱啟用後呼叫藍新終止委託，並保留本期已付費權益至到期日。')}
                  disabled={!subscriptionInfo?.canCancel}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid #b91c1c',
                    background: '#fff',
                    color: subscriptionInfo?.canCancel ? '#b91c1c' : '#9ca3af',
                    cursor: subscriptionInfo?.canCancel ? 'pointer' : 'not-allowed',
                    fontWeight: 700,
                  }}
                >
                  取消訂閱
                </button>
              </div>
              <div style={{ marginTop: 12, fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
                正式收費後會補上付款失敗提醒、重新綁卡、發票或收據資訊、以及最近付款紀錄。
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'interviews' && userRole === 'jobSeeker' && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>面試預定</h2>
          {interviews.length === 0 ? (
            <div style={{ marginTop: 24, padding: 24, textAlign: 'center', border: '2px dashed #000', borderRadius: 8, background: '#f0f8ff' }}>
              目前尚無面試預定
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              {interviews.map((iv) => {
                const isUnread = !readInterviewIds.has(iv.id) && iv.status === 'waitToStart'
                const canStart = canStartInterview(iv.start_time)
                const startDate = new Date(iv.start_time)
                const now = new Date()
                
                return (
                  <div 
                    key={iv.id} 
                    style={{ 
                      marginBottom: 16, 
                      padding: 16, 
                      border: '2px solid #000', 
                      borderRadius: 8, 
                      background: isUnread ? '#fff3e0' : '#e6f2ff',
                      position: 'relative'
                    }}
                  >
                    {isUnread && (
                      <span style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        background: '#f44336',
                        color: 'white',
                        fontSize: '10px',
                        padding: '4px 8px',
                        borderRadius: '12px',
                        fontWeight: 'bold'
                      }}>
                        NEW
                      </span>
                    )}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}>
                        {iv.job_title || '職缺資訊'}
                      </div>
                      {iv.company_name && (
                        <div style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>
                          公司：{iv.company_name}
                        </div>
                      )}
                      <div style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>
                        開始時間：{startDate.toLocaleString('zh-TW')}
                      </div>
                      {iv.end_time && (
                        <div style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>
                          結束時間：{new Date(iv.end_time).toLocaleString('zh-TW')}
                        </div>
                      )}
                      <div style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>
                        狀態：{
                          iv.status === 'waitToStart' ? '等待開始' :
                          iv.status === 'inProgress' ? '進行中' :
                          iv.status === 'expired' ? '超時未繼續面試' :
                          iv.status === 'completed' ? '已完成' :
                          iv.status === 'lateButComplete' ? '延遲但完成' :
                          iv.status === 'noShow' ? '未出席' :
                          iv.status === 'cancelled' ? '已取消' :
                          iv.status
                        }
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                      {iv.status === 'inProgress' && (
                        <button
                          onClick={() => {
                            markInterviewAsRead(iv.id)
                            window.location.href = `/interview?interview_id=${iv.id}`
                          }}
                          style={{
                            padding: '8px 16px',
                            background: '#1976D2',
                            color: 'white',
                            border: 'none',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontWeight: 500
                          }}
                        >
                          繼續面試
                        </button>
                      )}
                      {iv.status === 'expired' && (
                        <div style={{ fontSize: 14, color: '#d32f2f', padding: '8px 16px' }}>
                          超時未繼續面試
                        </div>
                      )}
                      {canStart && iv.status === 'waitToStart' && (
                        <button
                          onClick={() => handleStartInterview(iv.id)}
                          style={{
                            padding: '8px 16px',
                            background: '#4CAF50',
                            color: 'white',
                            border: 'none',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontWeight: 500
                          }}
                        >
                          開始面試
                        </button>
                      )}
                      {!canStart && iv.status === 'waitToStart' && (
                        <div style={{ fontSize: 14, color: '#999', padding: '8px 16px' }}>
                          面試尚未開始
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {startInterviewModal.open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: 16,
          }}
          onClick={handleCancelStartInterview}
        >
          <div
            style={{
              width: 'min(620px, 92vw)',
              background: '#fff',
              borderRadius: 12,
              padding: 20,
              boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>確認開始面試？</div>
            <div style={{ fontSize: 15, color: '#111827', lineHeight: 1.7 }}>
              開始面試將消耗 1 次免費使用次數（剩餘 {typeof quotaInfo?.remaining === 'number' ? quotaInfo.remaining : '—'} 次）
              <br />
              請確認在網路穩定的環境下再進行。
            </div>
            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={handleCancelStartInterview}
                disabled={startingInterview}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: '1px solid #111827',
                  background: '#fff',
                  cursor: startingInterview ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  minWidth: 120,
                  opacity: startingInterview ? 0.6 : 1,
                }}
              >
                取消
              </button>
              <button
                onClick={handleConfirmStartInterview}
                disabled={startingInterview}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: '1px solid #111827',
                  background: '#111827',
                  color: '#fff',
                  cursor: startingInterview ? 'not-allowed' : 'pointer',
                  fontWeight: 800,
                  minWidth: 120,
                  opacity: startingInterview ? 0.8 : 1,
                }}
              >
                {startingInterview ? '開始中…' : '確認開始'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
