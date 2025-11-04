import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient, getAuthUserIdFromRequest } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })
  const { company_id, job_opening_id, question_bank_id, detail, sort_order, is_active } = req.body || {}
  if (!company_id || !job_opening_id || !detail) return res.status(400).json({ error: 'MISSING_FIELDS' })

  const supa = getServiceClient()
  const { data: me } = await supa.from('profiles').select('id').eq('auth_id', authUserId).single()
  if (!me) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })
  const { data: scope } = await supa.from('company_members').select('profile_id').eq('company_id', company_id).eq('profile_id', me.id).maybeSingle()
  if (!scope) return res.status(403).json({ error: 'FORBIDDEN' })

  let d: any = null
  if (typeof detail === 'string') { try { d = JSON.parse(detail) } catch { return res.status(400).json({ error: 'INVALID_DETAIL' }) } }
  else if (detail && typeof detail === 'object') d = detail

  const payload: any = {
    company_id,
    job_opening_id,
    question_bank_id: question_bank_id || null,
    detail: d,
    sort_order: typeof sort_order === 'number' ? sort_order : 1,
    is_active: typeof is_active === 'boolean' ? is_active : true
  }

  const { error } = await supa.from('job_opening_questions').insert(payload)
  if (error) return res.status(400).json({ error: 'CREATE_FAILED' })
  return res.status(200).json({ ok: true })
}


