import type { NextApiRequest, NextApiResponse } from 'next'
import { getAuthUserIdFromRequest, getServiceClient } from '@/lib/supabaseServer'

type InterviewResultType = 'hired' | 'rejected' | 'onHold'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const { interviews_id, interview_result }: { interviews_id?: string; interview_result?: InterviewResultType } = req.body || {}

  if (!interviews_id) {
    return res.status(400).json({ error: 'MISSING_INTERVIEWS_ID' })
  }

  if (!interview_result || !['hired', 'rejected', 'onHold'].includes(interview_result)) {
    return res.status(400).json({ error: 'INVALID_INTERVIEW_RESULT' })
  }

  const supa = getServiceClient()

  // 取得當前使用者 profile
  const { data: me } = await supa.from('profiles').select('id').eq('auth_id', authUserId).single()
  if (!me) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })

  // 取得面試資訊並確認公司
  const { data: interview } = await supa
    .from('interviews')
    .select('id, company_id')
    .eq('id', interviews_id)
    .single()

  if (!interview) {
    return res.status(404).json({ error: 'INTERVIEW_NOT_FOUND' })
  }

  // 權限檢查：必須是該公司的成員
  const { data: scope } = await supa
    .from('company_members')
    .select('profile_id')
    .eq('company_id', interview.company_id)
    .eq('profile_id', me.id)
    .maybeSingle()

  if (!scope) return res.status(403).json({ error: 'FORBIDDEN' })

  // 取得對應的 interview_session
  const { data: session } = await supa
    .from('interview_sessions')
    .select('id, review_type')
    .eq('interviews_id', interviews_id)
    .maybeSingle()

  if (!session) {
    return res.status(404).json({ error: 'SESSION_NOT_FOUND' })
  }

  // 根據目前 review_type 決定是否允許人工評價（前端也會做限制，這裡再雙重保護）
  if (session.review_type === 'AI') {
    return res.status(400).json({ error: 'REVIEW_TYPE_IS_AI' })
  }

  const reason =
    interview_result === 'hired'
      ? '人類評價：錄取'
      : interview_result === 'rejected'
      ? '人類評價：拒絕'
      : '人類評價：保留'

  const { error } = await supa
    .from('interview_sessions')
    .update({
      interview_result,
      result_reason: reason,
    })
    .eq('id', session.id)

  if (error) {
    return res.status(400).json({ error: 'EVALUATE_FAILED', details: error.message })
  }

  return res.status(200).json({ ok: true })
}
