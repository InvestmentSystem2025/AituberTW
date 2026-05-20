import {
  aes256CbcDecryptFromHex,
  aes256CbcEncryptToHex,
  encodeQuery,
  getNewebPayEnv,
  parseNewebPayPlainText,
  toUnixTimestampSeconds,
  trimEnv,
  validateAesConfig,
  type NewebPayEnv,
} from './shared'

export type PeriodicConfig = {
  merchantId: string
  hashKey: string
  hashIV: string
  env: NewebPayEnv
}

export type PeriodicCheckoutFields = {
  MerchantID_: string
  PostData_: string
}

export type CreatePeriodicCommissionInput = {
  merchantOrderNo: string
  prodDesc: string
  periodAmt: number
  periodType: 'D' | 'W' | 'M' | 'Y'
  periodPoint: string
  payerEmail: string
  returnUrl: string
  notifyUrl: string
  backUrl: string
  langType?: 'zh-Tw' | 'en'
  emailModify?: 0 | 1
  paymentInfo?: 'Y' | 'N'
  orderInfo?: 'Y' | 'N'
  periodMemo?: string
}

export type AlterPeriodicStatusInput = {
  merchantOrderNo: string
  periodNo: string
  alterType: 'suspend' | 'restart' | 'terminate'
}

const PERIOD_TEST_GATEWAY = 'https://ccore.newebpay.com/MPG/period'
const PERIOD_PRODUCTION_GATEWAY = 'https://core.newebpay.com/MPG/period'
const ALTER_TEST_GATEWAY = 'https://ccore.newebpay.com/MPG/period/AlterStatus'
const ALTER_PRODUCTION_GATEWAY =
  'https://core.newebpay.com/MPG/period/AlterStatus'

export const getPeriodicConfig = (): PeriodicConfig => ({
  merchantId:
    trimEnv(process.env.NEWEBPAY_PERIOD_MERCHANT_ID) ||
    trimEnv(process.env.NEWEBPAY_MERCHANT_ID),
  hashKey:
    trimEnv(process.env.NEWEBPAY_PERIOD_HASH_KEY) ||
    trimEnv(process.env.NEWEBPAY_HASH_KEY),
  hashIV:
    trimEnv(process.env.NEWEBPAY_PERIOD_HASH_IV) ||
    trimEnv(process.env.NEWEBPAY_HASH_IV),
  env: getNewebPayEnv(),
})

export const validatePeriodicConfig = (config: PeriodicConfig): string | null =>
  validateAesConfig(config)

export const getPeriodicGateway = (env: NewebPayEnv): string =>
  env === 'production' ? PERIOD_PRODUCTION_GATEWAY : PERIOD_TEST_GATEWAY

export const getPeriodicAlterStatusGateway = (env: NewebPayEnv): string =>
  env === 'production' ? ALTER_PRODUCTION_GATEWAY : ALTER_TEST_GATEWAY

export const encryptPeriodicPostData = (
  payload: Record<string, string | number | undefined | null>,
  config: PeriodicConfig
): string =>
  aes256CbcEncryptToHex(encodeQuery(payload), config.hashKey, config.hashIV)

export const decryptPeriodicPayload = (
  encrypted: string,
  config: PeriodicConfig
): Record<string, unknown> => {
  const plainText = aes256CbcDecryptFromHex(
    encrypted,
    config.hashKey,
    config.hashIV
  )
  return parseNewebPayPlainText(plainText)
}

export const createPeriodicCommissionFields = (
  input: CreatePeriodicCommissionInput,
  config: PeriodicConfig
): PeriodicCheckoutFields => {
  const payload = {
    RespondType: 'JSON',
    TimeStamp: toUnixTimestampSeconds(),
    Version: '1.5',
    LangType: input.langType || 'zh-Tw',
    MerOrderNo: input.merchantOrderNo,
    ProdDesc: input.prodDesc,
    PeriodAmt: input.periodAmt,
    PeriodType: input.periodType,
    PeriodPoint: input.periodPoint,
    PeriodStartType: 2,
    PeriodTimes: 'NE',
    ReturnURL: input.returnUrl,
    NotifyURL: input.notifyUrl,
    BackURL: input.backUrl,
    PayerEmail: input.payerEmail,
    EmailModify: input.emailModify ?? 0,
    PaymentInfo: input.paymentInfo || 'Y',
    OrderInfo: input.orderInfo || 'N',
    PeriodMemo: input.periodMemo,
  }

  return {
    MerchantID_: config.merchantId,
    PostData_: encryptPeriodicPostData(payload, config),
  }
}

export const createAlterPeriodicStatusFields = (
  input: AlterPeriodicStatusInput,
  config: PeriodicConfig
): PeriodicCheckoutFields => {
  const payload = {
    RespondType: 'JSON',
    Version: '1.0',
    MerOrderNo: input.merchantOrderNo,
    PeriodNo: input.periodNo,
    AlterType: input.alterType,
    TimeStamp: toUnixTimestampSeconds(),
  }

  return {
    MerchantID_: config.merchantId,
    PostData_: encryptPeriodicPostData(payload, config),
  }
}

export const postAlterPeriodicStatus = async (
  input: AlterPeriodicStatusInput,
  config: PeriodicConfig
): Promise<Record<string, unknown>> => {
  const fields = createAlterPeriodicStatusFields(input, config)
  const response = await fetch(getPeriodicAlterStatusGateway(config.env), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields as Record<string, string>).toString(),
  })
  const bodyText = await response.text()
  const body = (() => {
    try {
      return JSON.parse(bodyText)
    } catch {
      return Object.fromEntries(new URLSearchParams(bodyText).entries())
    }
  })() as Record<string, unknown>
  const encrypted =
    typeof body.period === 'string'
      ? body.period
      : typeof body.Period === 'string'
        ? body.Period
        : null
  if (!encrypted) {
    throw new Error(`NEWEBPAY_ALTER_STATUS_INVALID_RESPONSE:${response.status}`)
  }
  return decryptPeriodicPayload(encrypted, config)
}
