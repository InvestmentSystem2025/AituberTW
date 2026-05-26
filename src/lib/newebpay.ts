import crypto from 'crypto'
import {
  getNewebPayCredentials,
  getNewebPayEnv,
  trimEnv,
} from './newebpay/shared'

// Legacy MPG helper for the temporary NT$1 test page only.
// Do not use this module for the new billing flow.
// New MPG one-time purchase billing uses src/lib/newebpay/mpgClient.ts with
// NEWEBPAY_MPG_VERSION=2.3. Periodic billing uses fixed Version=1.5 in
// src/lib/newebpay/periodicClient.ts and does not read NEWEBPAY_VERSION.

export type NewebPayEnv = 'test' | 'production'

export type NewebPayCheckoutFields = {
  MerchantID: string
  TradeInfo: string
  TradeSha: string
  Version: string
}

type CreateMpgTradeInput = {
  amount: number
  itemDesc: string
  merchantOrderNo: string
  email?: string
  returnUrl: string
  notifyUrl: string
  clientBackUrl: string
}

export type NewebPayConfig = {
  merchantId: string
  hashKey: string
  hashIV: string
  version: string
  env: NewebPayEnv
}

const TEST_GATEWAY = 'https://ccore.newebpay.com/MPG/mpg_gateway'
const PRODUCTION_GATEWAY = 'https://core.newebpay.com/MPG/mpg_gateway'

export const getNewebPayGateway = (env: NewebPayEnv): string =>
  env === 'production' ? PRODUCTION_GATEWAY : TEST_GATEWAY

export const getNewebPayConfig = (): NewebPayConfig => {
  const env = getNewebPayEnv()
  const credentials = getNewebPayCredentials(env)

  return {
    ...credentials,
    version: trimEnv(process.env.NEWEBPAY_VERSION) || '2.0',
    env,
  }
}

export const validateNewebPayConfig = (
  config: NewebPayConfig
): string | null => {
  if (!config.merchantId) return 'NEWEBPAY_MERCHANT_ID 尚未設定'
  if (!config.hashKey) return 'NEWEBPAY_HASH_KEY 尚未設定'
  if (!config.hashIV) return 'NEWEBPAY_HASH_IV 尚未設定'
  if (Buffer.byteLength(config.hashKey, 'utf8') !== 32) {
    return 'NEWEBPAY_HASH_KEY 必須是 32 bytes'
  }
  if (Buffer.byteLength(config.hashIV, 'utf8') !== 16) {
    return 'NEWEBPAY_HASH_IV 必須是 16 bytes'
  }
  return null
}

const encodeTradeInfo = (payload: Record<string, string | number>): string =>
  new URLSearchParams(
    Object.entries(payload).map(([key, value]) => [key, String(value)])
  ).toString()

const encryptTradeInfo = (
  plainText: string,
  config: NewebPayConfig
): string => {
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(config.hashKey, 'utf8'),
    Buffer.from(config.hashIV, 'utf8')
  )
  cipher.setAutoPadding(true)
  return cipher.update(plainText, 'utf8', 'hex') + cipher.final('hex')
}

export const decryptTradeInfo = (
  tradeInfo: string,
  config: NewebPayConfig
): Record<string, unknown> | null => {
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(config.hashKey, 'utf8'),
    Buffer.from(config.hashIV, 'utf8')
  )
  decipher.setAutoPadding(true)
  const plainText =
    decipher.update(tradeInfo, 'hex', 'utf8') + decipher.final('utf8')

  try {
    const parsed = JSON.parse(plainText)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return Object.fromEntries(new URLSearchParams(plainText).entries())
  }
}

export const createTradeSha = (
  tradeInfo: string,
  config: NewebPayConfig
): string =>
  crypto
    .createHash('sha256')
    .update(`HashKey=${config.hashKey}&${tradeInfo}&HashIV=${config.hashIV}`)
    .digest('hex')
    .toUpperCase()

export const verifyTradeSha = (
  tradeInfo: string,
  tradeSha: string | undefined,
  config: NewebPayConfig
): boolean => {
  if (!tradeSha) return false
  const expected = createTradeSha(tradeInfo, config)
  const actual = tradeSha.trim().toUpperCase()
  if (expected.length !== actual.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
}

export const createNewebPayMpgTrade = (
  input: CreateMpgTradeInput,
  config: NewebPayConfig
): NewebPayCheckoutFields => {
  const tradePayload: Record<string, string | number> = {
    MerchantID: config.merchantId,
    RespondType: 'JSON',
    TimeStamp: Math.floor(Date.now() / 1000),
    Version: config.version,
    MerchantOrderNo: input.merchantOrderNo,
    Amt: input.amount,
    ItemDesc: input.itemDesc,
    LoginType: 0,
    ReturnURL: input.returnUrl,
    NotifyURL: input.notifyUrl,
    ClientBackURL: input.clientBackUrl,
  }

  if (input.email) tradePayload.Email = input.email

  const tradeInfo = encryptTradeInfo(encodeTradeInfo(tradePayload), config)

  return {
    MerchantID: config.merchantId,
    TradeInfo: tradeInfo,
    TradeSha: createTradeSha(tradeInfo, config),
    Version: config.version,
  }
}
