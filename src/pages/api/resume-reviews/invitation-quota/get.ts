import type { NextApiRequest, NextApiResponse } from 'next'
import { createAuthContext } from '@/lib/authContext'

const DEFAULT_COMPANY_INVITATION_LIMIT = 3

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
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

  const [{ count }, quotaRes] = await Promise.all([
    ctx.supa
      .from('resume_review_requests')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company_id),
    ctx.supa
      .from('company_resume_review_quota')
      .select('free_quota')
      .eq('company_id', company_id)
      .maybeSingle(),
  ])

  let free = Number(
    quotaRes.data?.free_quota ?? DEFAULT_COMPANY_INVITATION_LIMIT
  )
  if (!quotaRes.data) {
    const { data } = await ctx.supa
      .from('company_resume_review_quota')
      .upsert(
        {
          company_id,
          free_quota: DEFAULT_COMPANY_INVITATION_LIMIT,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id' }
      )
      .select('free_quota')
      .maybeSingle()
    free = Number(data?.free_quota ?? DEFAULT_COMPANY_INVITATION_LIMIT)
  }

  const used = Number(count || 0)

  return res.status(200).json({
    ok: true,
    used_count: used,
    free_quota: free,
    remaining: Math.max(0, free - used),
  })
}
