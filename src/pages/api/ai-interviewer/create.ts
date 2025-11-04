import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient, getAuthUserIdFromRequest } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })
  const { company_id, name, model_name, model_config } = req.body || {}
  if (!company_id || !name) return res.status(400).json({ error: 'MISSING_FIELDS' })

  const supa = getServiceClient()
  const { data: me } = await supa.from('profiles').select('id').eq('auth_id', authUserId).single()
  if (!me) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })
  const { data: cm } = await supa
    .from('company_members')
    .select('company_role')
    .eq('company_id', company_id)
    .eq('profile_id', me.id)
    .maybeSingle()
  if (!cm) return res.status(403).json({ error: 'FORBIDDEN' })

  let cfg: any = null
  if (typeof model_config === 'string' && model_config.trim().length) {
    try { cfg = JSON.parse(model_config) } catch { return res.status(400).json({ error: 'INVALID_MODEL_CONFIG' }) }
  } else if (model_config && typeof model_config === 'object') { cfg = model_config }

  const { error } = await supa.from('ai_interviewer').insert({ company_id, name, model_name: model_name || 'yuki.vrm', model_config: cfg })
  if (error) return res.status(400).json({ error: 'CREATE_FAILED' })
  return res.status(200).json({ ok: true })
}


