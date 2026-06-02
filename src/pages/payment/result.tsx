import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { GetServerSideProps } from 'next'
import type { IncomingMessage } from 'http'
import {
  decryptMpgTradeInfo,
  getMpgConfig,
  validateMpgConfig,
  verifyTradeSha,
} from '@/lib/newebpay/mpgClient'
import { getResult, getString } from '@/lib/newebpay/webhookService'
import { supabase } from '@/lib/supabaseClient'
import { getServiceClient } from '@/lib/supabaseServer'

type Status = 'loading' | 'ready' | 'error'

const CAPTURE_KEYS = [
  'Status',
  'Message',
  'MerchantID',
  'MerchantOrderNo',
  'TradeNo',
  'RespondCode',
  'TradeInfo',
  'TradeSha',
  'Version',
]

const SENSITIVE_KEY_PATTERN = /hash|key|iv|token|secret|password/i

const toStringValue = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (Array.isArray(value))
    return typeof value[0] === 'string' ? value[0] : null
  if (typeof value === 'number') return String(value)
  return null
}

const sanitizePayload = (
  payload: Record<string, unknown>
): Record<string, unknown> => {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = '[REDACTED]'
      continue
    }
    if (key === 'TradeInfo' || key === 'TradeSha') {
      const text = toStringValue(value) || ''
      sanitized[`${key}Present`] = Boolean(text)
      sanitized[`${key}Length`] = text.length
      continue
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizePayload(value as Record<string, unknown>)
      continue
    }
    sanitized[key] = value
  }
  return sanitized
}

