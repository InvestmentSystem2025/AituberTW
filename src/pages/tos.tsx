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
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

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
        body: JSON.stringify({ email, password, role, nonce: nonceInfo.nonce })
      })
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}))
        throw new Error(j?.code || j?.error || 'SIGNUP_FAILED')
      }

      // try sign in to obtain token for claim (depends on email confirmation policy)
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
      if (signInErr || !signInData?.session?.access_token) {
        // cannot claim immediately; let server hook or Edge function handle later
        window.location.href = '/me'
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
      <div style={{ color: '#666', marginBottom: 12 }}>最新バージョン: {version || '未発行'}</div>
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
          <div style={{ fontWeight: 600 }}>サインアップ</div>
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
          <button type="submit" disabled={loading} style={{ padding: 10 }}>
            {loading ? '処理中…' : 'アカウント作成'}
          </button>
        </form>
      )}

      {message && <p style={{ marginTop: 12, color: '#b00' }}>{message}</p>}
    </div>
  )
}


