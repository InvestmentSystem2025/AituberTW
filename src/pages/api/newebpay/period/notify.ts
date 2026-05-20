import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient } from '@/lib/supabaseServer'
import {
  decryptPeriodicPayload,
  getPeriodicConfig,
  validatePeriodicConfig,
} from '@/lib/newebpay/periodicClient'
import {
  buildWebhookUniqueKey,
  extractRawEncrypted,
  getResult,
  getString,
  inferPeriodEventType,
  isPaymentSuccess,
} from '@/lib/newebpay/webhookService'

type Resp = { status: 'SUCCESS' | 'ERROR'; message: string }

const addThirtyDays = (currentPeriodEnd?: string | null): string => {
  const now = Date.now()
  const base =
    currentPeriodEnd && Date.parse(currentPeriodEnd) > now
      ? Date.parse(currentPeriodEnd)
      : now
  return new Date(base + 30 * 24 * 60 * 60 * 1000).toISOString()
}

const parseNewebPayDate = (value: string | null): string | null => {
  if (!value) return null
  const normalized = value.includes(' ') ? value.replace(' ', 'T') : value
  const date = new Date(normalized)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Resp>
) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.method !== 'POST')
    return res
      .status(405)
      .json({ status: 'ERROR', message: 'METHOD_NOT_ALLOWED' })

  const config = getPeriodicConfig()
  const configError = validatePeriodicConfig(config)
  if (configError)
    return res.status(500).json({ status: 'ERROR', message: 'CONFIG_ERROR' })

  const encrypted = extractRawEncrypted(req.body, ['Period', 'period'])
  if (!encrypted)
    return res.status(400).json({ status: 'ERROR', message: 'MISSING_PERIOD' })

  const supa = getServiceClient()
  let payload: Record<string, unknown>
  try {
    payload = decryptPeriodicPayload(encrypted, config)
  } catch {
    const uniqueKey = `newebpay:initial_auth:decrypt_failed:${Date.now()}`
    await supa.from('newebpay_webhook_events').insert({
      provider: 'newebpay',
      event_type: 'initial_auth',
      unique_key: uniqueKey,
      raw_encrypted_payload: encrypted,
      status: 'security_alert',
      error_message: 'Period payload decrypt failed',
    })
    await supa.from('billing_alerts').insert({
      type: 'security_alert',
      severity: 'critical',
      message: 'Period payload decrypt failed',
    })
    return res
      .status(200)
      .json({ status: 'SUCCESS', message: 'SECURITY_ALERT_RECORDED' })
  }

  const result = getResult(payload)
  const eventType = inferPeriodEventType(payload)
  const uniqueKey = buildWebhookUniqueKey(eventType, payload)
  const merchantOrderNo = getString(result, 'MerchantOrderNo')
  const periodNo = getString(result, 'PeriodNo')
  const tradeNo = getString(result, 'TradeNo')
  const orderNo = getString(result, 'OrderNo')
  const respondCode = getString(result, 'RespondCode')

  const { data: existing } = await supa
    .from('newebpay_webhook_events')
    .select('id, status')
    .eq('unique_key', uniqueKey)
    .maybeSingle()
  if (existing?.status === 'processed') {
    return res
      .status(200)
      .json({ status: 'SUCCESS', message: 'DUPLICATE_IGNORED' })
  }

  const { data: event, error: eventErr } = await supa
    .from('newebpay_webhook_events')
    .upsert(
      {
        provider: 'newebpay',
        event_type: eventType,
        merchant_order_no: merchantOrderNo,
        period_no: periodNo,
        order_no: orderNo,
        trade_no: tradeNo,
        already_times: Number(getString(result, 'AlreadyTimes') || 0) || null,
        respond_code: respondCode,
        unique_key: uniqueKey,
        raw_encrypted_payload: encrypted,
        raw_decrypted_payload: payload,
        status: 'received',
      },
      { onConflict: 'unique_key' }
    )
    .select('id')
    .single()
  if (eventErr || !event?.id)
    return res
      .status(500)
      .json({ status: 'ERROR', message: 'EVENT_WRITE_FAILED' })

  const securityAlert = async (message: string) => {
    await supa
      .from('newebpay_webhook_events')
      .update({ status: 'security_alert', error_message: message })
      .eq('id', event.id)
    await supa.from('billing_alerts').insert({
      webhook_event_id: event.id,
      type: 'security_alert',
      severity: 'critical',
      message,
      raw_payload: payload,
    })
    return res
      .status(200)
      .json({ status: 'SUCCESS', message: 'SECURITY_ALERT_RECORDED' })
  }

  const merchantId = getString(result, 'MerchantID')
  if (merchantId && merchantId !== config.merchantId)
    return securityAlert('Period MerchantID mismatch')
  if (!merchantOrderNo) return securityAlert('Period MerchantOrderNo missing')

  const { data: subscription } = await supa
    .from('subscriptions')
    .select(
      'id, company_id, status, current_period_end, monthly_token_limit, period_amt, failed_payment_count, period_no'
    )
    .eq('merchant_order_no', merchantOrderNo)
    .maybeSingle()
  if (!subscription) return securityAlert('Period MerchantOrderNo not found')
  await supa
    .from('newebpay_webhook_events')
    .update({ company_id: (subscription as any).company_id })
    .eq('id', event.id)
  if (
    periodNo &&
    (subscription as any).period_no &&
    periodNo !== (subscription as any).period_no
  ) {
    return securityAlert('PeriodNo mismatch')
  }

  const success = isPaymentSuccess(payload, result)
  const amount = Number(
    getString(result, eventType === 'period_auth' ? 'AuthAmt' : 'PeriodAmt') ||
      (subscription as any).period_amt ||
      0
  )
  const now = new Date().toISOString()

  const { data: payment } = await supa
    .from('subscription_payments')
    .insert({
      subscription_id: (subscription as any).id,
      company_id: (subscription as any).company_id,
      merchant_order_no: merchantOrderNo,
      period_no: periodNo,
      order_no: orderNo,
      trade_no: tradeNo,
      auth_amt: amount || null,
      auth_code: getString(result, 'AuthCode'),
      respond_code: respondCode,
      status: success ? 'paid' : 'failed',
      message: getString(payload, 'Message'),
      auth_date: parseNewebPayDate(
        getString(result, 'AuthDate') || getString(result, 'AuthTime')
      ),
      already_times: Number(getString(result, 'AlreadyTimes') || 0) || null,
      total_times:
        getString(result, 'TotalTimes') || getString(result, 'AuthTimes'),
      raw_payload: payload,
    })
    .select('id')
    .maybeSingle()

  if (success) {
    if (
      ['cancel_at_period_end', 'canceled'].includes(
        String((subscription as any).status)
      )
    ) {
      if (payment?.id) {
        await supa
          .from('subscription_payments')
          .update({ alert_flag: 'inconsistent_state' })
          .eq('id', payment.id)
      }
      await supa.from('billing_alerts').insert({
        company_id: (subscription as any).company_id,
        subscription_id: (subscription as any).id,
        payment_id: payment?.id || null,
        webhook_event_id: event.id,
        type: 'unexpected_payment_after_cancel',
        severity: 'critical',
        message:
          'NewebPay sent a successful period payment after local subscription was canceled.',
        raw_payload: payload,
      })
    } else {
      const nextEnd = addThirtyDays((subscription as any).current_period_end)
      await supa
        .from('subscriptions')
        .update({
          status: 'active',
          period_no: periodNo || (subscription as any).period_no,
          current_period_start: now,
          current_period_end: nextEnd,
          token_period_start: now,
          token_period_end: nextEnd,
          monthly_token_used: 0,
          failed_payment_count: 0,
          card_mask: getString(result, 'CardNo'),
          card_status: getString(result, 'CardNo') ? 'active' : undefined,
          raw_latest_payload: payload,
          updated_at: now,
        })
        .eq('id', (subscription as any).id)
    }
  } else {
    await supa
      .from('subscriptions')
      .update({
        status: eventType === 'initial_auth' ? 'failed' : 'payment_failed',
        failed_payment_count:
          eventType === 'initial_auth'
            ? 0
            : Number((subscription as any).failed_payment_count || 0) + 1,
        raw_latest_payload: payload,
        updated_at: now,
      })
      .eq('id', (subscription as any).id)
  }

  await supa
    .from('newebpay_webhook_events')
    .update({ status: 'processed', processed_at: now })
    .eq('id', event.id)

  return res.status(200).json({ status: 'SUCCESS', message: 'OK' })
}
