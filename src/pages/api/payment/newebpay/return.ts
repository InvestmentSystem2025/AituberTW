import type { NextApiRequest, NextApiResponse } from 'next'
import {
  decryptTradeInfo,
  getNewebPayConfig,
  validateNewebPayConfig,
  verifyTradeSha,
} from '@/lib/newebpay'

const getBodyValue = (body: unknown, key: string): string | undefined => {
  if (!body || typeof body !== 'object') return undefined
  const value = (body as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

const redirectToTestPage = (
  res: NextApiResponse,
  status: 'success' | 'failed',
  merchantOrderNo?: string
) => {
  const params = new URLSearchParams({ status })
  if (merchantOrderNo) params.set('order', merchantOrderNo)
  return res.redirect(303, `/payment/newebpay-test?${params.toString()}`)
}

const handler = (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return redirectToTestPage(res, 'failed')
  }

  const config = getNewebPayConfig()
  const configError = validateNewebPayConfig(config)
  if (configError) return redirectToTestPage(res, 'failed')

  const tradeInfo = getBodyValue(req.body, 'TradeInfo')
  const tradeSha = getBodyValue(req.body, 'TradeSha')
  if (!tradeInfo || !verifyTradeSha(tradeInfo, tradeSha, config)) {
    return redirectToTestPage(res, 'failed')
  }

  const payload = decryptTradeInfo(tradeInfo, config)
  const result =
    payload && typeof payload === 'object' && (payload as any).Result
      ? (payload as any).Result
      : null
  const merchantOrderNo =
    result && typeof result.MerchantOrderNo === 'string'
      ? result.MerchantOrderNo
      : undefined
  const status =
    payload && (payload as any).Status === 'SUCCESS' ? 'success' : 'failed'

  return redirectToTestPage(res, status, merchantOrderNo)
}

export default handler
