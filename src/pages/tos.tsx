import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type PreconsentResp = { nonce: string; terms_version: string; expires_at: string }

export default function TosAndSignupPage() {
  const [body, setBody] = useState<string>('')
  const [version, setVersion] = useState<string>('')
  const [checked, setChecked] = useState(false)
  const [nonceInfo, setNonceInfo] = useState<PreconsentResp | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'jobSeeker' | 'recruiter'>('jobSeeker')
  const [preferredLanguage, setPreferredLanguage] = useState<'zh-TW' | 'en-US' | 'ja-JP'>('zh-TW')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      // 後端代理（Service Role）讀取最新版與本文
      const r = await fetch('/api/tos/latest')
      if (!r.ok) {
        setMessage('規約の取得に失敗しました')
        return
      }
      const j = await r.json()
      setVersion(j.version || '')
      setBody(j.body || '')
    }
    load()
  }, [])

  // 取得目前登入使用者的 access token（如已登入）
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const s = await supabase.auth.getSession()
        setToken(s.data.session?.access_token || null)
      } catch {
        setToken(null)
      }
    }
    fetchSession()
  }, [])

  const onAgree = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const ua = navigator.userAgent
      const resp = await fetch('/api/tos/preconsent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_agent: ua })
      })
      if (!resp.ok) throw new Error('PRECONSENT_FAILED')
      const json = (await resp.json()) as PreconsentResp

      // 已登入：直接 claim 並導向 /me
      let claimToken = token
      if (!claimToken) {
        // 再次嘗試取得最新 session（避免競態）
        const s = await supabase.auth.getSession()
        claimToken = s.data.session?.access_token || null
      }

      if (claimToken) {
        const claimResp = await fetch('/api/tos/claim', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${claimToken}`,
          },
          body: JSON.stringify({ nonce: json.nonce }),
        })
        if (!claimResp.ok) {
          // 如果是 401，可能是 token 失效（如數據庫被重置）
          if (claimResp.status === 401) {
            // 清除舊的 session
            await supabase.auth.signOut()
            setToken(null)
            // 清除 nonce 但重新設置（因為 preconsent 已成功），直接顯示註冊表單
            setNonceInfo(json)
            setMessage('セッションが無効になりました。下記フォームからアカウントを作成してください。')
            setLoading(false)
            return
          }
          const j = await claimResp.json().catch(() => ({}))
          throw new Error(j?.error || 'CLAIM_FAILED')
        }
        window.location.href = '/me'
        return
      }

      // 未登入：顯示註冊表單
      setNonceInfo(json)
    } catch (e: any) {
      setMessage(e?.message || '同意処理に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nonceInfo) return
    setLoading(true)
    setMessage(null)
    try {
      const resp = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          role,
          nonce: nonceInfo.nonce,
          preferredLanguage,
        })
      })
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}))
        throw new Error(j?.code || j?.error || 'SIGNUP_FAILED')
      }

      // try sign in to obtain token for claim (depends on email confirmation policy)
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
      if (signInErr || !signInData?.session?.access_token) {
        setMessage('帳號已建立，請前往信箱點擊驗證連結後再登入。')
        return
      }
      // claim
      const claimResp = await fetch('/api/tos/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${signInData.session.access_token}`
        },
        body: JSON.stringify({ nonce: nonceInfo.nonce })
      })
      if (!claimResp.ok) {
        const j = await claimResp.json().catch(() => ({}))
        throw new Error(j?.error || 'CLAIM_FAILED')
      }
      window.location.href = '/me'
    } catch (err: any) {
      const code = String(err?.message || '')
      if (code === 'TOS_EXPIRED') {
        setMessage('同意の有効期限が切れました。もう一度お試しください。')
        setNonceInfo(null)
      } else if (code === 'TOS_MISMATCH') {
        setMessage('規約の最新版が更新されました。最新に同意してください。')
        setNonceInfo(null)
      } else {
        setMessage('サインアップに失敗しました。' + code)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '48px auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>使用規約</h1>
      <div style={{ color: '#666', marginBottom: 12 }}>最新版本: {version || '未発行'}</div>
      {!nonceInfo && (
        <>
          <div style={{ whiteSpace: 'pre-wrap', border: '1px solid #ddd', padding: 16, borderRadius: 8, maxHeight: 360, overflow: 'auto' }}>
            {body || '（管理者が terms_of_service に本文を登録してください）'}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            同意します
          </label>
          <div style={{ marginTop: 12 }}>
            <button disabled={!checked || loading || !version} onClick={onAgree} style={{ padding: '8px 12px' }}>
              {loading ? '処理中…' : '同意する'}
            </button>
          </div>
        </>
      )}

      {nonceInfo && (
        <form onSubmit={onSignup} style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <div style={{ fontWeight: 600 }}>註冊</div>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%', padding: 8, marginTop: 4 }} />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} style={{ width: '100%', padding: 8, marginTop: 4 }} />
          </label>
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value as any)} style={{ width: '100%', padding: 8, marginTop: 4 }}>
              <option value="jobSeeker">jobSeeker</option>
              <option value="recruiter">recruiter</option>
            </select>
          </label>
          <label>
            偏好面試語言 / Preferred interview language
            <select
              value={preferredLanguage}
              onChange={(e) =>
                setPreferredLanguage(e.target.value as 'zh-TW' | 'en-US' | 'ja-JP')
              }
              style={{ width: '100%', padding: 8, marginTop: 4 }}
              required
            >
              <option value="zh-TW">繁體中文 (zh-TW)</option>
              <option value="en-US">English (en-US)</option>
              <option value="ja-JP">日本語 (ja-JP)</option>
            </select>
          </label>
          <button type="submit" disabled={loading} style={{ padding: 10 }}>
            {loading ? '処理中…' : 'アカウント作成'}
          </button>
        </form>
      )}

      {message && <p style={{ marginTop: 12, color: '#b00' }}>{message}</p>}
    </div>
  )
}


