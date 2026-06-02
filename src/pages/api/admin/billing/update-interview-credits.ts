import type { NextApiRequest, NextApiResponse } from 'next'
import { mapAuthErrorToStatus, requireBillingAdmin } from '@/lib/billing/auth'
import { writeBillingAuditLog } from '@/lib/billing/adminAudit'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.method !== 'POST')
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' })
  const companyId = String(req.body?.company_id || '')
  const delta = Number(req.body?.tokens_delta ?? req.body?.credits_delta)
  const reason = String(req.body?.reason || '').trim()
  if (!companyId || !Number.isInteger(delta) || !reason)
    return res.status(400).json({ ok: false, error: 'INVALID_PARAMS' })
  try {
    const ctx = await requireBillingAdmin(req)
    const { data: before } = await ctx.supa
      .from('company_interview_credit_balance')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle()
    const current = Number((before as any)?.purchased_tokens_remaining || 0)
    const next = current + delta
    if (next < 0)
      return res.status(400).json({ ok: false, error: 'NEGATIVE_TOKENS' })
    const { data, error } = await ctx.supa
      .from('company_interview_credit_balance')
      .upsert(
        {
          company_id: companyId,
          purchased_tokens_remaining: next,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id' }
      )
      .select('*')
      .single()
    if (error || !data)
      return res.status(500).json({ ok: false, error: 'UPDATE_FAILED' })
    await writeBillingAuditLog({
      supa: ctx.supa,
      adminUserId: ctx.profile.id,
      companyId,
      action: 'update_purchased_tokens',
      targetType: 'company_interview_credit_balance',
      beforeValue: (before as any) || null,
      afterValue: data as any,
      reason,
    })
    return res.status(200).json({ ok: true, tokenBalance: data, creditBalance: data })
  } catch (error) {
    return res.status(mapAuthErrorToStatus(error)).json({
      ok: false,
      error: error instanceof Error ? error.message : 'FAILED',
    })
  }
}
