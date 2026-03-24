import type { NextApiRequest, NextApiResponse } from 'next'
import { createAuthContext } from '@/lib/authContext'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const ctx = createAuthContext(req)
  const me = await ctx.getProfile()
  if (!me?.id) return res.status(401).json({ error: 'UNAUTHORIZED', items: [] })

  const company_id = String(req.query.company_id || '')
  const job_opening_id = String(req.query.job_opening_id || '')
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '20'), 10) || 20, 1), 100)
  const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0)

  if (!company_id) return res.status(400).json({ items: [] })
  const isMember = await ctx.isCompanyMember(company_id)
  if (!isMember) return res.status(403).json({ error: 'FORBIDDEN', items: [] })

  let q = ctx.supa
    .from('resume_review_results')
    .select('id, candidate_profile_id, candidate_email, job_opening_id, fit_score, criteria_results, summary, created_at, job_opening:job_opening_id(job_title)', { count: 'exact' })
    .eq('company_id', company_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (job_opening_id) q = q.eq('job_opening_id', job_opening_id)

  const { data, error, count } = await q
  if (error) return res.status(200).json({ items: [], total: 0, limit, offset })

  const items = (data || []).map((r: any) => ({
    review_result_id: r.id,
    candidate_profile_id: r.candidate_profile_id || null,
    candidate_email: r.candidate_email,
    job_opening_id: r.job_opening_id,
    job_title: r.job_opening?.job_title || '',
    fit_score: r.fit_score,
    criteria_results: r.criteria_results,
    summary: r.summary || '',
    created_at: r.created_at,
  }))

  return res.status(200).json({ items, total: count || 0, limit, offset })
}
