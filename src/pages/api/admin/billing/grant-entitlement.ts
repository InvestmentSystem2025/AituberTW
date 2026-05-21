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
  const planId = typeof req.body?.plan_id === 'string' ? req.body.plan_id : null
  const days = Number(req.body?.days || 0)
  const tokenLimit =
    req.body?.monthly_token_limit_override == null
      ? null
      : Number(req.body.monthly_token_limit_override)
  const reason = String(req.body?.reason || '').trim()
  if (!companyId || !Number.isInteger(days) || days <= 0 || !reason) {
    return res.status(400).json({ ok: false, error: 'INVALID_PARAMS' })
  }
  try {
    const ctx = await requireBillingAdmin(req)
    let effectiveTokenLimitRaw = tokenLimit
    if (effectiveTokenLimitRaw == null && planId) {
      const { data: plan } = await ctx.supa
        .from('billing_plans')
        .select('monthly_token_limit')
        .eq('id', planId)
        .maybeSingle()
      effectiveTokenLimitRaw = Number((plan as any)?.monthly_token_limit || 0)
    }
    const effectiveTokenLimit = Number(effectiveTokenLimitRaw || 0)
    if (!Number.isInteger(effectiveTokenLimit) || effectiveTokenLimit <= 0) {
      return res.status(400).json({
        ok: false,
        error: 'MONTHLY_TOKEN_LIMIT_REQUIRED',
      })
    }

    const startsAt = new Date()
    const endsAt = new Date(startsAt.getTime() + days * 24 * 60 * 60 * 1000)
    const insertPayload = {
      company_id: companyId,
      plan_id: planId,
      status: 'active',
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      monthly_token_limit_override: effectiveTokenLimit,
      token_period_start: startsAt.toISOString(),
      token_period_end: endsAt.toISOString(),
      granted_by: ctx.profile.id,
      granted_reason: reason,
    }
    const { data, error } = await ctx.supa
      .from('admin_billing_entitlements')
      .insert(insertPayload)
      .select('*')
      .single()
    if (error || !data)
      return res.status(500).json({ ok: false, error: 'GRANT_FAILED' })
    await writeBillingAuditLog({
      supa: ctx.supa,
      adminUserId: ctx.profile.id,
      companyId,
      action: 'grant_entitlement',
      targetType: 'admin_billing_entitlement',
      targetId: (data as any).id,
      afterValue: data as any,
      reason,
    })
    return res.status(200).json({ ok: true, entitlement: data })
  } catch (error) {
    return res.status(mapAuthErrorToStatus(error)).json({
      ok: false,
      error: error instanceof Error ? error.message : 'FAILED',
    })
  }
}
