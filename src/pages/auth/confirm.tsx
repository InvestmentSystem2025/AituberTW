import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Status = 'verifying' | 'success' | 'error'
type VerifyType = 'signup' | 'magiclink' | 'recovery' | 'invite' | 'email_change'

const fallbackRedirect = '/login'

const ConfirmEmailPage = () => {
  const router = useRouter()
  const [status, setStatus] = useState<Status>('verifying')
  const [message, setMessage] = useState<string>('驗證中，請稍候…')
  const [ctaLabel, setCtaLabel] = useState<string>('前往登入頁')
  const [ctaHref, setCtaHref] = useState<string>(fallbackRedirect)

  useEffect(() => {
    if (!router.isReady) return

    const query = router.query
    // 自管驗證流程：後端已完成驗證並帶 ok=1
    const okParam = typeof query.ok === 'string' ? query.ok : undefined
    if (okParam === '1' || okParam?.toLowerCase() === 'true') {
      setStatus('success')
      setMessage('電子郵件已驗證，請登入帳號以繼續。')
      setCtaLabel('前往登入頁')
      setCtaHref('/login')
      return
    }

    const tokenParam = typeof query.token === 'string' ? query.token : null
    const tokenHashParam = typeof query.token_hash === 'string' ? query.token_hash : null
    const codeParam = typeof query.code === 'string' ? query.code : null
    const typeParam = typeof query.type === 'string' ? query.type : 'signup'
    const emailParam = typeof query.email === 'string' ? query.email : undefined

    if (!tokenParam && !tokenHashParam && !codeParam) {
      setStatus('error')
      setMessage('驗證連結不完整或已失效。')
      return
    }

    const normalizeType = (raw: string): VerifyType => {
      const lower = raw.toLowerCase()
      if (lower === 'magiclink') return 'magiclink'
      if (lower === 'recovery') return 'recovery'
      if (lower === 'invite') return 'invite'
      if (lower === 'email_change') return 'email_change'
      return 'signup'
    }

    const verify = async () => {
      try {
        const normalizedType = normalizeType(typeParam)

        const verifyWithToken = async () => {
          if (!emailParam) {
            throw new Error('驗證時缺少 email 資訊，請重新請求驗證連結。')
          }

          const result = await supabase.auth.verifyOtp({
            type: normalizedType,
            token: tokenParam ?? codeParam!,
            email: emailParam
          })

          return result
        }

        const verifyWithTokenHash = async () =>
          supabase.auth.verifyOtp({
            type: normalizedType,
            token_hash: tokenHashParam ?? tokenParam ?? codeParam!
          })

        const shouldUseTokenHash =
          !!tokenHashParam ||
          (!emailParam && (normalizedType === 'invite' || normalizedType === 'email_change'))

        const result = shouldUseTokenHash ? await verifyWithTokenHash() : await verifyWithToken()

        if (result.error) throw result.error

        // 如果 Supabase 回傳 session，代表已完成登入
        if (result.data?.session) {
          setMessage('電子郵件已驗證，系統將自動帶您前往個人頁面。')
          setCtaLabel('前往個人頁')
          setCtaHref('/me')
          setStatus('success')
          setTimeout(() => router.replace('/me'), 1800)
        } else {
          setMessage('電子郵件已驗證，請登入帳號以繼續。')
          setStatus('success')
        }
      } catch (err: any) {
        console.error('Failed to verify email token', err)
        setStatus('error')
        setMessage(err?.message || '驗證失敗，請確認連結是否已使用或逾時。')
      }
    }

    verify()
  }, [router])

  return (
    <div style={{ maxWidth: 480, margin: '60px auto', padding: '24px', border: '1px solid #e5e7eb', borderRadius: 12, textAlign: 'center' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Email 驗證</h1>
      <p style={{ marginBottom: 24, color: status === 'error' ? '#b91c1c' : '#111827' }}>{message}</p>
      {status !== 'verifying' && (
        <a
          href={ctaHref}
          style={{
            display: 'inline-block',
            padding: '10px 18px',
            borderRadius: 8,
            backgroundColor: '#2563eb',
            color: '#fff',
            textDecoration: 'none'
          }}
        >
          {ctaLabel}
        </a>
      )}
    </div>
  )
}

export default ConfirmEmailPage

