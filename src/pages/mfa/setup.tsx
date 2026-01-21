import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type EnrollResp =
  | { ok: true; otpauth_url?: string; secret_base32?: string; already_enabled?: boolean; expires_in_seconds?: number }
  | { ok: false; error: string; message?: string }

const isEnrollOk = (x: unknown): x is Extract<EnrollResp, { ok: true }> => {
  return !!x && typeof x === 'object' && (x as any).ok === true
}

export default function MfaSetupPage() {
  const [loading, setLoading] = useState(true)
  const [otpauthUrl, setOtpauthUrl] = useState<string>('')
  const [secret, setSecret] = useState<string>('')
  const [code, setCode] = useState<string>('')
  const [message, setMessage] = useState<string>('')
  const [verifying, setVerifying] = useState(false)
  const [alreadyEnabled, setAlreadyEnabled] = useState(false)
  const [qrBlobUrl, setQrBlobUrl] = useState<string>('')

  const qrApiUrl = useMemo(() => {
    if (!otpauthUrl) return ''
    // 伺服器端生成 QR（避免依賴外部服務）；注意：<img> 不會自帶 Authorization header，
    // 因此前端會用 fetch 取得 blob，再轉成 object URL 顯示。
    return `/api/mfa/totp/qr-code?otpauth_url=${encodeURIComponent(otpauthUrl)}`
  }, [otpauthUrl])

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setMessage('')
      try {
        const { data: session } = await supabase.auth.getSession()
        const token = session.session?.access_token
        if (!token) {
          window.location.href = '/login'
          return
        }

        // 首次登入時 profiles 可能晚一步才建立，enroll 會回 PROFILE_NOT_FOUND
        // 這裡做短暫重試，避免使用者卡住。
        const maxAttempts = 10
        const sleepMs = 400
        let lastErr: any = null
        let j: EnrollResp | null = null
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const r = await fetch('/api/mfa/totp/enroll', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          })
          j = (await r.json().catch(() => null)) as EnrollResp | null
          if (r.ok && isEnrollOk(j)) {
            lastErr = null
            break
          }
          const errCode = (j as any)?.error
          lastErr = errCode || (!r.ok ? `HTTP_${r.status}` : 'UNKNOWN')
          if (errCode !== 'PROFILE_NOT_FOUND') break
          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, sleepMs))
          }
        }
        if (!isEnrollOk(j)) {
          setMessage((j as any)?.message || (j as any)?.error || lastErr || '載入 MFA 設定失敗')
          return
        }
        if (j.already_enabled) {
          setAlreadyEnabled(true)
          setMessage('Authenticator 已完成設定。')
          return
        }
        setOtpauthUrl(j.otpauth_url || '')
        setSecret(j.secret_base32 || '')
      } catch (e: any) {
        setMessage(e?.message || '載入 MFA 設定失敗')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  useEffect(() => {
    if (!qrApiUrl) {
      if (qrBlobUrl) URL.revokeObjectURL(qrBlobUrl)
      setQrBlobUrl('')
      return
    }

    const controller = new AbortController()
    const run = async () => {
      try {
        const { data: session } = await supabase.auth.getSession()
        const token = session.session?.access_token
        if (!token) return

        const r = await fetch(qrApiUrl, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        if (!r.ok) return
        const blob = await r.blob()
        const nextUrl = URL.createObjectURL(blob)
        setQrBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return nextUrl
        })
      } catch {
        // ignore (abort / network)
      }
    }
    run()

    return () => {
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrApiUrl])

  useEffect(() => {
    return () => {
      if (qrBlobUrl) URL.revokeObjectURL(qrBlobUrl)
    }
  }, [qrBlobUrl])

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setVerifying(true)
    setMessage('')
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      if (!token) {
        window.location.href = '/login'
        return
      }

      const r = await fetch('/api/mfa/totp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code }),
      })
      const j = await r.json()
      if (!j?.ok) {
        setMessage(j?.message || '認證碼錯誤或已過期。')
        return
      }
      setMessage('設定完成，將帶您回到個人頁。')
      setTimeout(() => {
        window.location.href = '/me'
      }, 700)
    } catch (e: any) {
      setMessage(e?.message || '驗證失敗')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: '48px auto', padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>設定 Authenticator（必要）</h1>
      <p style={{ color: '#374151', marginBottom: 16 }}>
        首次登入後需完成 Authenticator 設定，完成後才可進入系統並開始面試。
      </p>

      {loading ? (
        <p>載入中…</p>
      ) : alreadyEnabled ? (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
          <p style={{ marginBottom: 12 }}>{message}</p>
          <Link href="/me" style={{ color: '#2563eb', textDecoration: 'none' }}>
            前往個人頁
          </Link>
        </div>
      ) : (
        <>
          {message && <p style={{ color: '#b91c1c', marginBottom: 12 }}>{message}</p>}

          <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, alignItems: 'start' }}>
            <div style={{ textAlign: 'center', border: '2px solid rgb(152 155 161)', borderRadius: 12, padding: 12 }}>
              <p >若尚未下載 Authenticator，請先下載並完成註冊</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/MFA/authQR.png"
                alt="Authenticator 下載 QR"
                width={220}
                height={220}
                style={{ borderRadius: 12, border: '1px solid #e5e7eb', marginTop: 30 }}
              />
              <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>掃描此 QR 取得下載連結</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, alignItems: 'start' }}>
              <div style={{ textAlign: 'center', border: '2px solid rgb(152 155 161)', borderRadius: 12, padding: 12 }}>
                <p>若已下載並註冊Authenticator，請用Authenticator掃描下方QR code以新增帳戶。</p>
                {qrBlobUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrBlobUrl}
                    alt="Authenticator 綁定 QR"
                    width={220}
                    height={220}
                    style={{ borderRadius: 12, border: '1px solid #e5e7eb', margin: '0 auto' }}
                  />
                ) : (
                  <div style={{ width: 220, height: 220, borderRadius: 12, border: '1px dashed #d1d5db' }} />
                )}
                <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>用 Authenticator 掃描以新增帳號</p>
              </div>

              <div style={{ border: '2px solid rgb(152 155 161)', borderRadius: 12, padding: 12 }}>
                <div style={{ marginBottom: 12, padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fafafa' }}>
                  <p>新增帳戶完成後請在下方輸入驗證碼並完成設定即可開始使用。</p>
                  {/* <div style={{ fontSize: 12, color: '#6b7280' }}>手動輸入金鑰（無法掃描時）</div>
                  <div style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{secret || '（未取得）'}</div> */}
                </div>

                <form onSubmit={onVerify} style={{ display: 'grid', gap: 10 }}>
                  <label>
                    輸入 6 位認證碼
                    <input
                      value={code}
                      onChange={(e) => {
                        // 自動過濾非數字（避免貼上含空格/換行/破折號等造成瀏覽器格式錯誤提示）
                        const onlyDigits = e.target.value.replace(/[^\d]/g, '').slice(0, 6)
                        setCode(onlyDigits)
                      }}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      placeholder="123456"
                      required
                      style={{ width: '100%', padding: 10, marginTop: 6, border: 'solid 2px #000000ff' }}
                    />
                  </label>
                  <button type="submit" disabled={verifying} style={{ padding: 10 }}>
                    {verifying ? '驗證中…' : '完成設定'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}


