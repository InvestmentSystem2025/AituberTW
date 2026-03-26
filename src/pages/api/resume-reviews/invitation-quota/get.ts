import type { NextApiRequest, NextApiResponse } from 'next'
import { createAuthContext } from '@/lib/authContext'

const COMPANY_INVITATION_LIMIT = 3

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const company_id = String(req.query.company_id || '')

  if (!company_id) {
    return res.status(400).json({ error: 'MISSING_FIELDS' })
  }

  const ctx = createAuthContext(req)
  const me = await ctx.getProfile()
  if (!me?.id) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const isMember = await ctx.isCompanyMember(company_id)
  if (!isMember) return res.status(403).json({ error: 'FORBIDDEN' })

  // 公司層級 hard guard：同一 company 總共最多 3 次
  const { count } = await ctx.supa
    .from('resume_review_requests')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', company_id)
  
  const used = Number(count || 0)
  const free = COMPANY_INVITATION_LIMIT

  return res.status(200).json({
    ok: true,
    used_count: used,
    free_quota: free,
    remaining: Math.max(0, free - used),
  })
}
