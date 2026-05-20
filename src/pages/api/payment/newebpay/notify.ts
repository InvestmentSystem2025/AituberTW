import type { NextApiRequest, NextApiResponse } from 'next'
import {
  decryptTradeInfo,
  getNewebPayConfig,
  validateNewebPayConfig,
  verifyTradeSha,
} from '@/lib/newebpay'

type NotifyResponse = {
  status: 'SUCCESS' | 'ERROR'
  message: string
}

const getBodyValue = (body: unknown, key: string): string | undefined => {
  if (!body || typeof body !== 'object') return undefined
  const value = (body as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

const handler = (req: NextApiRequest, res: NextApiResponse<NotifyResponse>) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res
      .status(405)
      .json({ status: 'ERROR', message: 'Method Not Allowed' })
  }

  const config = getNewebPayConfig()
  const configError = validateNewebPayConfig(config)
  if (configError) {
    return res.status(503).json({ status: 'ERROR', message: configError })
  }

  const tradeInfo = getBodyValue(req.body, 'TradeInfo')
  const tradeSha = getBodyValue(req.body, 'TradeSha')
  if (!tradeInfo || !verifyTradeSha(tradeInfo, tradeSha, config)) {
    return res
      .status(400)
      .json({ status: 'ERROR', message: 'Invalid TradeSha' })
  }

  const payload = decryptTradeInfo(tradeInfo, config)
  if (!payload) {
    return res
      .status(400)
      .json({ status: 'ERROR', message: 'Invalid TradeInfo' })
  }

  console.info('NewebPay notify received', {
    Status: payload.Status,
    MerchantOrderNo: (payload as any).Result?.MerchantOrderNo,
    TradeNo: (payload as any).Result?.TradeNo,
    Amt: (payload as any).Result?.Amt,
  })

  return res.status(200).json({ status: 'SUCCESS', message: 'OK' })
}

export default handler
