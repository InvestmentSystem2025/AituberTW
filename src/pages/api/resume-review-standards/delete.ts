import type { NextApiRequest, NextApiResponse } from 'next'
import { createAuthContext } from '@/lib/authContext'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const ctx = createAuthContext(req)
  const profile = await ctx.getProfile()
  if (!profile?.id) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const { id, company_id } = req.body || {}
  if (!id || !company_id) return res.status(400).json({ error: 'MISSING_FIELDS' })

  const isMember = await ctx.isCompanyMember(String(company_id))
  if (!isMember) return res.status(403).json({ error: 'FORBIDDEN' })

  const supa = ctx.supa
  const { error } = await supa.from('resume_review_standards').delete().eq('id', id).eq('company_id', company_id)
  if (error) return res.status(400).json({ error: 'DELETE_FAILED' })
  return res.status(200).json({ ok: true })
}
