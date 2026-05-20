import type { NextApiRequest, NextApiResponse } from 'next'
import {
  mapAuthErrorToStatus,
  requireRecruiterCompanyMember,
} from '@/lib/billing/auth'
import { alterSubscriptionStatus } from '@/lib/billing/subscriptionOperations'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.method !== 'POST')
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' })
  const companyId = String(req.body?.company_id || '')
  const subscriptionId = String(req.body?.subscription_id || '')
  if (!companyId || !subscriptionId)
    return res.status(400).json({ ok: false, error: 'MISSING_FIELDS' })
  try {
    const ctx = await requireRecruiterCompanyMember(req, companyId)
    const result = await alterSubscriptionStatus({
      supa: ctx.supa,
      companyId,
      subscriptionId,
      alterType: 'terminate',
    })
    return res.status(result.ok ? 200 : 400).json(result)
  } catch (error) {
    return res.status(mapAuthErrorToStatus(error)).json({
      ok: false,
      error: error instanceof Error ? error.message : 'FAILED',
    })
  }
}
