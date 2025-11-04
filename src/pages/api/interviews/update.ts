import type { NextApiRequest, NextApiResponse } from 'next'
import { getAuthUserIdFromRequest, getServiceClient } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') return res.status(405).end()
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })
  const { id, company_id, job_opening_id, start_time, end_time, status, profiles_id, candidate_email } = req.body || {}
  if (!id || !company_id) return res.status(400).json({ error: 'MISSING_FIELDS' })
  if (profiles_id !== undefined && candidate_email !== undefined) {
    if (!!profiles_id === !!candidate_email) return res.status(400).json({ error: 'XOR_PROFILE_EMAIL' })
  }

  const supa = getServiceClient()
  const { data: me } = await supa.from('profiles').select('id').eq('auth_id', authUserId).single()
  if (!me) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })
  const { data: scope } = await supa.from('company_members').select('profile_id').eq('company_id', company_id).eq('profile_id', me.id).maybeSingle()
  if (!scope) return res.status(403).json({ error: 'FORBIDDEN' })

  // 如果提供了 profiles_id，驗證它是否存在
  if (profiles_id) {
    const { data: profileCheck } = await supa.from('profiles').select('id').eq('id', profiles_id).maybeSingle()
    if (!profileCheck) {
      return res.status(400).json({ error: 'PROFILE_ID_NOT_FOUND' })
    }
  }

  const payload: any = {}
  if (typeof job_opening_id === 'string') payload.job_opening_id = job_opening_id
  if (typeof start_time === 'string') payload.start_time = start_time
  if (typeof end_time === 'string' || end_time === null) payload.end_time = end_time
  if (typeof status === 'string') payload.status = status
  if (profiles_id !== undefined || candidate_email !== undefined) {
    if (profiles_id) { payload.profiles_id = profiles_id; payload.candidate_email = null }
    else if (candidate_email) { payload.candidate_email = String(candidate_email).toLowerCase(); payload.profiles_id = null }
  }

  const { error } = await supa.from('interviews').update(payload).eq('id', id).eq('company_id', company_id)
  if (error) {
    console.error('Interview update error:', error)
    return res.status(400).json({ error: 'UPDATE_FAILED' })
  }
  return res.status(200).json({ ok: true })
}