const readRawBody = async (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 64 * 1024) {
        reject(new Error('RETURN_CAPTURE_BODY_TOO_LARGE'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })

const parseUrlEncodedBody = (rawBody: string): Record<string, string> =>
  Object.fromEntries(new URLSearchParams(rawBody).entries())

const captureNewebPayReturn = async (args: {
  method: string
  query: Record<string, unknown>
  body: Record<string, unknown>
}) => {
  const merged = { ...args.query, ...args.body }
  const hasNewebPayPayload = CAPTURE_KEYS.some((key) =>
    toStringValue(merged[key])
  )
  if (!hasNewebPayPayload && args.method !== 'POST') return

  const tradeInfo = toStringValue(merged.TradeInfo)
  const tradeSha = toStringValue(merged.TradeSha) || undefined
  let decryptedPayload: Record<string, unknown> | null = null
  let tradeShaVerified = false
  let decryptError: string | null = null

  const config = getMpgConfig()
  const configError = validateMpgConfig(config)
  if (!configError && tradeInfo) {
    tradeShaVerified = verifyTradeSha(tradeInfo, tradeSha, config)
    if (tradeShaVerified) {
      try {
        decryptedPayload = decryptMpgTradeInfo(tradeInfo, config)
      } catch (error) {
        decryptError =
          error instanceof Error
            ? error.message
            : 'RETURN_CAPTURE_DECRYPT_FAILED'
      }
    }
  }

  const result = decryptedPayload ? getResult(decryptedPayload) : {}
  const merchantOrderNo =
    getString(result, 'MerchantOrderNo') ||
    toStringValue(merged.MerchantOrderNo) ||
    null
  const respondCode =
    getString(result, 'RespondCode') || toStringValue(merged.RespondCode)
  const status =
    toStringValue(merged.Status) || getString(decryptedPayload || {}, 'Status')
  const message =
    toStringValue(merged.Message) ||
    getString(decryptedPayload || {}, 'Message')
  const capturedAt = new Date().toISOString()
  const rawDecryptedPayload = sanitizePayload({
    source: 'return_url',
    method: args.method,
    captured_at: capturedAt,
    fields: sanitizePayload(merged),
    trade_sha_verified: tradeShaVerified,
    config_error: configError,
    decrypt_error: decryptError,
    decrypted_payload: decryptedPayload
      ? sanitizePayload(decryptedPayload)
      : null,
  })

  const supa = getServiceClient()
  const uniqueKey = `newebpay:return_capture:${merchantOrderNo || 'unknown'}:${Date.now()}`
  const { error } = await supa.from('newebpay_webhook_events').insert({
    provider: 'newebpay',
    event_type: 'mpg_one_time_purchase',
    merchant_order_no: merchantOrderNo,
    respond_code: respondCode,
    unique_key: uniqueKey,
    raw_encrypted_payload: null,
    raw_decrypted_payload: rawDecryptedPayload,
    status: 'received',
    error_message: message
      ? `ReturnURL capture: ${status || 'NO_STATUS'} ${message}`.slice(0, 500)
      : 'ReturnURL capture',
  })

  if (error) {
    console.warn('NewebPay ReturnURL capture failed', {
      merchantOrderNo,
      respondCode,
      status,
      message,
      error: error.message,
    })
    return
  }

  console.info('NewebPay ReturnURL captured', {
    merchantOrderNo,
    respondCode,
    status,
    message,
    tradeInfoPresent: Boolean(tradeInfo),
    tradeInfoLength: tradeInfo?.length || 0,
    tradeShaPresent: Boolean(tradeSha),
    tradeShaVerified,
  })
}

export const getServerSideProps: GetServerSideProps = async ({
  req,
  query,
}) => {
  try {
    const method = req.method || 'GET'
    const rawBody =
      method === 'POST' || method === 'PUT' || method === 'PATCH'
        ? await readRawBody(req)
        : ''
    await captureNewebPayReturn({
      method,
      query,
      body: rawBody ? parseUrlEncodedBody(rawBody) : {},
    })
  } catch (error) {
    console.warn('NewebPay ReturnURL capture skipped', {
      error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
    })
  }

  return { props: {} }
}

export default function PaymentResultPage() {
  const [status, setStatus] = useState<Status>('loading')
  const [message, setMessage] = useState('付款結果確認中')

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) {
          if (!active) return
          setStatus('ready')
          setMessage('付款結果已送出，請回到個人頁重新登入後確認狀態。')
          return
        }
        const [subscriptionResponse, creditsResponse] = await Promise.all([
          fetch('/api/subscriptions/me', {
            headers: { 'x-supabase-token': token },
          }),
          fetch('/api/interview-credits/me', {
            headers: { 'x-supabase-token': token },
          }),
        ])
        if (!active) return
        if (!subscriptionResponse.ok && !creditsResponse.ok) {
          setStatus('ready')
          setMessage('付款結果已送出，系統仍在等待藍新通知確認。')
          return
        }
        const subscriptionBody = subscriptionResponse.ok
          ? await subscriptionResponse.json()
          : null
        const creditsBody = creditsResponse.ok
          ? await creditsResponse.json()
          : null
        const sub = subscriptionBody?.subscription
        const latestPurchase = creditsBody?.recent_purchases?.[0]
        setStatus('ready')
        if (latestPurchase?.status === 'paid') {
          setMessage('付款成功，TOKEN 餘額已更新。')
        } else if (latestPurchase?.status === 'failed') {
          setMessage('付款失敗，未增加 TOKEN 餘額。')
        } else if (
          sub?.status === 'active' ||
          sub?.status === 'cancel_at_period_end'
        ) {
          setMessage('訂閱狀態已更新。')
        } else {
          setMessage('付款結果確認中，請稍後重新整理。')
        }
      } catch {
        if (!active) return
        setStatus('error')
        setMessage('暫時無法查詢狀態，請稍後到個人頁確認。')
      }
    })()
    return () => {
      active = false
    }
  }, [])

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-16">
      <section className="mx-auto max-w-xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">付款結果</h1>
        <p className="mt-4 text-sm leading-6 text-gray-700">
          {status === 'loading' ? '正在查詢目前訂閱狀態。' : message}
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/me?tab=subscription"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          >
            回到訂閱頁
          </Link>
          <Link
            href="/me?tab=subscription"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800"
          >
            查看 TOKEN 餘額
          </Link>
        </div>
      </section>
    </main>
  )
}
