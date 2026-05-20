export type NewebPayEventType =
  | 'initial_auth'
  | 'period_auth'
  | 'cau'
  | 'mpg_one_time_purchase'

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

export const getResult = (
  payload: Record<string, unknown>
): Record<string, unknown> => asRecord(payload.Result)

export const getString = (
  obj: Record<string, unknown>,
  key: string
): string | null => {
  const value = obj[key]
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return null
}

export const isPaymentSuccess = (
  payload: Record<string, unknown>,
  result = getResult(payload)
): boolean =>
  payload.Status === 'SUCCESS' && getString(result, 'RespondCode') === '00'

export const inferPeriodEventType = (
  payload: Record<string, unknown>
): 'initial_auth' | 'period_auth' => {
  const result = getResult(payload)
  if (getString(result, 'OrderNo') || getString(result, 'AlreadyTimes')) {
    return 'period_auth'
  }
  return 'initial_auth'
}

export const inferCauEventType = (): 'cau' => 'cau'

export const buildWebhookUniqueKey = (
  eventType: NewebPayEventType,
  payload: Record<string, unknown>
): string => {
  const result = getResult(payload)
  const merchantOrderNo =
    getString(result, 'MerchantOrderNo') ||
    getString(result, 'MerOrderNo') ||
    ''
  const periodNo = getString(result, 'PeriodNo') || ''
  const orderNo = getString(result, 'OrderNo') || ''
  const tradeNo = getString(result, 'TradeNo') || ''
  const alreadyTimes = getString(result, 'AlreadyTimes') || ''
  const respondCode = getString(result, 'RespondCode') || ''

  if (eventType === 'initial_auth') {
    return tradeNo
      ? `newebpay:initial_auth:${periodNo}:${tradeNo}`
      : `newebpay:initial_auth:${merchantOrderNo}:${periodNo}`
  }

  if (eventType === 'period_auth') {
    return tradeNo
      ? `newebpay:period_auth:${periodNo}:${orderNo}:${tradeNo}`
      : `newebpay:period_auth:${periodNo}:${orderNo}:${alreadyTimes}:${respondCode}`
  }

  if (eventType === 'cau') {
    const cardStatus = getString(result, 'cardStatus') || ''
    const newExpiry = getString(result, 'newExpiry') || ''
    const nextAuthDate = getString(result, 'NextAuthDate') || ''
    return `newebpay:cau:${periodNo}:${cardStatus}:${newExpiry}:${nextAuthDate}`
  }

  const amt = getString(result, 'Amt') || ''
  const status = getString(payload, 'Status') || ''
  return tradeNo
    ? `newebpay:mpg_one_time_purchase:${merchantOrderNo}:${tradeNo}`
    : `newebpay:mpg_one_time_purchase:${merchantOrderNo}:${amt}:${status}:${respondCode}`
}

export const extractMerchantOrderNo = (
  payload: Record<string, unknown>
): string | null => {
  const result = getResult(payload)
  return getString(result, 'MerchantOrderNo') || getString(result, 'MerOrderNo')
}

export const extractRawEncrypted = (
  body: unknown,
  keys: string[]
): string | null => {
  const obj = asRecord(body)
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}
