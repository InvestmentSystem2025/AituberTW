import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient } from '@/lib/supabaseServer'
import {
  decryptMpgTradeInfo,
  getMaskedMpgCard,
  getMpgConfig,
  validateMpgConfig,
  verifyTradeSha,
} from '@/lib/newebpay/mpgClient'
import {
  buildWebhookUniqueKey,
  getResult,
  getString,
  isPaymentSuccess,
} from '@/lib/newebpay/webhookService'

type Resp = { status: 'SUCCESS' | 'ERROR'; message: string }

const readBodyValue = (body: unknown, key: string): string | null => {
  if (!body || typeof body !== 'object') return null
  const value = (body as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

const createSecurityEvent = async (args: {
  uniqueKey: string
  tradeInfo?: string | null
  payload?: Record<string, unknown> | null
  message: string
}) => {
  const supa = getServiceClient()
  await supa.from('newebpay_webhook_events').upsert(
    {
      provider: 'newebpay',
      event_type: 'mpg_one_time_purchase',
      unique_key: args.uniqueKey,
      raw_encrypted_payload: args.tradeInfo || null,
      raw_decrypted_payload: args.payload || null,
      status: 'security_alert',
      error_message: args.message,
    },
    { onConflict: 'unique_key' }
  )
  await supa.from('billing_alerts').insert({
    type: 'security_alert',
    severity: 'critical',
    message: args.message,
    raw_payload: args.payload || null,
  })
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Resp>
) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res
      .status(405)
      .json({ status: 'ERROR', message: 'METHOD_NOT_ALLOWED' })
  }

  const config = getMpgConfig()
  const configError = validateMpgConfig(config)
  if (configError)
    return res.status(500).json({ status: 'ERROR', message: 'CONFIG_ERROR' })

  const tradeInfo = readBodyValue(req.body, 'TradeInfo')
  const tradeSha = readBodyValue(req.body, 'TradeSha')
  if (!tradeInfo || !verifyTradeSha(tradeInfo, tradeSha || undefined, config)) {
    await createSecurityEvent({
      uniqueKey: `newebpay:mpg_one_time_purchase:invalid_sha:${Date.now()}`,
      tradeInfo,
      message: 'MPG TradeSha verification failed',
    })
    return res
      .status(200)
      .json({ status: 'SUCCESS', message: 'SECURITY_ALERT_RECORDED' })
  }

  let payload: Record<string, unknown>
  try {
    payload = decryptMpgTradeInfo(tradeInfo, config)
  } catch (error) {
    await createSecurityEvent({
      uniqueKey: `newebpay:mpg_one_time_purchase:decrypt_failed:${Date.now()}`,
      tradeInfo,
      message: 'MPG TradeInfo decrypt failed',
    })
    return res
      .status(200)
      .json({ status: 'SUCCESS', message: 'SECURITY_ALERT_RECORDED' })
  }

  const result = getResult(payload)
  const uniqueKey = buildWebhookUniqueKey('mpg_one_time_purchase', payload)
  const supa = getServiceClient()

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
  const tradeNo = getString(result, 'TradeNo')
  const respondCode = getString(result, 'RespondCode')
  const amt = Number(getString(result, 'Amt') || 0)
  const paymentType = getString(result, 'PaymentType')
  const merchantId =
    getString(result, 'MerchantID') || getString(payload, 'MerchantID')

  const { data: event, error: eventErr } = await supa
    .from('newebpay_webhook_events')
    .upsert(
      {
        provider: 'newebpay',
        event_type: 'mpg_one_time_purchase',
        merchant_order_no: merchantOrderNo,
        trade_no: tradeNo,
        respond_code: respondCode,
        unique_key: uniqueKey,
        raw_encrypted_payload: tradeInfo,
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

  const failSecurity = async (message: string) => {
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

  if (merchantId !== config.merchantId)
    return failSecurity('MPG MerchantID mismatch')
  if (!merchantOrderNo) return failSecurity('MPG MerchantOrderNo missing')

  const { data: purchase } = await supa
    .from('one_time_purchases')
    .select('id, company_id, amount, interview_count, token_amount, status')
    .eq('merchant_order_no', merchantOrderNo)
    .maybeSingle()
  if (!purchase) return failSecurity('MPG MerchantOrderNo not found')
  await supa
    .from('newebpay_webhook_events')
    .update({ company_id: (purchase as any).company_id })
    .eq('id', event.id)
  if ((purchase as any).status !== 'pending') {
    await supa
      .from('newebpay_webhook_events')
      .update({ status: 'ignored', processed_at: new Date().toISOString() })
      .eq('id', event.id)
    return res
      .status(200)
      .json({ status: 'SUCCESS', message: 'PURCHASE_NOT_PENDING' })
  }
  if (Number((purchase as any).amount) !== amt)
    return failSecurity('MPG Amt mismatch')
  if (paymentType !== 'CREDIT')
    return failSecurity('MPG PaymentType is not CREDIT')

  if (!isPaymentSuccess(payload, result)) {
    await supa
      .from('one_time_purchases')
      .update({
        status: 'failed',
        trade_no: tradeNo,
        payment_type: paymentType,
        respond_code: respondCode,
        message: getString(payload, 'Message'),
        raw_payload: payload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', (purchase as any).id)
    await supa
      .from('newebpay_webhook_events')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('id', event.id)
    return res
      .status(200)
      .json({ status: 'SUCCESS', message: 'PAYMENT_FAILED_RECORDED' })
  }

  const cardMask = getMaskedMpgCard(result)
  const updateRes = await supa
    .from('one_time_purchases')
    .update({
      status: 'paid',
      trade_no: tradeNo,
      payment_type: paymentType,
      respond_code: respondCode,
      message: getString(payload, 'Message'),
      card_mask: cardMask,
      raw_payload: payload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', (purchase as any).id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (updateRes.error)
    return res
      .status(500)
      .json({ status: 'ERROR', message: 'PURCHASE_UPDATE_FAILED' })
  if (!updateRes.data?.id) {
    await supa
      .from('newebpay_webhook_events')
      .update({ status: 'ignored', processed_at: new Date().toISOString() })
      .eq('id', event.id)
    return res
      .status(200)
      .json({ status: 'SUCCESS', message: 'PURCHASE_ALREADY_HANDLED' })
  }

  const creditRes = await supa.rpc('add_company_purchased_tokens', {
    p_company_id: (purchase as any).company_id,
    p_tokens: Number((purchase as any).token_amount || 0),
  })
  if (creditRes.error)
    return res
      .status(500)
      .json({ status: 'ERROR', message: 'TOKEN_UPDATE_FAILED' })

  await supa
    .from('newebpay_webhook_events')
    .update({ status: 'processed', processed_at: new Date().toISOString() })
    .eq('id', event.id)

  return res.status(200).json({ status: 'SUCCESS', message: 'OK' })
}
