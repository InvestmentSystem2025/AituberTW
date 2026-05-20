import crypto from 'crypto'

const clean = (value: string): string => value.replace(/[^A-Za-z0-9_]/g, '')

export const createMerchantOrderNo = (prefix: string): string => {
  const safePrefix = clean(prefix).slice(0, 8) || 'AIT'
  const timestamp = Date.now().toString(36).toUpperCase()
  const suffix = crypto.randomBytes(4).toString('hex').toUpperCase()
  return clean(`${safePrefix}_${timestamp}_${suffix}`).slice(0, 30)
}

export const getAppBaseUrl = (req?: {
  headers?: Record<string, unknown>
}): string => {
  const configured =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.FRONTEND_ORIGIN ||
    process.env.BASE_URL ||
    ''
  if (configured) return configured.replace(/\/+$/, '')

  const proto =
    (req?.headers?.['x-forwarded-proto'] as string | undefined) || 'http'
  const host =
    (req?.headers?.['x-forwarded-host'] as string | undefined) ||
    (req?.headers?.host as string | undefined) ||
    'localhost:3000'
  return `${proto}://${host}`.replace(/\/+$/, '')
}
