import type { NextApiRequest, NextApiResponse } from 'next'
import { getAuthUserIdFromRequest, getServiceClient } from '@/lib/supabaseServer'
import { handleVercelAiJson } from '../services/vercelAiRoute'

type Resp =
  | { ok: true; text: string; quota?: { used_count: number; free_quota: number; remaining: number } }
  | { error: string; message?: string; detail?: string; upstreamStatus?: number }

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

  // 先做 quota gate（不扣點），避免 AI 失敗時仍被扣點。
  const { data: usage, error: usageErr } = await supa
    .from('company_ai_usage')
    .select('joq_used_count, joq_free_quota')
    .eq('company_id', company_id)
    .maybeSingle()

  if (usageErr) {
    return res.status(400).json({ error: 'QUOTA_READ_FAILED', message: '讀取免費次數失敗，請稍後再試。' })
  }

  const used = Number((usage as any)?.joq_used_count || 0)
  const free = Number((usage as any)?.joq_free_quota || 5)
  if (used >= free) {
    return res.status(403).json({ error: 'AI_JOQ_QUOTA_EXCEEDED', message: 'AI 生成問題免費次數已用完（每家公司共 5 次）。' })
  }

  // 呼叫既有 vercel AI 邏輯；忽略 company_id 欄位即可
  const { company_id: _ignore, ...rawAiBody } = body || {}
  const aiBody = { ...rawAiBody }
  if (typeof aiBody.apiKey === 'string' && !aiBody.apiKey.trim()) {
    delete aiBody.apiKey
  }

  // 直接呼叫 Node 版既有 AI 邏輯，避免 server-to-server HTTP 在站台外層被 401 攔截。
  const aiResp = await handleVercelAiJson(aiBody)

  const payload = await aiResp.json().catch(() => null)
  if (!aiResp.ok) {
    const upstreamErrorCode =
      payload && typeof payload === 'object' && typeof (payload as any).errorCode === 'string'
        ? (payload as any).errorCode
        : 'AI_CALL_FAILED'
    const upstreamDetail =
      payload && typeof payload === 'object' && typeof (payload as any).error === 'string'
        ? (payload as any).error
        : undefined
    const message =
      upstreamErrorCode === 'EmptyAPIKey'
        ? 'AI 金鑰未設定。請先在設定填入對應服務的 API Key，或確認伺服器端環境變數已配置。'
        : 'AI 生成問題失敗，請稍後再試。'

    return res.status(aiResp.status || 400).json({
      error: upstreamErrorCode,
      message,
      detail: upstreamDetail,
      upstreamStatus: aiResp.status,
    })
  }

  if (!payload || typeof payload.text !== 'string') {
    return res.status(400).json({ error: 'AI_CALL_FAILED', message: 'AI 生成問題失敗，回應格式不正確。' })
  }

  // AI 成功後才扣點。若併發競態造成額度剛好被扣完，會在這裡被正確擋下。
  const { data: quotaConsumeData, error: quotaErr } = await supa.rpc('consume_company_joq_quota', { p_company_id: company_id })
  if (quotaErr) {
    const msg = quotaErr.message || ''
    if (msg.includes('AI_JOQ_QUOTA_EXCEEDED')) {
      return res.status(403).json({ error: 'AI_JOQ_QUOTA_EXCEEDED', message: 'AI 生成問題免費次數已用完（每家公司共 5 次）。' })
    }
    return res.status(400).json({ error: 'QUOTA_CONSUME_FAILED', message: '扣點失敗，請稍後再試。' })
  }

  const quota = {
    used_count: Number((quotaConsumeData as any)?.used_count || 0),
    free_quota: Number((quotaConsumeData as any)?.free_quota || 5),
    remaining: Number((quotaConsumeData as any)?.remaining || 0),
  }

  return res.status(200).json({ ok: true, text: payload.text, quota })
}


