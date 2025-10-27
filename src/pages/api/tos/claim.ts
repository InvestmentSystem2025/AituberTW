import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient, getAuthUserIdFromRequest } from '@/lib/supabaseServer'

type Resp = { ok: true; profile_id: string; terms_version: string } | { error: string }

export default async function handler(req: NextApiRequest, res: NextApiResponse<Resp>) {
  if (req.method !== 'POST') return res.status(405).end()
  const { nonce } = req.body || {}
  if (!nonce) return res.status(400).json({ error: 'MISSING_NONCE' })

  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const supa = getServiceClient()

  // Validate nonce first and get version
  const { data: pre, error: preErr } = await supa
    .from('tos_preconsents')
    .select('nonce, terms_version, expires_at, consumed_at')
    .eq('nonce', nonce)
    .maybeSingle()

  if (preErr || !pre) return res.status(400).json({ error: 'NONCE_NOT_FOUND' })
  if (pre.consumed_at) return res.status(409).json({ error: 'NONCE_ALREADY_USED' })
  if (new Date(pre.expires_at) <= new Date()) return res.status(410).json({ error: 'TOS_EXPIRED' })

  const { error: claimErr } = await supa.rpc('claim_tos_preconsent', { p_nonce: nonce, p_auth_user_id: authUserId })
  if (claimErr) return res.status(400).json({ error: 'CLAIM_FAILED' })

  // Fetch profile id and echo terms version
  const { data: prof, error: profErr } = await supa
    .from('profiles')
    .select('id')
    .eq('auth_id', authUserId)
    .single()

  if (profErr || !prof) return res.status(500).json({ error: 'PROFILE_NOT_FOUND' })
  return res.status(200).json({ ok: true, profile_id: prof.id, terms_version: pre.terms_version })
}


