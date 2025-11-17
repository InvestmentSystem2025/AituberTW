import type { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'
import { getServiceClient } from '@/lib/supabaseServer'
import { sendMail } from '@/lib/mailer'

type Req = { email: string; password: string; role: 'jobSeeker' | 'recruiter'; nonce: string }
type Resp = { ok: true } | { error: string; code?: string }

const trimTrailingSlash = (url: string) => url.replace(/\/+$/, '')
const buildEmailRedirectUrl = (): string | undefined => {
  const base =
    process.env.AUTH_REDIRECT_URL ||
    process.env.SMTP_DEFAULT_REDIRECT_URL?.replace(/\/login$/, '') ||
    process.env.FRONTEND_ORIGIN ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3000'
  const confirmationPath = process.env.SMTP_CONFIRMATION_PATH || '/auth/confirm'
  const normalizedBase = trimTrailingSlash(base)
  const normalizedPath = confirmationPath.startsWith('/') ? confirmationPath : `/${confirmationPath}`
  return `${normalizedBase}${normalizedPath}`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Resp>) {
  if (req.method !== 'POST') return res.status(405).end()
  const { email, password, role, nonce } = (req.body || {}) as Req
  if (!email || !password || !role || !nonce) return res.status(400).json({ error: 'MISSING_FIELDS' })

  const svc = getServiceClient()

  // 使用 Admin API 建立使用者，避免觸發 GoTrue 內建寄信
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { nonce, role }
  })

  if (error) {
    // map some DB function errors if bubbled later
    return res.status(400).json({ error: error.message, code: error.message.includes('expired') ? 'TOS_EXPIRED' : undefined })
  }

  // 自管郵件驗證：建立驗證 token 並寄送一封自家郵件
  try {
    const authUserId = data?.user?.id
    if (authUserId) {
      const rawToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h

      await svc.from('email_verifications').upsert(
        [
          {
            user_id: authUserId,
            token_hash: tokenHash,
            type: 'signup',
            expires_at: expiresAt
          }
        ],
        { onConflict: 'user_id,type' }
      )

      const base = (process.env.AUTH_REDIRECT_URL ||
        process.env.FRONTEND_ORIGIN ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        'http://localhost:3000') as string
      const verifyUrl = `${base.replace(/\/+$/, '')}/api/auth/verify-email?token=${rawToken}`

      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6">
          <h2>請驗證您的電子郵件</h2>
          <p>請在 24 小時內點擊下方按鈕完成驗證：</p>
          <p><a href="${verifyUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">驗證電子郵件</a></p>
          <p>或直接開啟連結：<br>${verifyUrl}</p>
          <p style="color:#666;font-size:12px">若非您本人操作，請忽略此郵件。</p>
        </div>
      `
      await sendMail({
        to: email,
        subject: '請驗證您的電子郵件',
        html,
        text: `請在 24 小時內開啟以下連結完成驗證： ${verifyUrl}`
      })
    }
  } catch (e) {
    // 不阻斷註冊流程，但記錄伺服端日誌
    console.warn('custom email verification send failed:', e)
  }

  return res.status(200).json({ ok: true })
}



