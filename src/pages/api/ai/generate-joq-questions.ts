import type { NextApiRequest, NextApiResponse } from 'next'
import { getAuthUserIdFromRequest, getServiceClient } from '@/lib/supabaseServer'

type Resp =
  | { ok: true; text: string }
  | { error: string; message?: string }

export default async function handler(req: NextApiRequest, res: NextApiResponse<Resp>) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: '不支援此方法。' })

  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED', message: '請先登入。' })

  const body = (req.body && typeof req.body === 'object') ? req.body : {}
  const company_id = String(body?.company_id || '').trim()
  if (!company_id) return res.status(400).json({ error: 'MISSING_COMPANY_ID', message: '缺少 company_id。' })

  const supa = getServiceClient()

  const { data: me, error: meErr } = await supa
    .from('profiles')
    .select('id, role')
    .eq('auth_id', authUserId)
    .maybeSingle()
  if (meErr || !me?.id) return res.status(400).json({ error: 'PROFILE_NOT_FOUND', message: '找不到使用者資料。' })

  if (me.role !== 'recruiter') {
    return res.status(403).json({ error: 'FORBIDDEN', message: '權限不足（僅 recruiter 可使用）。' })
  }

  const { data: scope, error: scopeErr } = await supa
    .from('company_members')
    .select('id')
    .eq('company_id', company_id)
    .eq('profile_id', me.id)
    .maybeSingle()
  if (scopeErr) return res.status(400).json({ error: 'SCOPE_CHECK_FAILED', message: '權限檢查失敗。' })
  if (!scope) return res.status(403).json({ error: 'FORBIDDEN', message: '您不是此公司的成員。' })

  const { error: quotaErr } = await supa.rpc('consume_company_joq_quota', { p_company_id: company_id })
  if (quotaErr) {
    const msg = quotaErr.message || ''
    if (msg.includes('AI_JOQ_QUOTA_EXCEEDED')) {
      return res.status(403).json({ error: 'AI_JOQ_QUOTA_EXCEEDED', message: 'AI 生成問題免費次數已用完（每家公司共 5 次）。' })
    }
    return res.status(400).json({ error: 'QUOTA_CONSUME_FAILED', message: '扣點失敗，請稍後再試。' })
  }

  // 呼叫既有 vercel AI 邏輯；忽略 company_id 欄位即可
  const { company_id: _ignore, ...aiBody } = body || {}

  // 不動既有 /api/ai/vercel（其他功能也在用）。在此只做 proxy 呼叫。
  const proto = (req.headers['x-forwarded-proto'] as string) || 'http'
  const host = (req.headers['x-forwarded-host'] as string) || (req.headers.host as string) || ''
  if (!host) return res.status(500).json({ error: 'SERVER_MISCONFIGURED', message: '伺服器缺少 host。' })
  const origin = `${proto}://${host}`

  const aiResp = await fetch(`${origin}/api/ai/vercel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(aiBody),
  })

  const payload = await aiResp.json().catch(() => null)
  if (!aiResp.ok || !payload || typeof payload.text !== 'string') {
    return res.status(400).json({ error: 'AI_CALL_FAILED', message: 'AI 生成問題失敗，請稍後再試。' })
  }

  return res.status(200).json({ ok: true, text: payload.text })
}


