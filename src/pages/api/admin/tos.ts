import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient, getAuthUserIdFromRequest, getAuthEmailFromRequest } from '@/lib/supabaseServer'

// Simple admin: allow only recruiter to create/update terms

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supa = getServiceClient()
  const authUserId = await getAuthUserIdFromRequest(req)
  const authEmail = await getAuthEmailFromRequest(req)
  if (!authUserId || !authEmail) return res.status(401).json({ error: 'UNAUTHORIZED' })

  // Check app_admins whitelist
  const { data: admin } = await supa
    .from('app_admins')
    .select('email')
    .eq('email', authEmail)
    .maybeSingle()
  if (!admin) return res.status(403).json({ error: 'FORBIDDEN' })

  if (req.method === 'GET') {
    const { data, error } = await supa.from('terms_of_service').select('version, published_at').order('published_at', { ascending: false })
    if (error) return res.status(500).json({ error: 'LIST_FAILED' })
    return res.status(200).json({ items: data })
  }

  if (req.method === 'POST') {
    const { version, body, publish_now } = req.body || {}
    if (!version || !body) return res.status(400).json({ error: 'MISSING_FIELDS' })
    const pubAt = publish_now === false ? null : new Date().toISOString()
    const { error } = await supa.from('terms_of_service').upsert({ version, body, published_at: pubAt || new Date().toISOString() }, { onConflict: 'version' })
    if (error) return res.status(400).json({ error: 'UPSERT_FAILED' })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).end()
}


