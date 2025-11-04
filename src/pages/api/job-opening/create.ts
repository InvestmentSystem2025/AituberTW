import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient, getAuthUserIdFromRequest } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })
  const { company_id, job_title, use_ai_generate_question, result_notification_method, evaluation_policy } = req.body || {}
  if (!company_id || !job_title) return res.status(400).json({ error: 'MISSING_FIELDS' })

  const supa = getServiceClient()
  const { data: me } = await supa.from('profiles').select('id').eq('auth_id', authUserId).single()
  if (!me) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })
  const { data: scope } = await supa.from('company_members').select('company_role').eq('company_id', company_id).eq('profile_id', me.id).maybeSingle()
  if (!scope) return res.status(403).json({ error: 'FORBIDDEN' })

  let policy: any = null
  if (typeof evaluation_policy === 'string' && evaluation_policy.trim().length) {
    try { policy = JSON.parse(evaluation_policy) } catch { return res.status(400).json({ error: 'INVALID_POLICY' }) }
  } else if (evaluation_policy && typeof evaluation_policy === 'object') policy = evaluation_policy

  // 如果 policy 是空對象，設置為 null 以避免違反數據庫約束
  if (policy && typeof policy === 'object' && Object.keys(policy).length === 0) {
    policy = null
  }

  const { data: inserted, error } = await supa.from('job_opening').insert({
    company_id,
    job_title,
    use_ai_generate_question: !!use_ai_generate_question,
    result_notification_method: result_notification_method || 'immediate',
    evaluation_policy: policy
  }).select('id').single()
  
  if (error) return res.status(400).json({ error: 'CREATE_FAILED' })
  return res.status(200).json({ ok: true, job_opening_id: inserted.id })
}


