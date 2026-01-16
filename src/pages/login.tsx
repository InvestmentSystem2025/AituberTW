import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      setMessage('登入成功！')
      // 同意未完はガードして /tos へ
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (token) {
        const resp = await fetch('/api/me/tos', { headers: { Authorization: `Bearer ${token}` } })
        const json = await resp.json()
        if (!json.accepted) {
          window.location.href = '/tos'
          return
        }

        // MFA 未完成則強制導去設定頁（首次登入 gate）
        const mfaResp = await fetch('/api/me/mfa', { headers: { Authorization: `Bearer ${token}` } })
        const mfaJson = await mfaResp.json().catch(() => ({} as any))
        // 保守策略：只要不是「明確已完成 MFA」，就先去 /mfa/setup，避免落到 /me 再被 gate 轉跳
        if (!mfaResp.ok || !mfaJson || mfaJson.mfa_enabled !== true) {
          window.location.href = '/mfa/setup'
          return
        }
      }
      window.location.href = '/me'
    } catch (err: any) {
      setMessage(err?.message ?? '登入失敗')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '64px auto', padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>登入</h1>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: 8, marginTop: 4 }}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: 8, marginTop: 4 }}
          />
        </label>
        <button type="submit" disabled={loading} style={{ padding: 10 }}>
          {loading ? '處理中…' : '登入'}
        </button>
      </form>
      {message && <p style={{ marginTop: 12 }}>{message}</p>}
      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <Link href="/tos" style={{ color: '#007bff', textDecoration: 'none' }}>
          還沒有帳號？立即註冊
        </Link>
      </div>
    </div>
  )
}
