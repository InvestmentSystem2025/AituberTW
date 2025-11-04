import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient, getAuthUserIdFromRequest } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') return res.status(405).end()
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const { id, company_name, company_phone_number, company_address, company_profile, ideal_candidate_profile } = req.body || {}
  if (!id) return res.status(400).json({ error: 'MISSING_ID' })

  const supa = getServiceClient()
  // get caller profile
  const { data: me, error: meErr } = await supa.from('profiles').select('id').eq('auth_id', authUserId).single()
  if (meErr || !me) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })
  // must be admin of this company
  const { data: cm, error: cmErr } = await supa
    .from('company_members')
    .select('company_role')
    .eq('company_id', id)
    .eq('profile_id', me.id)
    .single()
  if (cmErr || !cm || cm.company_role !== 'admin') return res.status(403).json({ error: 'FORBIDDEN' })

  const payload: any = {}
  if (typeof company_name === 'string') payload.company_name = company_name
  if (typeof company_phone_number === 'string') payload.company_phone_number = company_phone_number
  if (typeof company_address === 'string') payload.company_address = company_address
  if (typeof company_profile === 'string') payload.company_profile = company_profile
  if (typeof ideal_candidate_profile === 'string') payload.ideal_candidate_profile = ideal_candidate_profile
  if (Object.keys(payload).length === 0) return res.status(400).json({ error: 'NO_FIELDS' })

  const { error: uErr } = await supa.from('company').update(payload).eq('id', id)
  if (uErr) return res.status(400).json({ error: 'UPDATE_FAILED' })
  return res.status(200).json({ ok: true })
}


