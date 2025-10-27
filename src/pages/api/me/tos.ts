import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient, getAuthUserIdFromRequest } from '@/lib/supabaseServer'

type Resp = { accepted: boolean; version: string | null; accepted_at?: string } | { error: string }

export default async function handler(req: NextApiRequest, res: NextApiResponse<Resp>) {
  if (req.method !== 'GET') return res.status(405).end()

  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const supa = getServiceClient()
  const { data: prof, error: profErr } = await supa
    .from('profiles')
    .select('id')
    .eq('auth_id', authUserId)
    .single()
  if (profErr || !prof) return res.status(500).json({ error: 'PROFILE_NOT_FOUND' })

  // latest version
  const { data: latestRows } = await supa.rpc('get_latest_tos_version')
  const latest = Array.isArray(latestRows) ? latestRows[0] : latestRows
  const version = typeof latest === 'string' ? latest : latest?.version || latest || null

  if (!version) return res.status(200).json({ accepted: false, version: null })

  const { data: acc } = await supa
    .from('profile_tos_acceptances')
    .select('accepted_at')
    .eq('profile_id', prof.id)
    .eq('terms_version', version)
    .maybeSingle()

  if (!acc) return res.status(200).json({ accepted: false, version })
  return res.status(200).json({ accepted: true, version, accepted_at: acc.accepted_at })
}



