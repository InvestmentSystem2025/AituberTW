import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient, getAuthUserIdFromRequest } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') return res.status(405).end()
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })
  const { company_id, profile_id } = req.body || {}
  if (!company_id || !profile_id) return res.status(400).json({ error: 'MISSING_FIELDS' })

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

  // 保證至少保留一位 admin
  const { data: target } = await supa.from('company_members').select('company_role').eq('company_id', company_id).eq('profile_id', profile_id).single()
  if (target?.company_role === 'admin') {
    const { data: admins } = await supa.from('company_members').select('profile_id').eq('company_id', company_id).eq('company_role', 'admin')
    if ((admins || []).length <= 1) return res.status(400).json({ error: 'NEED_ONE_ADMIN' })
  }

  const { error: dErr } = await supa.from('company_members').delete().eq('company_id', company_id).eq('profile_id', profile_id)
  if (dErr) return res.status(400).json({ error: 'REMOVE_FAILED' })
  return res.status(200).json({ ok: true })
}


