import type { NextApiRequest, NextApiResponse } from 'next'
import { createAuthContext } from '@/lib/authContext'
import { computeUsableDaysRemaining } from '@/lib/billing/types'

type SubscriptionMeResponse =
  | {
      ok: true
      subscription: {
        status:
          | 'free_testing'
          | 'none'
          | 'pending'
          | 'active'
          | 'past_due'
          | 'payment_failed'
          | 'suspended_by_user'
          | 'suspended_by_admin'
          | 'admin_revoked'
          | 'cancel_at_period_end'
          | 'canceled'
          | 'card_update_required'
          | 'expired'
          | 'failed'
        planName: string
        amountTwd: number | null
        billingCycle: 'monthly' | 'yearly' | null
        nextBillingDate: string | null
        currentPeriodEnd: string | null
        entitlementEnd: string | null
        usableDaysRemaining: number
        monthlyTokenLimit: number | null
        monthlyTokenUsed: number
        monthlyTokenRemaining: number | null
        paymentMethodLabel: string | null
        cardStatus: 'none' | 'active' | 'card_update_required'
        cancelAtPeriodEnd: boolean
        canSubscribe: boolean
        canModifyPayment: boolean
        canCancel: boolean
        message: string
      }
    }
  | { ok: false; error: string }

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SubscriptionMeResponse>
) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' })
  }

  const ctx = createAuthContext(req)
  const profile = await ctx.getProfile()
  if (!profile?.id)
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' })
  if (profile.role !== 'recruiter') {
    return res.status(403).json({ ok: false, error: 'RECRUITER_ONLY' })
  }

  const requestedCompanyId =
    typeof req.query.company_id === 'string' ? req.query.company_id : null
  let companyId = requestedCompanyId

  if (companyId) {
    const isMember = await ctx.isCompanyMember(companyId)
    if (!isMember)
      return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  } else {
    const { data: member } = await ctx.supa
      .from('company_members')
      .select('company_id')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    companyId = (member as any)?.company_id || null
  }

  if (!companyId) {
    return res.status(200).json({
      ok: true,
      subscription: {
        status: 'none',
        planName: '尚未建立公司',
        amountTwd: null,
        billingCycle: null,
        nextBillingDate: null,
        currentPeriodEnd: null,
        entitlementEnd: null,
        usableDaysRemaining: 0,
        monthlyTokenLimit: null,
        monthlyTokenUsed: 0,
        monthlyTokenRemaining: null,
        paymentMethodLabel: null,
        cardStatus: 'none',
        cancelAtPeriodEnd: false,
        canSubscribe: false,
        canModifyPayment: false,
        canCancel: false,
        message: '請先建立或加入公司後再設定訂閱。',
      },
    })
  }

  const [subscriptionRes, entitlementRes] = await Promise.all([
    ctx.supa
      .from('subscriptions')
      .select(
        'id, status, current_period_end, monthly_token_limit, monthly_token_used, card_mask, card_status, cancel_at_period_end, period_amt, billing_plans(name)'
      )
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    ctx.supa
      .from('admin_billing_entitlements')
      .select('ends_at, monthly_token_limit_override, monthly_token_used')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .lte('starts_at', new Date().toISOString())
      .gt('ends_at', new Date().toISOString())
      .order('ends_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const subscription = subscriptionRes.data as any
  const entitlement = entitlementRes.data as any
  const currentPeriodEnd = subscription?.current_period_end || null
  const adminEntitlementEnd = entitlement?.ends_at || null
  const entitlementEnd =
    [currentPeriodEnd, adminEntitlementEnd]
      .filter(Boolean)
      .sort((a, b) => Date.parse(String(b)) - Date.parse(String(a)))[0] || null
  const monthlyTokenLimit =
    entitlement?.monthly_token_limit_override ||
    subscription?.monthly_token_limit ||
    null
  const monthlyTokenUsed = Number(
    entitlement?.monthly_token_used ?? subscription?.monthly_token_used ?? 0
  )

  if (subscription?.id || entitlement?.ends_at) {
    const rawStatus = String(subscription?.status || 'active')
    const cardStatus =
      subscription?.card_status === 'active'
        ? 'active'
        : subscription?.status === 'card_update_required' ||
            subscription?.card_status === 'card_not_allowed'
          ? 'card_update_required'
          : 'none'

    return res.status(200).json({
      ok: true,
      subscription: {
        status: rawStatus as any,
        planName:
          subscription?.billing_plans?.name ||
          (entitlement?.ends_at ? '管理者付與資格' : '企業訂閱'),
        amountTwd: subscription?.period_amt ?? null,
        billingCycle: 'monthly',
        nextBillingDate: null,
        currentPeriodEnd,
        entitlementEnd,
        usableDaysRemaining: computeUsableDaysRemaining(
          currentPeriodEnd,
          adminEntitlementEnd
        ),
        monthlyTokenLimit,
        monthlyTokenUsed,
        monthlyTokenRemaining:
          typeof monthlyTokenLimit === 'number'
            ? Math.max(0, monthlyTokenLimit - monthlyTokenUsed)
            : null,
        paymentMethodLabel: subscription?.card_mask || null,
        cardStatus,
        cancelAtPeriodEnd: !!subscription?.cancel_at_period_end,
        canSubscribe: ['none', 'failed', 'canceled', 'expired'].includes(
          rawStatus
        ),
        canModifyPayment: false,
        canCancel: [
          'active',
          'past_due',
          'payment_failed',
          'cancel_at_period_end',
        ].includes(rawStatus),
        message:
          rawStatus === 'card_update_required'
            ? '信用卡狀態異常，請重新契約。'
            : entitlement?.ends_at && !subscription?.id
              ? '目前使用管理者手動付與資格。'
              : '目前訂閱狀態已載入。',
      },
    })
  }

  return res.status(200).json({
    ok: true,
    subscription: {
      status: 'free_testing',
      planName: '免費開放測試期',
      amountTwd: null,
      billingCycle: null,
      nextBillingDate: null,
      currentPeriodEnd: null,
      entitlementEnd: null,
      usableDaysRemaining: 0,
      monthlyTokenLimit: null,
      monthlyTokenUsed: 0,
      monthlyTokenRemaining: null,
      paymentMethodLabel: null,
      cardStatus: 'none',
      cancelAtPeriodEnd: false,
      canSubscribe: true,
      canModifyPayment: false,
      canCancel: false,
      message: '目前服務處於免費開放測試階段，正式收費方案尚未啟用。',
    },
  })
}
