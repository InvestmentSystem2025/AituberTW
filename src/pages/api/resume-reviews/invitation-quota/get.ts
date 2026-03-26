import type { NextApiRequest, NextApiResponse } from 'next'
import { createAuthContext } from '@/lib/authContext'
import { normalizeEmail } from '@/lib/resumeReview'

const INVITATION_LIMIT_PER_CANDIDATE = 3

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const company_id = String(req.query.company_id || '')
  const job_opening_id = String(req.query.job_opening_id || '')
  const candidate_email = normalizeEmail(String(req.query.candidate_email || ''))

  if (!company_id || !job_opening_id || !candidate_email) {
    return res.status(400).json({ error: 'MISSING_FIELDS' })
  }

  const ctx = createAuthContext(req)
  const me = await ctx.getProfile()
  if (!me?.id) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const isMember = await ctx.isCompanyMember(company_id)
  if (!isMember) return res.status(403).json({ error: 'FORBIDDEN' })

  const { count } = await ctx.supa
    .from('resume_review_requests')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', company_id)
    .eq('job_opening_id', job_opening_id)
    .eq('candidate_email', candidate_email)

  const used = Number(count || 0)
  const free = INVITATION_LIMIT_PER_CANDIDATE

  return res.status(200).json({
    ok: true,
    used_count: used,
    free_quota: free,
    remaining: Math.max(0, free - used),
  })
}
