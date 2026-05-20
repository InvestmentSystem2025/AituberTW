import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getPeriodicConfig,
  postAlterPeriodicStatus,
  validatePeriodicConfig,
} from '@/lib/newebpay/periodicClient'

export const alterSubscriptionStatus = async (args: {
  supa: SupabaseClient
  companyId: string
  subscriptionId: string
  alterType: 'suspend' | 'restart' | 'terminate'
}): Promise<
  { ok: true; payload: Record<string, unknown> } | { ok: false; error: string }
> => {
  const { data: subscription, error } = await args.supa
    .from('subscriptions')
    .select('id, merchant_order_no, period_no, status')
    .eq('id', args.subscriptionId)
    .eq('company_id', args.companyId)
    .maybeSingle()
  if (error || !subscription)
    return { ok: false, error: 'SUBSCRIPTION_NOT_FOUND' }
  if (
    !(subscription as any).merchant_order_no ||
    !(subscription as any).period_no
  ) {
    return { ok: false, error: 'SUBSCRIPTION_NOT_READY' }
  }

  const config = getPeriodicConfig()
  const configError = validatePeriodicConfig(config)
  if (configError) return { ok: false, error: 'NEWEBPAY_CONFIG_ERROR' }

  const payload = await postAlterPeriodicStatus(
    {
      merchantOrderNo: (subscription as any).merchant_order_no,
      periodNo: (subscription as any).period_no,
      alterType: args.alterType,
    },
    config
  )

  if (payload.Status !== 'SUCCESS') {
    const message =
      typeof payload.Message === 'string'
        ? payload.Message
        : 'ALTER_STATUS_FAILED'
    if (
      args.alterType === 'terminate' &&
      ['card_update_required', 'cancel_at_period_end', 'canceled'].includes(
        String((subscription as any).status)
      )
    ) {
      return { ok: true, payload }
    }
    return { ok: false, error: message }
  }

  const nextStatus =
    args.alterType === 'suspend'
      ? 'suspended_by_user'
      : args.alterType === 'restart'
        ? 'active'
        : 'cancel_at_period_end'
  const updatePayload: Record<string, unknown> = {
    status: nextStatus,
    updated_at: new Date().toISOString(),
    raw_latest_payload: payload,
  }
  if (args.alterType === 'terminate') {
    updatePayload.cancel_at_period_end = true
    updatePayload.canceled_at = new Date().toISOString()
  }

  await args.supa
    .from('subscriptions')
    .update(updatePayload)
    .eq('id', args.subscriptionId)

  return { ok: true, payload }
}
