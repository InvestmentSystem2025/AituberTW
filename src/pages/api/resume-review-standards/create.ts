import type { NextApiRequest, NextApiResponse } from 'next'
import { createAuthContext } from '@/lib/authContext'

const VALID_LABELS = new Set(['MUST', 'PLUS', 'MINUS', 'NG'])

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const ctx = createAuthContext(req)
  const profile = await ctx.getProfile()
  if (!profile?.id) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const { company_id, job_opening_id, name, label, sort_order } = req.body || {}
  if (!company_id || !job_opening_id || !name || !label) {
    return res.status(400).json({ error: 'MISSING_FIELDS' })
  }

  const isMember = await ctx.isCompanyMember(String(company_id))
  if (!isMember) return res.status(403).json({ error: 'FORBIDDEN' })

  if (!VALID_LABELS.has(String(label))) return res.status(400).json({ error: 'INVALID_LABEL' })

  const supa = ctx.supa
  const { error } = await supa.from('resume_review_standards').insert({
    company_id,
    job_opening_id,
    name: String(name).trim(),
    label,
    sort_order: Number.isFinite(Number(sort_order)) ? Number(sort_order) : 1,
  })
  if (error) return res.status(400).json({ error: 'CREATE_FAILED' })
  return res.status(200).json({ ok: true })
}
