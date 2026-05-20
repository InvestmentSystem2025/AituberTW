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
} from '@/lib/newebpay/webhookService'

type Resp = { status: 'SUCCESS' | 'ERROR'; message: string }

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

  const encrypted = extractRawEncrypted(req.body, [
    'Period',
    'period',
    'PostData',
  ])
  if (!encrypted)
    return res.status(400).json({ status: 'ERROR', message: 'MISSING_PAYLOAD' })

  const supa = getServiceClient()
  let payload: Record<string, unknown>
  try {
    payload = decryptPeriodicPayload(encrypted, config)
  } catch {
    await supa.from('newebpay_webhook_events').insert({
      provider: 'newebpay',
      event_type: 'cau',
      unique_key: `newebpay:cau:decrypt_failed:${Date.now()}`,
      raw_encrypted_payload: encrypted,
      status: 'security_alert',
      error_message: 'CAU payload decrypt failed',
    })
    return res
      .status(200)
      .json({ status: 'SUCCESS', message: 'SECURITY_ALERT_RECORDED' })
  }

  const result = getResult(payload)
  const uniqueKey = buildWebhookUniqueKey('cau', payload)
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

  const merchantOrderNo = getString(result, 'MerchantOrderNo')
  const periodNo = getString(result, 'PeriodNo')
  const cardStatus = getString(result, 'cardStatus')
  const now = new Date().toISOString()

  const { data: event, error: eventErr } = await supa
    .from('newebpay_webhook_events')
    .upsert(
      {
        provider: 'newebpay',
        event_type: 'cau',
        merchant_order_no: merchantOrderNo,
        period_no: periodNo,
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
    return securityAlert('CAU MerchantID mismatch')
  if (!merchantOrderNo && !periodNo)
    return securityAlert('CAU subscription identifier missing')

  let query = supa.from('subscriptions').select('id, company_id').limit(1)
  if (periodNo) query = query.eq('period_no', periodNo)
  else query = query.eq('merchant_order_no', merchantOrderNo)

  const { data: subscription } = await query.maybeSingle()
  if (!subscription) return securityAlert('CAU subscription not found')
  await supa
    .from('newebpay_webhook_events')
    .update({ company_id: (subscription as any).company_id })
    .eq('id', event.id)

  if (cardStatus === 'ACTIVE') {
    await supa
      .from('subscriptions')
      .update({
        card_status: 'active',
        card_expiry: getString(result, 'newExpiry'),
        raw_latest_payload: payload,
        updated_at: now,
      })
      .eq('id', (subscription as any).id)
  } else if (cardStatus === 'CARD_NOT_ALLOWED') {
    await supa
      .from('subscriptions')
      .update({
        status: 'card_update_required',
        card_status: 'card_not_allowed',
        payment_method_required_at: now,
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
