import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import settingsStore from '@/features/stores/settings'
import { TextButton } from '@/components/textButton'
import Settings from '@/components/settings'

const ADMIN_USERNAME = 'super123'
const ADMIN_PASSWORD = 'kapibarachiikawa'
const ADMIN_TOKEN_KEY = 'adminAuthToken'

const encodeBasicToken = (username: string, password: string) =>
  typeof window === 'undefined'
    ? ''
    : window.btoa(`${username}:${password}`)

const getStoredToken = () => {
  if (typeof window === 'undefined') return null
  return window.sessionStorage.getItem(ADMIN_TOKEN_KEY)
}

const setStoredToken = (token: string) => {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token)
}

const clearStoredToken = () => {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(ADMIN_TOKEN_KEY)
}

const AdminSettingPage = () => {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'settings' | 'feedback'>('settings')

  // 初回ロード時に DB のグローバル設定を取得し settingsStore に反映
  useEffect(() => {
    const token = getStoredToken()
    if (token) {
      setIsAuthenticated(true)
    }

    ;(async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/admin/settings', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (!res.ok) return

        const json = await res.json()
        if (json.success && json.data && json.data.settingsJson) {
          // DB に保存されている全設定スナップショットを反映
          settingsStore.setState((prev) => ({
            ...prev,
            ...json.data.settingsJson,
          }))
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleLogin = () => {
    setLoginError(null)
    setMessage(null)
    setError(null)

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      setLoginError('帳號或密碼錯誤')
      return
    }

    const token = encodeBasicToken(username, password)
    if (!token) {
      setLoginError('瀏覽器環境初始化失敗，請稍後再試')
      return
    }

    setStoredToken(token)
    setIsAuthenticated(true)
  }

  const handleLogout = () => {
    clearStoredToken()
    setIsAuthenticated(false)
    setUsername('')
    setPassword('')
    setMessage(null)
    setError(null)
  }

  const handleSave = async () => {
    setMessage(null)
    setError(null)

    const token = getStoredToken()
    if (!token) {
      setError('尚未登入或登入已過期，請重新登入')
      setIsAuthenticated(false)
      return
    }

    setSaving(true)
    try {
      const ss = settingsStore.getState()

      if (!ss.selectAIModel || !ss.selectAIModel.trim()) {
        setError('AI MODEL 不得為空')
        setSaving(false)
        return
      }

      const payload = {
        aiService: ss.selectAIService,
        aiModel: ss.selectAIModel.trim(),
        temperature: ss.temperature,
        maxTokens: ss.maxTokens,
        settingsJson: ss,
      }

      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-auth': `Basic ${token}`,
        },
        body: JSON.stringify(payload),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        setError(json.error || '儲存失敗，請稍後再試')
        return
      }

      setMessage('儲存成功')
    } catch (e) {
      console.error('儲存全域設定錯誤:', e)
      setError('儲存失敗，請稍後再試')
    } finally {
      setSaving(false)
    }
  }

  const renderLogin = () => {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold mb-6 text-center">管理者登入</h1>
          <div className="mb-4">
            <label className="block mb-1 text-sm font-medium">帳號</label>
            <input
              type="text"
              className="w-full px-3 py-2 border rounded-lg"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="輸入管理帳號"
            />
          </div>
          <div className="mb-4">
            <label className="block mb-1 text-sm font-medium">密碼</label>
            <input
              type="password"
              className="w-full px-3 py-2 border rounded-lg"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="輸入管理密碼"
            />
          </div>
          {loginError && (
            <div className="mb-4 text-red-600 text-sm">{loginError}</div>
          )}
          <div className="flex justify-between items-center">
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
              onClick={() => router.push('/')}
            >
              返回首頁
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              onClick={handleLogin}
            >
              登入
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderSettingsForm = () => {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="w-full max-w-none py-10 px-4 md:px-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Admin 全域設定</h1>
            <div className="flex gap-3">
              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-sm"
                onClick={() => router.push('/')}
              >
                返回首頁
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 text-sm"
                onClick={handleLogout}
              >
                登出
              </button>
            </div>
          </div>

          <div className="flex gap-2 mb-6">
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-2 rounded-lg text-sm ${
                activeTab === 'settings'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
              }`}
            >
              系統設定
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('feedback')}
              className={`px-3 py-2 rounded-lg text-sm ${
                activeTab === 'feedback'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
              }`}
            >
              使用者反饋
            </button>
          </div>

          {activeTab === 'feedback' ? (
            <AdminFeedbackTab />
          ) : (
            <>
              <p className="mb-4 text-gray-600 text-sm">
                此頁面使用與首頁相同的完整設定畫面，所有變更會以全域 JSON 設定形式儲存到資料庫，並套用到所有用戶。
              </p>

              <div className="relative h-[80vh] min-h-[600px] border rounded-xl bg-white/80 shadow overflow-hidden">
                {/* 直接重用原本的 Settings UI */}
                <Settings onClickClose={() => {}} />
              </div>

              <div className="mt-6 space-y-2">
                {error && <div className="text-red-600 text-sm">{error}</div>}
                {message && <div className="text-green-600 text-sm">{message}</div>}

                <div className="flex justify-end">
                  <TextButton onClick={handleSave} disabled={saving}>
                    {saving ? '儲存中...' : '儲存全域設定'}
                  </TextButton>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return renderLogin()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>載入設定中...</div>
      </div>
    )
  }

  return renderSettingsForm()
}

// 強制 SSR，使每次請求都能取得 middleware 設定的 CSP nonce，避免 SSG 頁面在執行時 nonce 與 CSP 不符導致腳本被擋、無法登入。
export async function getServerSideProps() {
  return { props: {} }
}

export default AdminSettingPage

type AdminFeedbackItem = any

type AiEvaluationItem = {
  key?: string
  score?: number
  evidence?: string
  [k: string]: any
}

type TokenUsage = {
  input: number
  output: number
  total: number
}

const safeParseJsonArray = (v: any): any[] => {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

const getSessionFromItem = (it: any) =>
  Array.isArray(it?.interview_sessions) ? it.interview_sessions[0] : it?.interview_sessions

const toSafeNonNegInt = (v: any) => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
}

const getTokenUsageFromItem = (it: any): TokenUsage => {
  const session = getSessionFromItem(it)
  const input = toSafeNonNegInt(session?.tokens_input)
  const output = toSafeNonNegInt(session?.tokens_output)
  return { input, output, total: input + output }
}

const getAiEvaluationsFromItem = (it: any): AiEvaluationItem[] => {
  const session = getSessionFromItem(it)
  return safeParseJsonArray(session?.ai_evaluations) as AiEvaluationItem[]
}

const getCommentFromItem = (it: any) => String(it?.payload?.comment || '').trim()

const AdminFeedbackTab = () => {
  const [kind, setKind] = useState<string>('')
  const [companyId, setCompanyId] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<AdminFeedbackItem[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Filters (default disabled)
  const [enableFilters, setEnableFilters] = useState(false)
  const [onlyWithComment, setOnlyWithComment] = useState(false)
  const [minScoreThreshold, setMinScoreThreshold] = useState<number>(6)
  const [showIfAnyBelowThreshold, setShowIfAnyBelowThreshold] = useState(false)
  const [showIfAvgBelowThreshold, setShowIfAvgBelowThreshold] = useState(false)

  // Token filter / sort
  const [tokenMin, setTokenMin] = useState<string>('')
  const [tokenMax, setTokenMax] = useState<string>('')
  const [sortBy, setSortBy] = useState<'updated_at' | 'tokens_total'>('updated_at')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')

  const filteredItems = useMemo(() => {
    if (!enableFilters) return items

    const threshold = Number.isFinite(minScoreThreshold) ? minScoreThreshold : 6

    return items.filter((it: any) => {
      if (onlyWithComment) {
        if (!getCommentFromItem(it)) return false
      }

      // If neither score-based toggle is enabled, don't score-filter
      if (!showIfAnyBelowThreshold && !showIfAvgBelowThreshold) return true

      const evals = getAiEvaluationsFromItem(it)
      const scores = evals
        .map((e) => (typeof e?.score === 'string' ? Number(e.score) : e?.score))
        .filter((n) => typeof n === 'number' && Number.isFinite(n)) as number[]

      // Per user confirmation: scores exist; still be safe.
      if (scores.length === 0) return true

      if (showIfAnyBelowThreshold) {
        const anyBelow = scores.some((s) => s < threshold)
        if (!anyBelow) return false
      }

      if (showIfAvgBelowThreshold) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length
        if (!(avg < threshold)) return false
      }

      return true
    })
  }, [
    enableFilters,
    items,
    minScoreThreshold,
    onlyWithComment,
    showIfAnyBelowThreshold,
    showIfAvgBelowThreshold,
  ])

  const displayItems = useMemo(() => {
    let out = filteredItems

    const min = tokenMin.trim() ? Number(tokenMin) : null
    const max = tokenMax.trim() ? Number(tokenMax) : null
    const hasMin = typeof min === 'number' && Number.isFinite(min)
    const hasMax = typeof max === 'number' && Number.isFinite(max)

    if (hasMin || hasMax) {
      out = out.filter((it: any) => {
        const { total } = getTokenUsageFromItem(it)
        if (hasMin && !(total >= (min as number))) return false
        if (hasMax && !(total <= (max as number))) return false
        return true
      })
    }

    const dir = sortDir === 'asc' ? 1 : -1
    out = [...out].sort((a: any, b: any) => {
      if (sortBy === 'tokens_total') {
        const ta = getTokenUsageFromItem(a).total
        const tb = getTokenUsageFromItem(b).total
        if (ta !== tb) return (ta - tb) * dir
      } else {
        const da = a?.updated_at ? new Date(a.updated_at).getTime() : 0
        const db = b?.updated_at ? new Date(b.updated_at).getTime() : 0
        if (da !== db) return (da - db) * dir
      }

      // tie-breaker: updated_at desc
      const da = a?.updated_at ? new Date(a.updated_at).getTime() : 0
      const db = b?.updated_at ? new Date(b.updated_at).getTime() : 0
      return db - da
    })

    return out
  }, [filteredItems, sortBy, sortDir, tokenMin, tokenMax])

  const fetchList = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = getStoredToken()
      if (!token) throw new Error('尚未登入或登入已過期，請重新登入')

      const params = new URLSearchParams()
      if (kind) params.set('kind', kind)
      if (companyId) params.set('company_id', companyId.trim())
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      params.set('limit', '50')
      params.set('offset', '0')

      const res = await fetch(`/api/admin/feedback/list?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-auth': `Basic ${token}`,
        },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      setItems(Array.isArray(json.items) ? json.items : [])
    } catch (e: any) {
      setError(e?.message || '載入失敗')
    } finally {
      setLoading(false)
    }
  }

  const fetchDetail = async (id: string) => {
    setDetailLoading(true)
    setError(null)
    try {
      const token = getStoredToken()
      if (!token) throw new Error('尚未登入或登入已過期，請重新登入')
      const res = await fetch(`/api/admin/feedback/detail?id=${encodeURIComponent(id)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-auth': `Basic ${token}`,
        },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      setDetail(json.item || null)
    } catch (e: any) {
      setError(e?.message || '載入失敗')
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    void fetchList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If current expanded row gets filtered out, collapse it to avoid confusing UI.
  useEffect(() => {
    if (!expandedId) return
    if (!filteredItems.some((x: any) => x?.id === expandedId)) {
      setExpandedId(null)
      setDetail(null)
    }
  }, [expandedId, filteredItems])

  return (
    <div className="bg-white rounded-xl border shadow-sm p-6">
      <div className="flex items-end gap-3 flex-wrap mb-4">
        <div>
          <label className="block text-xs text-gray-600 mb-1">類型</label>
          <select
            className="px-3 py-2 border rounded-lg text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="">全部</option>
            <option value="jobseeker">jobseeker</option>
            <option value="recruiter">recruiter</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Company ID</label>
          <input
            className="px-3 py-2 border rounded-lg text-sm w-72"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            placeholder="可留空"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">更新日期（起）</label>
          <input
            type="date"
            className="px-3 py-2 border rounded-lg text-sm"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">更新日期（迄）</label>
          <input
            type="date"
            className="px-3 py-2 border rounded-lg text-sm"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>

        <button
          type="button"
          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm"
          onClick={fetchList}
          disabled={loading}
        >
          {loading ? '查詢中...' : '查詢'}
        </button>
      </div>

      <div className="mb-4 rounded-xl border bg-gray-50 p-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Token（總計）最小</label>
            <input
              type="number"
              min={0}
              className="px-3 py-2 border rounded-lg text-sm w-40"
              value={tokenMin}
              onChange={(e) => setTokenMin(e.target.value)}
              placeholder="可留空"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Token（總計）最大</label>
            <input
              type="number"
              min={0}
              className="px-3 py-2 border rounded-lg text-sm w-40"
              value={tokenMax}
              onChange={(e) => setTokenMax(e.target.value)}
              placeholder="可留空"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">排序</label>
            <div className="flex gap-2">
              <select
                className="px-3 py-2 border rounded-lg text-sm"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
              >
                <option value="updated_at">更新時間</option>
                <option value="tokens_total">Token（總計）</option>
              </select>
              <select
                className="px-3 py-2 border rounded-lg text-sm"
                value={sortDir}
                onChange={(e) => setSortDir(e.target.value as any)}
              >
                <option value="desc">由大到小</option>
                <option value="asc">由小到大</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-xl border bg-gray-50 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-gray-800 select-none">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={enableFilters}
              onChange={(e) => setEnableFilters(e.target.checked)}
            />
            啟用過濾
          </label>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              className={`px-3 py-1.5 rounded-lg text-sm border ${
                enableFilters && onlyWithComment
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-100'
              } ${!enableFilters ? 'opacity-50 cursor-not-allowed hover:bg-white' : ''}`}
              onClick={() => enableFilters && setOnlyWithComment((v) => !v)}
              disabled={!enableFilters}
            >
              只顯示有自由記述
            </button>

            <button
              type="button"
              className={`px-3 py-1.5 rounded-lg text-sm border ${
                enableFilters && showIfAnyBelowThreshold
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-100'
              } ${!enableFilters ? 'opacity-50 cursor-not-allowed hover:bg-white' : ''}`}
              onClick={() => enableFilters && setShowIfAnyBelowThreshold((v) => !v)}
              disabled={!enableFilters}
            >
              任一項低於門檻
            </button>

            <button
              type="button"
              className={`px-3 py-1.5 rounded-lg text-sm border ${
                enableFilters && showIfAvgBelowThreshold
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-100'
              } ${!enableFilters ? 'opacity-50 cursor-not-allowed hover:bg-white' : ''}`}
              onClick={() => enableFilters && setShowIfAvgBelowThreshold((v) => !v)}
              disabled={!enableFilters}
            >
              平均低於門檻
            </button>

            <div className={`flex items-center gap-2 ${!enableFilters ? 'opacity-50' : ''}`}>
              <span className="text-xs text-gray-600">門檻</span>
              <input
                type="number"
                min={0}
                max={10}
                step={0.5}
                className="w-24 px-3 py-1.5 border rounded-lg text-sm bg-white"
                value={Number.isFinite(minScoreThreshold) ? minScoreThreshold : 6}
                onChange={(e) => setMinScoreThreshold(Number(e.target.value))}
                disabled={!enableFilters}
              />
              <span className="text-xs text-gray-600">分（0~10）</span>
            </div>
          </div>
        </div>

        <div className="mt-2 text-xs text-gray-600">
          顯示 {filteredItems.length} / 共 {items.length} 筆（目前僅顯示前 50 筆）
        </div>
      </div>

      {error && <div className="text-sm text-red-600 mb-3">{error}</div>}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600 border-b">
              <th className="py-2 pr-4">更新時間</th>
              <th className="py-2 pr-4">Token</th>
              <th className="py-2 pr-4">類型</th>
              <th className="py-2 pr-4">公司</th>
              <th className="py-2 pr-4">面試</th>
              <th className="py-2 pr-4">提交者</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {displayItems.map((it: any) => {
              const companyName = it?.company?.company_name || it?.company_name || it?.company_id
              const interview = Array.isArray(it?.interviews) ? it.interviews[0] : it?.interviews
              const startTime = interview?.start_time ? new Date(interview.start_time).toLocaleString('zh-TW') : '—'
              const profile = Array.isArray(it?.profiles) ? it.profiles[0] : it?.profiles
              const submitter = profile?.email || it?.submitted_by_profile_id || '—'
              const tok = getTokenUsageFromItem(it)
              return (
                <tr key={it.id} className="border-b align-top">
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {it.updated_at ? new Date(it.updated_at).toLocaleString('zh-TW') : '—'}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    <div className="font-mono">{tok.total || 0}</div>
                    <div className="text-xs text-gray-500 font-mono">
                      in {tok.input} / out {tok.output}
                    </div>
                  </td>
                  <td className="py-2 pr-4">{it.kind}</td>
                  <td className="py-2 pr-4">{companyName}</td>
                  <td className="py-2 pr-4">
                    <div>{it.interviews_id}</div>
                    <div className="text-xs text-gray-500">{startTime}</div>
                  </td>
                  <td className="py-2 pr-4">{submitter}</td>
                  <td className="py-2 pr-0">
                    <button
                      type="button"
                      className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-xs"
                      onClick={async () => {
                        const next = expandedId === it.id ? null : it.id
                        setExpandedId(next)
                        if (next) {
                          setDetail(null)
                          await fetchDetail(it.id)
                        }
                      }}
                    >
                      {expandedId === it.id ? '收合' : '查看'}
                    </button>
                  </td>
                </tr>
              )
            })}
            {displayItems.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-gray-500">
                  尚無資料（或目前過濾條件沒有命中）
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {expandedId && (
        <div className="mt-4 border rounded-lg p-4 bg-gray-50">
          <div className="text-sm font-semibold text-gray-800 mb-2">回饋明細</div>
          {detailLoading && <div className="text-sm text-gray-600">載入中...</div>}
          {detail && (
            (() => {
              const payload = detail?.payload || {}
              const kind = String(detail?.kind || '')
              const comment = String(payload?.comment || '').trim()
              const issueTypes = Array.isArray(payload?.issue_types) ? payload.issue_types : []
              const issueOtherText = String(payload?.issue_other_text || '').trim()
              const ratings = payload?.ratings && typeof payload.ratings === 'object' ? payload.ratings : {}
              const touched = payload?.touched && typeof payload.touched === 'object' ? payload.touched : null

              const session = getSessionFromItem(detail)
              const aiEvals = safeParseJsonArray(session?.ai_evaluations) as AiEvaluationItem[]

              const criteriaArr = Array.isArray(detail?.evaluation_criteria)
                ? (detail.evaluation_criteria as any[])
                : []
              const criteriaLabelMap = new Map<string, string>()
              for (const c of criteriaArr) {
                const key = String((c as any)?.key || '').trim()
                const label = String((c as any)?.display_name || '').trim()
                if (key && label) criteriaLabelMap.set(key, label)
              }

              const formatEvalKey = (k: any) => {
                const key = String(k || '').trim()
                if (!key) return '—'
                const label = criteriaLabelMap.get(key)
                return label ? `${label}（${key}）` : key
              }

              const evalRows = aiEvals
                .map((e) => ({
                  key: String(e?.key || ''),
                  score: typeof e?.score === 'string' ? Number(e.score) : (e?.score as any),
                  evidence: String(e?.evidence || '').trim(),
                }))
                .filter((r) => r.key && typeof r.score === 'number' && Number.isFinite(r.score))
                .sort((a, b) => a.score - b.score)

              const recruiterCriteriaBias =
                kind === 'recruiter' && payload?.criteria_bias && typeof payload.criteria_bias === 'object'
                  ? (payload.criteria_bias as Record<string, number>)
                  : null

              return (
                <div className="grid gap-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-white border rounded-lg p-3">
                      <div className="text-xs font-semibold text-gray-700 mb-2">基本資訊</div>
                      <div className="text-xs text-gray-700 space-y-1">
                        <div>
                          <span className="text-gray-500">feedback_id：</span>
                          <span className="font-mono">{detail.id}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">kind：</span>
                          <span className="font-mono">{detail.kind}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">updated_at：</span>
                          {detail.updated_at ? new Date(detail.updated_at).toLocaleString('zh-TW') : '—'}
                        </div>
                        <div>
                          <span className="text-gray-500">interviews_id：</span>
                          <span className="font-mono">{detail.interviews_id}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">interview_session_id：</span>
                          <span className="font-mono">{detail.interview_session_id}</span>
                        </div>
                        {session && (
                          <div>
                            <span className="text-gray-500">tokens：</span>
                            <span className="font-mono">
                              {(() => {
                                const ti = toSafeNonNegInt((session as any)?.tokens_input)
                                const to = toSafeNonNegInt((session as any)?.tokens_output)
                                const total = ti + to
                                return `in ${ti} / out ${to} / total ${total}`
                              })()}
                            </span>
                          </div>
                        )}
                        {session && (
                          <div className="pt-2 mt-2 border-t">
                            <div className="text-xs font-semibold text-gray-700 mb-2">面試結果（session）</div>
                            <div className="space-y-1">
                              <div>
                                <span className="text-gray-500">review_type：</span>
                                <span className="font-mono">{String(session.review_type || '—')}</span>
                              </div>
                              <div>
                                <span className="text-gray-500">interview_result：</span>
                                <span className="font-mono">{String(session.interview_result || '—')}</span>
                              </div>
                              <div>
                                <span className="text-gray-500">total_score：</span>
                                <span className="font-mono">{session.total_score ?? '—'}</span>
                              </div>
                              <div>
                                <span className="text-gray-500">duration_seconds：</span>
                                <span className="font-mono">{session.duration_seconds ?? '—'}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-white border rounded-lg p-3">
                      <div className="text-xs font-semibold text-gray-700 mb-2">回饋摘要</div>

                      <div className="mb-3">
                        <div className="text-xs text-gray-500 mb-1">自由記述</div>
                        <div className="text-sm text-gray-900 whitespace-pre-wrap">
                          {comment || <span className="text-gray-400">（無）</span>}
                        </div>
                      </div>

                      {kind === 'jobseeker' && (
                        <>
                          <div className="mb-3">
                            <div className="text-xs text-gray-500 mb-1">問題類型</div>
                            {issueTypes.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {issueTypes.map((x: any) => (
                                  <span
                                    key={String(x)}
                                    className="text-xs px-2 py-1 rounded-full bg-gray-100 border text-gray-700"
                                  >
                                    {String(x)}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-400">（無）</div>
                            )}
                            {issueOtherText && (
                              <div className="mt-2 text-xs text-gray-700">
                                <span className="text-gray-500">其他：</span>
                                {issueOtherText}
                              </div>
                            )}
                          </div>

                          <div>
                            <div className="text-xs text-gray-500 mb-2">評分（jobseeker ratings）</div>
                            <div className="grid grid-cols-2 gap-2">
                              {[
                                { k: 'usability', label: '易用性' },
                                { k: 'speed', label: '速度' },
                                { k: 'accuracy', label: '準確度' },
                                { k: 'satisfaction', label: '滿意度' },
                              ].map(({ k, label }) => {
                                const v = (ratings as any)?.[k]
                                const isTouched = touched ? Boolean((touched as any)?.[k]) : null
                                return (
                                  <div key={k} className="border rounded-lg bg-gray-50 p-2">
                                    <div className="text-xs text-gray-600">{label}</div>
                                    <div className="flex items-end justify-between">
                                      <div className="text-lg font-semibold text-gray-900">{v ?? '—'}</div>
                                      {isTouched !== null && (
                                        <div className="text-[11px] text-gray-500">
                                          {isTouched ? '已填' : '未填'}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </>
                      )}

                      {kind === 'recruiter' && (
                        <>
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div className="border rounded-lg bg-gray-50 p-2">
                              <div className="text-xs text-gray-600">可解釋性</div>
                              <div className="text-lg font-semibold text-gray-900">
                                {payload?.explainability ?? '—'}
                              </div>
                            </div>
                            <div className="border rounded-lg bg-gray-50 p-2">
                              <div className="text-xs text-gray-600">整體決策偏差</div>
                              <div className="text-lg font-semibold text-gray-900">
                                {payload?.overall_decision_bias ?? '—'}
                              </div>
                            </div>
                          </div>

                          {recruiterCriteriaBias && Object.keys(recruiterCriteriaBias).length > 0 && (
                            <div className="mb-3">
                              <div className="text-xs text-gray-500 mb-2">criteria_bias</div>
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(recruiterCriteriaBias).map(([k, v]) => (
                                  <span
                                    key={k}
                                    className="text-xs px-2 py-1 rounded-full bg-gray-100 border text-gray-700"
                                  >
                                    {formatEvalKey(k)}: {v}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {(() => {
                            const reasonFlags = Array.isArray(payload?.reason_flags) ? payload.reason_flags : []
                            const reasonFlagLabels: Record<string, string> = {
                              'insufficient_evidence': '證據不足 / 解釋不清',
                              'logic_issue': '邏輯或前後一致性問題',
                              'risk_missed': '忽略風險 / 紅旗',
                              'followup_inappropriate': '追問不適切 / 過度追問',
                              'other': '其他',
                            }
                            const otherDetail = String(payload?.other_detail || '').trim()

                            if (reasonFlags.length === 0) return null

                            return (
                              <div className="mb-3">
                                <div className="text-xs text-gray-500 mb-2">問題原因（reason_flags）</div>
                                <div className="flex flex-wrap gap-2">
                                  {reasonFlags.map((flag: string) => (
                                    <span
                                      key={flag}
                                      className="text-xs px-2 py-1 rounded-full bg-blue-100 border border-blue-300 text-blue-800"
                                    >
                                      {reasonFlagLabels[flag] || flag}
                                    </span>
                                  ))}
                                </div>
                                {otherDetail && (
                                  <div className="mt-2 text-xs text-gray-700">
                                    <span className="text-gray-500">其他說明：</span>
                                    {otherDetail}
                                  </div>
                                )}
                              </div>
                            )
                          })()}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="bg-white border rounded-lg p-3">
                    <div className="text-xs font-semibold text-gray-700 mb-2">AI 評分（ai_evaluations）</div>
                    {evalRows.length === 0 ? (
                      <div className="text-sm text-gray-400">（無）</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[900px] text-sm table-fixed">
                          <thead>
                            <tr className="text-left text-gray-600 border-b">
                              <th className="py-2 pr-2 w-[260px]">項目</th>
                              <th className="py-2 pr-2 w-[70px]">分數</th>
                              <th className="py-2 pr-0">evidence</th>
                            </tr>
                          </thead>
                          <tbody>
                            {evalRows.map((r) => (
                              <tr key={r.key} className="border-b align-top">
                                <td className="py-2 pr-2 whitespace-normal break-words text-gray-900">
                                  {formatEvalKey(r.key)}
                                </td>
                                <td className="py-2 pr-2 whitespace-nowrap font-mono text-gray-900">
                                  {r.score}
                                </td>
                                <td className="py-2 pr-0">
                                  {r.evidence ? (
                                    <div className="text-sm text-gray-700 whitespace-pre-wrap break-words max-h-[260px] overflow-auto pr-2">
                                      {r.evidence}
                                    </div>
                                  ) : (
                                    <span className="text-gray-400">（無）</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="bg-white border rounded-lg p-3">
                    <div className="text-xs font-semibold text-gray-700 mb-2">面試詳細內容：</div>
                    {(() => {
                      const transcript = Array.isArray(session?.interview_transcript)
                        ? session.interview_transcript
                        : []
                      
                      if (transcript.length === 0) {
                        return <div className="text-sm text-gray-400">尚無面試對話紀錄</div>
                      }

                      return (
                        <div className="max-h-[260px] overflow-y-auto mt-2 p-2 border border-gray-200 bg-gray-50 rounded">
                          {transcript.map((t: any, idx: number) => {
                            const additionsDetail = String(t.additions_detail || '').trim()
                            const deductionsDetail = String(t.deductions_detail || '').trim()
                            const hasCurrentScores =
                              t.current_scores &&
                              typeof t.current_scores === 'object' &&
                              Object.keys(t.current_scores).length > 0
                            const hasPersonality = t.personality && typeof t.personality === 'object'

                            return (
                              <div
                                key={idx}
                                className={`mb-3 text-sm p-2 rounded border ${
                                  t.role === 'ai' ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'
                                }`}
                              >
                                <div className="mb-1">
                                  <span className="font-semibold">
                                    {t.role === 'ai' ? 'AI' : '候選人'}：
                                  </span>
                                  <span>{t.content}</span>
                                </div>

                                {t.aiFeedback && String(t.aiFeedback).trim() && (
                                  <div className="mb-1">
                                    <span className="font-semibold">AI 評語：</span>
                                    <span>{t.aiFeedback}</span>
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
                                    <div className="mb-1 mt-2">
                                      {(hasAdditions || hasDeductions) && (
                                        <div className="font-semibold mb-2">評分事件：</div>
                                      )}
                                      
                                      {hasAdditions && (
                                        <div className="mb-3">
                                          <div className="font-semibold text-xs mb-1 text-green-700">加分項目：</div>
                                          <ul className="ml-5 text-xs list-disc">
                                            {Object.entries(additions).map(([key, items]) => {
                                              if (!Array.isArray(items) || items.length === 0) return null
                                              const criteriaName = formatEvalKey(key)
                                              return (
                                                <li key={key} className="mb-2">
                                                  <div className="font-semibold">{criteriaName}：</div>
                                                  <ul className="ml-4 mt-1 list-disc">
                                                    {items.map((item: any, itemIdx: number) => (
                                                      <li key={itemIdx} className="mb-1">
                                                        {item.detail || '（無說明）'}
                                                        {typeof item.points === 'number' && (
                                                          <span className="text-green-700 font-semibold"> (+{item.points}分)</span>
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
                                          <div className="font-semibold text-xs mb-1 text-red-700">扣分項目：</div>
                                          <ul className="ml-5 text-xs list-disc">
                                            {Object.entries(deductions).map(([key, items]) => {
                                              if (!Array.isArray(items) || items.length === 0) return null
                                              const criteriaName = formatEvalKey(key)
                                              return (
                                                <li key={key} className="mb-2">
                                                  <div className="font-semibold">{criteriaName}：</div>
                                                  <ul className="ml-4 mt-1 list-disc">
                                                    {items.map((item: any, itemIdx: number) => (
                                                      <li key={itemIdx} className="mb-1">
                                                        {item.detail || '（無說明）'}
                                                        {typeof item.points === 'number' && (
                                                          <span className="text-red-700 font-semibold"> ({item.points}分)</span>
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
                                  <div className="mb-1">
                                    <span className="font-semibold">當前分數：</span>
                                    <ul className="ml-4 mt-1 text-xs list-disc">
                                      {Object.entries(t.current_scores).map(([key, value]) => (
                                        <li key={key}>
                                          {formatEvalKey(key)}：{String(value)}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {additionsDetail && (
                                  <div className="mb-1">
                                    <span className="font-semibold">加分說明：</span>
                                    <span>{additionsDetail}</span>
                                  </div>
                                )}

                                {deductionsDetail && (
                                  <div className="mb-1">
                                    <span className="font-semibold">扣分說明：</span>
                                    <span>{deductionsDetail}</span>
                                  </div>
                                )}

                                {hasPersonality && (
                                  <div className="mt-2">
                                    <span className="font-semibold">人格分析：</span>
                                    <div className="ml-3 text-xs">
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
                                      {t.personality.proactivity && (
                                        <div>主動性：{t.personality.proactivity}</div>
                                      )}
                                      {t.personality.learning_mindset && (
                                        <div>學習與成長心態：{t.personality.learning_mindset}</div>
                                      )}
                                      {t.personality.stress_resilience && (
                                        <div>抗壓與情緒穩定：{t.personality.stress_resilience}</div>
                                      )}
                                      {t.personality.collaboration && (
                                        <div>合作與溝通方式：{t.personality.collaboration}</div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </div>

                  <details className="bg-white border rounded-lg p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-gray-700 select-none">
                      原始資料（debug 用）
                    </summary>
                    <div className="grid gap-3 mt-3">
                      <div>
                        <div className="text-xs text-gray-600 mb-1">payload</div>
                        <pre className="text-xs bg-gray-50 border rounded p-3 overflow-auto max-h-[320px]">
                          {JSON.stringify(detail.payload, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">ai_evaluations</div>
                        <pre className="text-xs bg-gray-50 border rounded p-3 overflow-auto max-h-[320px]">
                          {JSON.stringify(aiEvals, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </details>
                </div>
              )
            })()
          )}
        </div>
      )}
    </div>
  )
}


