import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient, getAuthUserIdFromRequest } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })
  const company_id = String(req.query.company_id || '')
  if (!company_id) return res.status(400).json({ error: 'MISSING_COMPANY_ID' })

  const supa = getServiceClient()
  const { data: me } = await supa.from('profiles').select('id').eq('auth_id', authUserId).single()
  if (!me) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })
  const { data: scope } = await supa.from('company_members').select('company_role').eq('company_id', company_id).eq('profile_id', me.id).maybeSingle()
  if (!scope) return res.status(403).json({ error: 'FORBIDDEN' })

  const { data, error } = await supa
    .from('company_members')
    .select('profile_id, company_role, profiles:profile_id(email)')
    .eq('company_id', company_id)
  if (error) return res.status(200).json({ items: [] })
  const items = (data || []).map((x: any) => ({ profile_id: x.profile_id, company_role: x.company_role, email: x.profiles?.email }))
  return res.status(200).json({ items })
}


