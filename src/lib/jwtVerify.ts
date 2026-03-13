import crypto from 'crypto'

type JwtPayload = {
  sub?: string
  exp?: number
  nbf?: number
  iat?: number
  aud?: string | string[]
  iss?: string
  [k: string]: unknown
}

function base64UrlDecodeToBuffer(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(b64, 'base64')
}

function safeJsonParse(buf: Buffer): any {
  try {
    return JSON.parse(buf.toString('utf8'))
  } catch {
    return null
  }
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export function getSupabaseJwtSecretsFromEnv(): string[] {
  const raw =
    (process.env.SUPABASE_JWT_SECRETS || process.env.SUPABASE_JWT_SECRET || '').trim()
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function verifySupabaseAccessTokenAndGetSub(token: string, secrets: string[]): string | null {
  if (!token || !Array.isArray(secrets) || secrets.length === 0) return null

  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [h, p, sig] = parts
  const header = safeJsonParse(base64UrlDecodeToBuffer(h))
  const payload = safeJsonParse(base64UrlDecodeToBuffer(p)) as JwtPayload | null
  if (!header || !payload) return null

  // Supabase default is HS256 symmetric signing.
  if (header.alg !== 'HS256') return null

  const data = `${h}.${p}`
  const sigBuf = base64UrlDecodeToBuffer(sig)

  let ok = false
  for (const secret of secrets) {
    const mac = crypto.createHmac('sha256', secret).update(data).digest()
    if (timingSafeEqual(mac, sigBuf)) {
      ok = true
      break
    }
  }
  if (!ok) return null

  const now = Math.floor(Date.now() / 1000)
  const leeway = 30 // seconds
  if (typeof payload.nbf === 'number' && now + leeway < payload.nbf) return null
  if (typeof payload.exp === 'number' && now - leeway > payload.exp) return null

  const sub = typeof payload.sub === 'string' ? payload.sub.trim() : ''
  return sub || null
}

