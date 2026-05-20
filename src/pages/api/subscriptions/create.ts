import type { NextApiRequest, NextApiResponse } from 'next'
import {
  createPeriodicCommissionFields,
  getPeriodicConfig,
  getPeriodicGateway,
  validatePeriodicConfig,
} from '@/lib/newebpay/periodicClient'
import {
  getAppBaseUrl,
  createMerchantOrderNo,
} from '@/lib/billing/orderNumbers'
import { normalizePeriodPoint } from '@/lib/billing/types'
import {
  mapAuthErrorToStatus,
  requireRecruiterCompanyMember,
} from '@/lib/billing/auth'

type Resp =
  | {
      ok: true
      gatewayUrl: string
      merchantOrderNo: string
      fields: { MerchantID_: string; PostData_: string }
    }
  | { ok: false; error: string; message?: string }

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Resp>
) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.method !== 'POST')
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' })

  const companyId =
    typeof req.body?.company_id === 'string' ? req.body.company_id : ''
  const planId = typeof req.body?.plan_id === 'string' ? req.body.plan_id : ''
  if (!companyId || !planId)
    return res.status(400).json({ ok: false, error: 'MISSING_FIELDS' })

  try {
    const ctx = await requireRecruiterCompanyMember(req, companyId)
    const config = getPeriodicConfig()
    const configError = validatePeriodicConfig(config)
    if (configError)
      return res.status(503).json({
        ok: false,
        error: 'NEWEBPAY_CONFIG_ERROR',
        message: configError,
      })

    const { data: plan, error: planErr } = await ctx.supa
      .from('billing_plans')
      .select(
        'id, name, price_twd, monthly_token_limit, period_type, period_point_strategy, fixed_period_point, is_active'
      )
      .eq('id', planId)
      .eq('is_active', true)
      .maybeSingle()
    if (planErr || !plan)
      return res.status(404).json({ ok: false, error: 'PLAN_NOT_FOUND' })

    const { data: existing } = await ctx.supa
      .from('subscriptions')
      .select('id, status')
      .eq('company_id', companyId)
      .in('status', [
        'pending',
        'active',
        'past_due',
        'payment_failed',
        'cancel_at_period_end',
      ])
      .limit(1)
      .maybeSingle()
    if (existing)
      return res.status(409).json({ ok: false, error: 'SUBSCRIPTION_EXISTS' })

    const now = new Date()
    const day = now.getDate()
    const periodPoint =
      (plan as any).period_point_strategy === 'signup_day'
        ? normalizePeriodPoint(day)
        : normalizePeriodPoint((plan as any).fixed_period_point || '05')
    const merchantOrderNo = createMerchantOrderNo('SUB')

    const { data: subscription, error: insertErr } = await ctx.supa
      .from('subscriptions')
      .insert({
        company_id: companyId,
        plan_id: planId,
        source: 'newebpay_periodic',
        status: 'pending',
        merchant_order_no: merchantOrderNo,
        period_amt: (plan as any).price_twd,
        period_type: (plan as any).period_type || 'M',
        period_point: periodPoint,
        period_times: 'NE',
        monthly_token_limit: (plan as any).monthly_token_limit,
      })
      .select('id')
      .single()
    if (insertErr || !subscription?.id)
      return res
        .status(500)
        .json({ ok: false, error: 'CREATE_SUBSCRIPTION_FAILED' })

    await ctx.supa.from('subscription_payments').insert({
      subscription_id: subscription.id,
      company_id: companyId,
      merchant_order_no: merchantOrderNo,
      auth_amt: (plan as any).price_twd,
      status: 'pending',
      message: 'initial authorization pending',
    })

    const baseUrl = getAppBaseUrl(req)
    const fields = createPeriodicCommissionFields(
      {
        merchantOrderNo,
        prodDesc: 'AI面接官企業サブスクリプション',
        periodAmt: Number((plan as any).price_twd),
        periodType: ((plan as any).period_type || 'M') as 'M',
        periodPoint,
        payerEmail: ctx.profile.email || '',
        returnUrl: `${baseUrl}/payment/result`,
        notifyUrl:
          process.env.NEWEBPAY_PERIOD_NOTIFY_URL ||
          `${baseUrl}/api/newebpay/period/notify`,
        backUrl: `${baseUrl}/me?tab=subscription`,
      },
      config
    )

    return res.status(200).json({
      ok: true,
      gatewayUrl: getPeriodicGateway(config.env),
      merchantOrderNo,
      fields,
    })
  } catch (error) {
    return res.status(mapAuthErrorToStatus(error)).json({
      ok: false,
      error: error instanceof Error ? error.message : 'CREATE_FAILED',
    })
  }
}
