import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient, getAuthUserIdFromRequest } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') return res.status(405).end()
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })
  const { company_id, profile_id, company_role } = req.body || {}
  if (!company_id || !profile_id || !company_role) return res.status(400).json({ error: 'MISSING_FIELDS' })
  if (!['admin', 'recruiter', 'viewer'].includes(company_role)) return res.status(400).json({ error: 'INVALID_ROLE' })

  const supa = getServiceClient()
  const { data: caller } = await supa.from('profiles').select('id').eq('auth_id', authUserId).single()
  if (!caller) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })
  const { data: scope } = await supa
    .from('company_members')
    .select('company_role')
    .eq('company_id', company_id)
    .eq('profile_id', caller.id)
    .single()
  if (!scope || scope.company_role !== 'admin') return res.status(403).json({ error: 'FORBIDDEN' })

  // 若目標是把某 admin 降級，需保證至少還有一位 admin
  if (company_role !== 'admin') {
    const { data: targetMember } = await supa.from('company_members').select('company_role').eq('company_id', company_id).eq('profile_id', profile_id).single()
    if (targetMember?.company_role === 'admin') {
      const { data: admins } = await supa
        .from('company_members')
        .select('profile_id')
        .eq('company_id', company_id)
        .eq('company_role', 'admin')
      if ((admins || []).length <= 1) return res.status(400).json({ error: 'NEED_ONE_ADMIN' })
    }
  }

  const { error: uErr } = await supa
    .from('company_members')
    .update({ company_role })
    .eq('company_id', company_id)
    .eq('profile_id', profile_id)
  if (uErr) return res.status(400).json({ error: 'UPDATE_FAILED' })
  return res.status(200).json({ ok: true })
}


