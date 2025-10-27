import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient } from '@/lib/supabaseServer'

type Resp = { version: string | null; body?: string } | { error: string }

export default async function handler(_req: NextApiRequest, res: NextApiResponse<Resp>) {
  const supa = getServiceClient()
  // 先取最新版版本號
  const { data: vrows, error: verr } = await supa.rpc('get_latest_tos_version')
  if (verr) return res.status(500).json({ error: 'LATEST_TOS_ERROR' })
  const v = Array.isArray(vrows) ? (vrows as any[])[0] : (vrows as any)
  const version = typeof v === 'string' ? v : v?.version || v || null
  if (!version) return res.status(200).json({ version: null })

  // 取本文
  const { data: rows, error } = await supa
    .from('terms_of_service')
    .select('body')
    .eq('version', version)
    .maybeSingle()
  if (error) return res.status(500).json({ error: 'FETCH_TOS_ERROR' })
  return res.status(200).json({ version, body: rows?.body ?? '' })
}


