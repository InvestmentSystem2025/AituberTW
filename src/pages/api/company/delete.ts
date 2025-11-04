import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient, getAuthUserIdFromRequest } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') return res.status(405).end()
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const { id } = req.body || {}
  if (!id) return res.status(400).json({ error: 'MISSING_ID' })

  const supa = getServiceClient()
  const { data: me } = await supa.from('profiles').select('id').eq('auth_id', authUserId).single()
  if (!me) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })
  const { data: cm } = await supa
    .from('company_members')
    .select('company_role')
    .eq('company_id', id)
    .eq('profile_id', me.id)
    .single()
  if (!cm || cm.company_role !== 'admin') return res.status(403).json({ error: 'FORBIDDEN' })

  const { error: dErr } = await supa.from('company').delete().eq('id', id)
  if (dErr) return res.status(400).json({ error: 'DELETE_FAILED' })
  return res.status(200).json({ ok: true })
}


