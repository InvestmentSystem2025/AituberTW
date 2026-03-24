import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient, getAuthUserIdFromRequest } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') return res.status(405).end()
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })
  const { id, company_id, job_title, use_ai_generate_question, result_notification_method, evaluation_policy, target_hires } = req.body || {}
  if (!id || !company_id) return res.status(400).json({ error: 'MISSING_FIELDS' })

  const supa = getServiceClient()
  const { data: me } = await supa.from('profiles').select('id').eq('auth_id', authUserId).single()
  if (!me) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })
  const { data: scope } = await supa.from('company_members').select('company_role').eq('company_id', company_id).eq('profile_id', me.id).maybeSingle()
  if (!scope) return res.status(403).json({ error: 'FORBIDDEN' })

  let policy: any = undefined
  if (typeof evaluation_policy === 'string' && evaluation_policy.trim().length) {
    try { policy = JSON.parse(evaluation_policy) } catch { return res.status(400).json({ error: 'INVALID_POLICY' }) }
  } else if (evaluation_policy && typeof evaluation_policy === 'object') policy = evaluation_policy

  // 如果 policy 是空對象，設置為 null 以避免違反數據庫約束
  if (policy !== undefined && typeof policy === 'object' && Object.keys(policy).length === 0) {
    policy = null
  }

  const payload: any = {}
  if (typeof job_title === 'string') payload.job_title = job_title
  if (typeof use_ai_generate_question === 'boolean') payload.use_ai_generate_question = use_ai_generate_question
  if (typeof result_notification_method === 'string') payload.result_notification_method = result_notification_method
  if (policy !== undefined) payload.evaluation_policy = policy
  if (target_hires !== undefined) {
    const n = Number(target_hires)
    if (!Number.isFinite(n) || n < 1) return res.status(400).json({ error: 'INVALID_TARGET_HIRES' })
    payload.target_hires = Math.floor(n)
  }

  const { error } = await supa.from('job_opening').update(payload).eq('id', id).eq('company_id', company_id)
  if (error) return res.status(400).json({ error: 'UPDATE_FAILED' })
  return res.status(200).json({ ok: true })
}


