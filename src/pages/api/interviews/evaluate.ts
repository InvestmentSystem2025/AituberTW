import type { NextApiRequest, NextApiResponse } from 'next'
import { getAuthUserIdFromRequest, getServiceClient } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })
  const { interviews_id } = req.body || {}
  if (!interviews_id) return res.status(400).json({ error: 'MISSING_FIELDS' })

  const supa = getServiceClient()
  // scope check by joining interviews->company_members
  const { data: me } = await supa.from('profiles').select('id').eq('auth_id', authUserId).single()
  if (!me) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })
  const { data: iv } = await supa.from('interviews').select('company_id').eq('id', interviews_id).maybeSingle()
  if (!iv) return res.status(404).json({ error: 'INTERVIEW_NOT_FOUND' })
  const { data: scope } = await supa.from('company_members').select('profile_id').eq('company_id', iv.company_id).eq('profile_id', me.id).maybeSingle()
  if (!scope) return res.status(403).json({ error: 'FORBIDDEN' })

  const { data, error } = await supa.rpc('evaluate_interview_total', { p_interviews_id: interviews_id })
  if (error) return res.status(400).json({ error: 'EVALUATE_FAILED' })
  return res.status(200).json({ ok: true, total_score: Array.isArray(data) ? data[0] : data })
}


