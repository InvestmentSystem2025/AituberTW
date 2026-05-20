import type { NextApiRequest, NextApiResponse } from 'next'
import { mapAuthErrorToStatus, requireBillingAdmin } from '@/lib/billing/auth'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.method !== 'GET')
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' })
  const companyId =
    typeof req.query.company_id === 'string' ? req.query.company_id : ''
  if (!companyId)
    return res.status(400).json({ ok: false, error: 'MISSING_COMPANY_ID' })
  try {
    const ctx = await requireBillingAdmin(req)
    const [
      company,
      subscriptions,
      entitlements,
      balance,
      purchases,
      payments,
      events,
      alerts,
      audits,
    ] = await Promise.all([
      ctx.supa.from('company').select('*').eq('id', companyId).maybeSingle(),
      ctx.supa
        .from('subscriptions')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),
      ctx.supa
        .from('admin_billing_entitlements')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),
      ctx.supa
        .from('company_interview_credit_balance')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle(),
      ctx.supa
        .from('one_time_purchases')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(50),
      ctx.supa
        .from('subscription_payments')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(50),
      ctx.supa
        .from('newebpay_webhook_events')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(50),
      ctx.supa
        .from('billing_alerts')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(50),
      ctx.supa
        .from('admin_billing_audit_logs')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(50),
    ])
    return res.status(200).json({
      ok: true,
      company: company.data,
      subscriptions: subscriptions.data || [],
      adminEntitlements: entitlements.data || [],
      creditBalance: balance.data,
      oneTimePurchases: purchases.data || [],
      subscriptionPayments: payments.data || [],
      webhookEvents: events.data || [],
      billingAlerts: alerts.data || [],
      auditLogs: audits.data || [],
    })
  } catch (error) {
    return res.status(mapAuthErrorToStatus(error)).json({
      ok: false,
      error: error instanceof Error ? error.message : 'FAILED',
    })
  }
}
