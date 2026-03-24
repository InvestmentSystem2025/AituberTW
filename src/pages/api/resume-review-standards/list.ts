import type { NextApiRequest, NextApiResponse } from 'next'
import { createAuthContext } from '@/lib/authContext'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const ctx = createAuthContext(req)
  const profile = await ctx.getProfile()
  if (!profile?.id) return res.status(401).json({ error: 'UNAUTHORIZED', items: [] })

  const company_id = String(req.query.company_id || '')
  const job_opening_id = String(req.query.job_opening_id || '')
  if (!company_id) return res.status(400).json({ items: [] })

  const isMember = await ctx.isCompanyMember(company_id)
  if (!isMember) return res.status(403).json({ error: 'FORBIDDEN', items: [] })

  let q = ctx.supa
    .from('resume_review_standards')
    .select('id, company_id, job_opening_id, name, label, sort_order, created_at')
    .eq('company_id', company_id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (job_opening_id) q = q.eq('job_opening_id', job_opening_id)

  const { data, error } = await q
  if (error) return res.status(200).json({ items: [] })
  return res.status(200).json({ items: data || [] })
}
