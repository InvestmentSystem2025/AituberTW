import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'

type PublicReviewPayload = {
  company?: { company_name?: string }
  job_opening?: { job_title?: string }
}

export default function ResumeReviewPage() {
  const router = useRouter()
  const token = useMemo(() => String(router.query.token || ''), [router.query.token])

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<PublicReviewPayload | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [done, setDone] = useState(false)
  const [showHint, setShowHint] = useState(true)

  useEffect(() => {
    if (!token) return
    const init = async () => {
      setLoading(true)
      setError('')
      const { data: session } = await supabase.auth.getSession()
      const loginToken = session.session?.access_token
      if (!loginToken) {
        const redirect = `/resume-review?token=${encodeURIComponent(token)}`
        router.replace(`/tos?redirect=${encodeURIComponent(redirect)}`)
        return
      }

      const r = await fetch(`/api/resume-reviews/public/get?token=${encodeURIComponent(token)}`)
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(j.error || 'TOKEN_NOT_AVAILABLE')
        setLoading(false)
        return
      }
      setData(j)
      setLoading(false)
    }
    void init()
  }, [token, router])

  const submit = async () => {
    if (!file || !token) {
      setError('請先上傳履歷檔案')
      return
    }
    setSubmitting(true)
    setError('')

    const { data: session } = await supabase.auth.getSession()
    const loginToken = session.session?.access_token
    if (!loginToken) {
      setSubmitting(false)
      setError('LOGIN_REQUIRED')
      return
    }

    const formData = new FormData()
    formData.append('token', token)
    formData.append('file', file)

    const r = await fetch('/api/resume-reviews/public/submit', {
      method: 'POST',
      headers: { 'x-supabase-token': loginToken },
      body: formData,
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      setError(j.error || 'SUBMIT_FAILED')
      setSubmitting(false)
      return
    }

    setDone(true)
    setSubmitting(false)
  }

  if (!token) {
    return <div style={{ maxWidth: 720, margin: '24px auto', padding: 16 }}>缺少 token</div>
  }

  if (loading) {
    return <div style={{ maxWidth: 720, margin: '24px auto', padding: 16 }}>載入中...</div>
  }

  if (done) {
    return (
      <div style={{ maxWidth: 720, margin: '24px auto', padding: 16, border: '2px solid #000', borderRadius: 8, background: '#e6f2ff' }}>
        履歷審查已完成，結果已送交招募方，感謝您的提交。
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720, margin: '24px auto', padding: 16 }}>
      {showHint && (
        <div style={{ border: '2px solid #000', borderRadius: 8, padding: 12, marginBottom: 12, background: '#fff7e6' }}>
          <div style={{ marginBottom: 8 }}>請上傳履歷，確認後按「開始審查」。</div>
          <button onClick={() => setShowHint(false)} style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4 }}>
            我知道了
          </button>
        </div>
      )}

      <div style={{ border: '2px solid #000', borderRadius: 8, padding: 16, background: '#e6f2ff' }}>
        <h2 style={{ marginTop: 0 }}>履歷審查</h2>
        <div>公司：{data?.company?.company_name || '-'}</div>
        <div>職缺：{data?.job_opening?.job_title || '-'}</div>

        <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <div style={{ marginTop: 12 }}>
          <button
            onClick={submit}
            disabled={submitting}
            style={{ padding: '8px 12px', background: submitting ? '#9ca3af' : '#16a34a', color: '#fff', border: 'none', borderRadius: 4 }}
          >
            {submitting ? '審查中...' : '開始審查'}
          </button>
        </div>
        {error && <div style={{ marginTop: 10, color: '#b00000' }}>錯誤：{error}</div>}
      </div>
    </div>
  )
}
