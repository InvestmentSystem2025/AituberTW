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
  const entitlementId = String(req.body?.entitlement_id || '')
  const reason = String(req.body?.reason || '').trim()
  if (!entitlementId || !reason)
    return res.status(400).json({ ok: false, error: 'INVALID_PARAMS' })
  try {
    const ctx = await requireBillingAdmin(req)
    const { data: before } = await ctx.supa
      .from('admin_billing_entitlements')
      .select('*')
      .eq('id', entitlementId)
      .maybeSingle()
    if (!before)
      return res.status(404).json({ ok: false, error: 'ENTITLEMENT_NOT_FOUND' })
    const { data, error } = await ctx.supa
      .from('admin_billing_entitlements')
      .update({
        status: 'revoked',
        revoked_by: ctx.profile.id,
        revoked_reason: reason,
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', entitlementId)
      .select('*')
      .single()
    if (error || !data)
      return res.status(500).json({ ok: false, error: 'REVOKE_FAILED' })
    await writeBillingAuditLog({
      supa: ctx.supa,
      adminUserId: ctx.profile.id,
      companyId: (before as any).company_id,
      action: 'revoke_entitlement',
      targetType: 'admin_billing_entitlement',
      targetId: entitlementId,
      beforeValue: before as any,
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
