import type { NextApiRequest, NextApiResponse } from 'next'
import { createAuthContext } from '@/lib/authContext'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const company_id = String(req.query.company_id || '')
  if (!company_id) return res.status(400).json({ error: 'MISSING_COMPANY_ID' })

  const ctx = createAuthContext(req)
  const me = await ctx.getProfile()
  if (!me?.id) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const isMember = await ctx.isCompanyMember(company_id)
  if (!isMember) return res.status(403).json({ error: 'FORBIDDEN' })

  const supa = ctx.supa
  const { data, error } = await supa
    .from('company_ai_usage')
    .select('joq_used_count, joq_free_quota')
    .eq('company_id', company_id)
    .maybeSingle()

  if (error) return res.status(400).json({ error: 'QUOTA_READ_FAILED' })

  const used = Number(data?.joq_used_count || 0)
  const free = Number(data?.joq_free_quota || 5)
  return res.status(200).json({
    ok: true,
    used_count: used,
    free_quota: free,
    remaining: Math.max(0, free - used),
  })
}
