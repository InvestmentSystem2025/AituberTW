import type { NextApiRequest, NextApiResponse } from 'next'
import {
  createNewebPayMpgTrade,
  getNewebPayConfig,
  getNewebPayGateway,
  validateNewebPayConfig,
} from '@/lib/newebpay'

type SuccessResponse = {
  success: true
  data: {
    gatewayUrl: string
    amount: number
    merchantOrderNo: string
    fields: {
      MerchantID: string
      TradeInfo: string
      TradeSha: string
      Version: string
    }
  }
}

type ErrorResponse = {
  success: false
  error: string
}

const TEST_AMOUNT = 1
const TEST_ITEM_DESC = 'AITuberTW paid feature test'

const getOrigin = (req: NextApiRequest): string => {
  const configured =
    process.env.FRONTEND_ORIGIN ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.BASE_URL ||
    ''
  if (configured) return configured.replace(/\/+$/, '')

  const proto =
    (req.headers['x-forwarded-proto'] as string | undefined) || 'http'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${proto}://${host}`.replace(/\/+$/, '')
}

const sanitizeEmail = (email: unknown): string | undefined => {
  if (typeof email !== 'string') return undefined
  const trimmed = email.trim()
  if (!trimmed) return undefined
  if (trimmed.length > 80) return undefined
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return undefined
  return trimmed
}

const handler = (
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>
) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ success: false, error: 'Method Not Allowed' })
  }

  const config = getNewebPayConfig()
  const configError = validateNewebPayConfig(config)
  if (configError) {
    return res.status(503).json({ success: false, error: configError })
  }

  const origin = getOrigin(req)
  const merchantOrderNo = `NPT${Date.now()}${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`

  const fields = createNewebPayMpgTrade(
    {
      amount: TEST_AMOUNT,
      itemDesc: TEST_ITEM_DESC,
      merchantOrderNo,
      email: sanitizeEmail(req.body?.email),
      returnUrl: `${origin}/api/payment/newebpay/return`,
      notifyUrl: `${origin}/api/payment/newebpay/notify`,
      clientBackUrl: `${origin}/payment/newebpay-test`,
    },
    config
  )

  return res.status(200).json({
    success: true,
    data: {
      gatewayUrl: getNewebPayGateway(config.env),
      amount: TEST_AMOUNT,
      merchantOrderNo,
      fields,
    },
  })
}

export default handler
