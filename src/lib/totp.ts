import crypto from 'crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(bytes: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

export function base32Decode(input: string): Buffer {
  const cleaned = input
    .toUpperCase()
    .replace(/=+$/g, '')
    .replace(/[^A-Z2-7]/g, '')

  let bits = 0
  let value = 0
  const out: number[] = []

  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }

  return Buffer.from(out)
}

function hotp(secret: Buffer, counter: number, digits: number): string {
  const buf = Buffer.alloc(8)
  // big-endian counter
  let tmp = counter
  for (let i = 7; i >= 0; i--) {
    buf[i] = tmp & 0xff
    tmp = Math.floor(tmp / 256)
  }

  const hmac = crypto.createHmac('sha1', secret).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)

  const mod = 10 ** digits
  const code = (binCode % mod).toString()
  return code.padStart(digits, '0')
}

export function totpNow(secret: Buffer, digits: number = 6, stepSeconds: number = 30, nowMs: number = Date.now()): string {
  const counter = Math.floor(nowMs / 1000 / stepSeconds)
  return hotp(secret, counter, digits)
}

export function verifyTotpCode(params: {
  secretBase32: string
  code: string
  window?: number
  digits?: number
  stepSeconds?: number
  nowMs?: number
}): boolean {
  const {
    secretBase32,
    code,
    window = 1,
    digits = 6,
    stepSeconds = 30,
    nowMs = Date.now()
  } = params

  if (!/^\d+$/.test(code)) return false
  const secret = base32Decode(secretBase32)
  const baseCounter = Math.floor(nowMs / 1000 / stepSeconds)
  for (let w = -window; w <= window; w++) {
    const expected = hotp(secret, baseCounter + w, digits)
    if (expected === code) return true
  }
  return false
}


