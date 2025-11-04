import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient, getAuthUserIdFromRequest } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })
  const { company_id, email, company_role } = req.body || {}
  if (!company_id || !email) return res.status(400).json({ error: 'MISSING_FIELDS' })

  const supa = getServiceClient()
  const { data: caller } = await supa.from('profiles').select('id').eq('auth_id', authUserId).single()
  if (!caller) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })
  const { data: callerScope } = await supa
    .from('company_members')
    .select('company_role')
    .eq('company_id', company_id)
    .eq('profile_id', caller.id)
    .single()
  if (!callerScope || callerScope.company_role !== 'admin') return res.status(403).json({ error: 'FORBIDDEN' })

  const { data: target } = await supa.from('profiles').select('id').eq('email', email.toLowerCase()).maybeSingle()
  if (!target) return res.status(400).json({ error: 'USER_NOT_FOUND' })

  const role = company_role === 'viewer' ? 'viewer' : 'recruiter'
  const { error } = await supa.from('company_members').insert({ company_id, profile_id: target.id, company_role: role })
  if (error) return res.status(400).json({ error: 'ADD_FAILED' })
  return res.status(200).json({ ok: true })
}


