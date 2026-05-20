import crypto from 'crypto'

export type NewebPayEnv = 'test' | 'production'

export const trimEnv = (value: string | undefined): string =>
  (value || '').trim()

export const getNewebPayEnv = (): NewebPayEnv =>
  trimEnv(process.env.NEWEBPAY_ENV).toLowerCase() === 'production'
    ? 'production'
    : 'test'

export const validateAesConfig = (args: {
  merchantId: string
  hashKey: string
  hashIV: string
}): string | null => {
  if (!args.merchantId) return 'NewebPay MerchantID 尚未設定'
  if (!args.hashKey) return 'NewebPay HashKey 尚未設定'
  if (!args.hashIV) return 'NewebPay HashIV 尚未設定'
  if (Buffer.byteLength(args.hashKey, 'utf8') !== 32) {
    return 'NewebPay HashKey 必須是 32 bytes'
  }
  if (Buffer.byteLength(args.hashIV, 'utf8') !== 16) {
    return 'NewebPay HashIV 必須是 16 bytes'
  }
  return null
}

export const toUnixTimestampSeconds = (): number =>
  Math.floor(Date.now() / 1000)

export const encodeQuery = (
  payload: Record<string, string | number | undefined | null>
): string => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue
    params.set(key, String(value))
  }
  return params.toString()
}

export const aes256CbcEncryptToHex = (
  plainText: string,
  hashKey: string,
  hashIV: string
): string => {
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(hashKey, 'utf8'),
    Buffer.from(hashIV, 'utf8')
  )
  cipher.setAutoPadding(true)
  return cipher.update(plainText, 'utf8', 'hex') + cipher.final('hex')
}

export const aes256CbcDecryptFromHex = (
  encryptedHex: string,
  hashKey: string,
  hashIV: string
): string => {
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(hashKey, 'utf8'),
    Buffer.from(hashIV, 'utf8')
  )
  decipher.setAutoPadding(true)
  return decipher.update(encryptedHex, 'hex', 'utf8') + decipher.final('utf8')
}

export const parseNewebPayPlainText = (
  plainText: string
): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(plainText)
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    // Fall back to query-string payloads.
  }
  return Object.fromEntries(new URLSearchParams(plainText).entries())
}

export const createSha256Upper = (input: string): string =>
  crypto.createHash('sha256').update(input).digest('hex').toUpperCase()

export const timingSafeEqualText = (a: string, b: string): boolean => {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

export const maskCardFromParts = (
  card6: unknown,
  card4: unknown
): string | null => {
  const first = typeof card6 === 'string' ? card6.trim() : ''
  const last = typeof card4 === 'string' ? card4.trim() : ''
  if (!/^[0-9]{6}$/.test(first) || !/^[0-9]{4}$/.test(last)) return null
  return `${first}******${last}`
}
