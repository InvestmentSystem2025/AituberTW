import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient, getAuthUserIdFromRequest } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') return res.status(405).end()
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })
  const { id, company_id, name, source, detail } = req.body || {}
  if (!id || !company_id) return res.status(400).json({ error: 'MISSING_FIELDS' })

  const supa = getServiceClient()
  const { data: me } = await supa.from('profiles').select('id').eq('auth_id', authUserId).single()
  if (!me) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })
  const { data: scope } = await supa.from('company_members').select('profile_id').eq('company_id', company_id).eq('profile_id', me.id).maybeSingle()
  if (!scope) return res.status(403).json({ error: 'FORBIDDEN' })

  let d: any = undefined
  if (typeof detail === 'string') { try { d = JSON.parse(detail) } catch { return res.status(400).json({ error: 'INVALID_DETAIL' }) } }
  else if (detail && typeof detail === 'object') d = detail

  const payload: any = {}
  if (typeof name === 'string') payload.name = name
  if (typeof source === 'string') payload.source = source
  if (d !== undefined) payload.detail = d

  const { error } = await supa.from('question_bank').update(payload).eq('id', id).eq('company_id', company_id)
  if (error) return res.status(400).json({ error: 'UPDATE_FAILED' })
  return res.status(200).json({ ok: true })
}


