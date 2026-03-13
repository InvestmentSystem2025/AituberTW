import type { NextApiRequest, NextApiResponse } from 'next'
import { createAuthContext } from '@/lib/authContext'

type Resp =
  | { ok: true; usage?: { used_count: number; free_quota: number }; did_increment?: boolean }
  | { ok: false; error: string; message?: string }

const MSG_MFA_REQUIRED = '開始面試前需要完成 Authenticator 認證。'
const MSG_QUOTA_EXCEEDED = '免費使用次數已用完，請升級方案以繼續使用。'
const MSG_INTERVIEW_NOT_STARTABLE = '此面試已無法開始（可能已完成/取消/超時）。'

export default async function handler(req: NextApiRequest, res: NextApiResponse<Resp>) {
  if (req.method !== 'POST') return res.status(405).end()

  const ctx = createAuthContext(req)
  const authUserId = await ctx.getAuthUserId()
  if (!authUserId) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' })

  const interviews_id = String(req.body?.interviews_id || '').trim()
  if (!interviews_id) return res.status(400).json({ ok: false, error: 'MISSING_INTERVIEWS_ID' })

  const supa = ctx.supa

  const { data, error } = await supa.rpc('start_interview_session', {
    p_interviews_id: interviews_id,
    p_auth_user_id: authUserId,
  })

  if (error) {
    const msg = error.message || ''
    if (msg.includes('MFA_REQUIRED')) {
      return res.status(403).json({ ok: false, error: 'MFA_REQUIRED', message: MSG_MFA_REQUIRED })
    }
    if (msg.includes('FREE_QUOTA_EXCEEDED')) {
      return res.status(403).json({ ok: false, error: 'FREE_QUOTA_EXCEEDED', message: MSG_QUOTA_EXCEEDED })
    }
    if (msg.includes('INTERVIEW_NOT_STARTABLE')) {
      return res.status(403).json({ ok: false, error: 'INTERVIEW_NOT_STARTABLE', message: MSG_INTERVIEW_NOT_STARTABLE })
    }
    if (msg.includes('FORBIDDEN')) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
    if (msg.includes('PROFILE_NOT_FOUND')) return res.status(400).json({ ok: false, error: 'PROFILE_NOT_FOUND' })
    if (msg.includes('INTERVIEW_NOT_FOUND')) return res.status(404).json({ ok: false, error: 'INTERVIEW_NOT_FOUND' })
    return res.status(400).json({ ok: false, error: 'START_SESSION_FAILED' })
  }

  const usage = data?.usage
  return res.status(200).json({
    ok: true,
    did_increment: !!data?.did_increment,
    usage: usage ? { used_count: usage.used_count, free_quota: usage.free_quota } : undefined,
  })
}


