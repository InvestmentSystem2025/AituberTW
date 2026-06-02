import type { NextApiRequest, NextApiResponse } from 'next'
import { mapAuthErrorToStatus, requireBillingAdmin } from '@/lib/billing/auth'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.method !== 'GET')
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' })
  try {
    const ctx = await requireBillingAdmin(req)
    const { data, error } = await ctx.supa
      .from('company')
      .select(
        'id, company_name, created_at, subscriptions(id, status, current_period_end, monthly_token_limit, monthly_token_used, card_status, created_at), company_interview_credit_balance(purchased_credits_remaining, purchased_tokens_remaining)'
      )
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) return res.status(500).json({ ok: false, error: 'LIST_FAILED' })
    return res.status(200).json({ ok: true, items: data || [] })
  } catch (error) {
    return res.status(mapAuthErrorToStatus(error)).json({
      ok: false,
      error: error instanceof Error ? error.message : 'FAILED',
    })
  }
}
