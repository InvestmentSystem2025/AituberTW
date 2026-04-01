import type { NextApiRequest, NextApiResponse } from 'next'
import { createAuthContext } from '@/lib/authContext'

const VALID_LABELS = new Set(['MUST', 'PLUS', 'MINUS', 'NG'])

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const ctx = createAuthContext(req)
  const profile = await ctx.getProfile()
  if (!profile?.id) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const { id, company_id, name, label, sort_order } = req.body || {}
  if (!id || !company_id) return res.status(400).json({ error: 'MISSING_FIELDS' })

  const isMember = await ctx.isCompanyMember(String(company_id))
  if (!isMember) return res.status(403).json({ error: 'FORBIDDEN' })

  const payload: any = {}
  if (typeof name === 'string') payload.name = name.trim()
  if (typeof label === 'string') {
    if (!VALID_LABELS.has(label)) return res.status(400).json({ error: 'INVALID_LABEL' })
    payload.label = label
  }
  if (sort_order !== undefined) {
    const n = Number(sort_order)
    if (!Number.isFinite(n)) return res.status(400).json({ error: 'INVALID_SORT_ORDER' })
    payload.sort_order = n
  }

  const supa = ctx.supa
  const { error } = await supa.from('resume_review_standards').update(payload).eq('id', id).eq('company_id', company_id)
  if (error) return res.status(400).json({ error: 'UPDATE_FAILED' })
  return res.status(200).json({ ok: true })
}
