import type { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'
import { getServiceClient } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = (req.query.token || req.body?.token) as string | undefined
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'MISSING_TOKEN' })
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const svc = getServiceClient()

  // 1) 找到有效 token
  const { data: rows, error: selErr } = await svc
    .from('email_verifications')
    .select('*')
    .eq('token_hash', tokenHash)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .limit(1)

  if (selErr) return res.status(500).json({ error: selErr.message })
  const row = rows?.[0]
  if (!row) return res.status(400).json({ error: 'INVALID_OR_EXPIRED_TOKEN' })

  const userId: string = row.user_id

  // 2) 標記 token 已使用（冪等）
  const { error: updErr } = await svc
    .from('email_verifications')
    .update({ used_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('used_at', null)

  if (updErr) return res.status(500).json({ error: updErr.message })

  // 3) 以 Admin 權限確認使用者 Email（GoTrue）
  const { error: adminErr } = await svc.auth.admin.updateUserById(userId, { email_confirm: true })
  if (adminErr) {
    // 還原 used_at？通常不需要；回傳錯誤方便重寄
    return res.status(500).json({ error: adminErr.message })
  }

  // 4) 導回前端結果頁
  const base =
    (process.env.AUTH_REDIRECT_URL ||
      process.env.SMTP_DEFAULT_REDIRECT_URL ||
      process.env.FRONTEND_ORIGIN ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'http://localhost:3000') as string
  const redirect = `${base.replace(/\/+$/, '')}/auth/confirm?ok=1`
  res.writeHead(302, { Location: redirect })
  res.end()
}


