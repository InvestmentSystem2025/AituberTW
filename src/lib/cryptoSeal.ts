import crypto from 'crypto'

const KEY_ENV = 'MFA_TOTP_ENCRYPTION_KEY'

function parseKey(raw: string): Buffer {
  const trimmed = raw.trim()
  // try base64
  try {
    const b = Buffer.from(trimmed, 'base64')
    if (b.length === 32) return b
  } catch {}

  // try hex
  try {
    const b = Buffer.from(trimmed, 'hex')
    if (b.length === 32) return b
  } catch {}

  throw new Error(`${KEY_ENV} must be 32 bytes (base64 or hex)`)
}

function getKey(): Buffer {
  const raw = process.env[KEY_ENV]
  if (!raw) throw new Error(`${KEY_ENV} is not set`)
  return parseKey(raw)
}

/**
 * AES-256-GCM seal.
 * Format: base64(iv).base64(tag).base64(ciphertext)
 */
export function sealText(plaintext: string, aad: string = 'mfa_totp_secret_v1'): string {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`
}

export function openText(sealed: string, aad: string = 'mfa_totp_secret_v1'): string {
  const key = getKey()
  const parts = sealed.split('.')
  if (parts.length !== 3) throw new Error('Invalid sealed format')
  const [ivB64, tagB64, ctB64] = parts
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const ct = Buffer.from(ctB64, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(ct), decipher.final()])
  return plaintext.toString('utf8')
}


