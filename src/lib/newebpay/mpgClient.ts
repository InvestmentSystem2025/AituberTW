import {
  aes256CbcDecryptFromHex,
  aes256CbcEncryptToHex,
  createSha256Upper,
  encodeQuery,
  getNewebPayCredentials,
  getNewebPayEnv,
  maskCardFromParts,
  parseNewebPayPlainText,
  timingSafeEqualText,
  toUnixTimestampSeconds,
  trimEnv,
  validateAesConfig,
  type NewebPayEnv,
} from './shared'

export type MpgConfig = {
  merchantId: string
  hashKey: string
  hashIV: string
  version: string
  env: NewebPayEnv
}

export type MpgCheckoutFields = {
  MerchantID: string
  TradeInfo: string
  TradeSha: string
  Version: string
}

export type CreateMpgTradeInput = {
  merchantOrderNo: string
  amount: number
  itemDesc: string
  orderDetail?: string
  email?: string
  returnUrl: string
  notifyUrl: string
  clientBackUrl: string
}

const MPG_TEST_GATEWAY = 'https://ccore.newebpay.com/MPG/mpg_gateway'
const MPG_PRODUCTION_GATEWAY = 'https://core.newebpay.com/MPG/mpg_gateway'

export const getMpgConfig = (): MpgConfig => {
  const env = getNewebPayEnv()
  const credentials = getNewebPayCredentials(env, {
    merchantId: process.env.NEWEBPAY_MPG_MERCHANT_ID,
    hashKey: process.env.NEWEBPAY_MPG_HASH_KEY,
    hashIV: process.env.NEWEBPAY_MPG_HASH_IV,
  })

  return {
    ...credentials,
    version: trimEnv(process.env.NEWEBPAY_MPG_VERSION) || '2.3',
    env,
  }
}

export const validateMpgConfig = (config: MpgConfig): string | null =>
  validateAesConfig(config)

export const getMpgGateway = (env: NewebPayEnv): string =>
  env === 'production' ? MPG_PRODUCTION_GATEWAY : MPG_TEST_GATEWAY

export const createTradeSha = (tradeInfo: string, config: MpgConfig): string =>
  createSha256Upper(
    `HashKey=${config.hashKey}&${tradeInfo}&HashIV=${config.hashIV}`
  )

export const verifyTradeSha = (
  tradeInfo: string,
  tradeSha: string | undefined,
  config: MpgConfig
): boolean => {
  if (!tradeSha) return false
  return timingSafeEqualText(
    createTradeSha(tradeInfo, config),
    tradeSha.trim().toUpperCase()
  )
}

export const encryptMpgTradeInfo = (
  payload: Record<string, string | number | undefined | null>,
  config: MpgConfig
): string =>
  aes256CbcEncryptToHex(encodeQuery(payload), config.hashKey, config.hashIV)

export const decryptMpgTradeInfo = (
  encrypted: string,
  config: MpgConfig
): Record<string, unknown> => {
  const plainText = aes256CbcDecryptFromHex(
    encrypted,
    config.hashKey,
    config.hashIV
  )
  return parseNewebPayPlainText(plainText)
}

export const createMpgTradeFields = (
  input: CreateMpgTradeInput,
  config: MpgConfig
): MpgCheckoutFields => {
  const tradePayload = {
    MerchantID: config.merchantId,
    RespondType: 'JSON',
    TimeStamp: toUnixTimestampSeconds(),
    Version: config.version,
    MerchantOrderNo: input.merchantOrderNo,
    Amt: input.amount,
    ItemDesc: input.itemDesc,
    OrderDetail: input.orderDetail,
    NotifyURL: input.notifyUrl,
    ReturnURL: input.returnUrl,
    ClientBackURL: input.clientBackUrl,
    Email: input.email,
    CREDIT: 1,
    LoginType: 0,
  }
  const tradeInfo = encryptMpgTradeInfo(tradePayload, config)
  return {
    MerchantID: config.merchantId,
    TradeInfo: tradeInfo,
    TradeSha: createTradeSha(tradeInfo, config),
    Version: config.version,
  }
}

export const getMaskedMpgCard = (
  result: Record<string, unknown>
): string | null => maskCardFromParts(result.Card6No, result.Card4No)
