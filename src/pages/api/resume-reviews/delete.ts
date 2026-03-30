import type { NextApiRequest, NextApiResponse } from 'next'
import { createAuthContext } from '@/lib/authContext'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const ctx = createAuthContext(req)
  const me = await ctx.getProfile()
  if (!me?.id) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const { review_result_id, company_id } = req.body || {}
  if (!review_result_id || !company_id) {
    return res.status(400).json({ error: 'MISSING_FIELDS' })
  }

  const isMember = await ctx.isCompanyMember(String(company_id))
  if (!isMember) return res.status(403).json({ error: 'FORBIDDEN' })

  const supa = ctx.supa
  const { data, error } = await supa
    .from('resume_review_results')
    .delete()
    .eq('id', review_result_id)
    .eq('company_id', company_id)
    .select('id')
    .maybeSingle()

  if (error) return res.status(400).json({ error: 'DELETE_FAILED' })
  if (!data?.id) return res.status(404).json({ error: 'NOT_FOUND' })

  return res.status(200).json({ ok: true })
}
