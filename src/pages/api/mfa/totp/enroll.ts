import type { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'
import { getAuthUserIdFromRequest, getServiceClient } from '@/lib/supabaseServer'
import { sealText } from '@/lib/cryptoSeal'
import { base32Encode } from '@/lib/totp'

type Resp =
  | { ok: true; otpauth_url?: string; secret_base32?: string; already_enabled?: boolean; expires_in_seconds?: number }
  | { ok: false; error: string; message?: string }

const ISSUER = process.env.TOTP_ISSUER || 'AITUBER-KIT'
const ENROLL_TTL_MS = 15 * 60 * 1000

function buildOtpAuthUrl(params: { issuer: string; account: string; secretBase32: string }): string {
  const { issuer, account, secretBase32 } = params
  const label = encodeURIComponent(`${issuer}:${account}`)
  const q = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  })
  return `otpauth://totp/${label}?${q.toString()}`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Resp>) {
  if (req.method !== 'POST') return res.status(405).end()

  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' })

  // TODO: rate limit (per IP / per account). Serverless 下 in-memory 不可靠，需用 KV/Redis 才能穩定。

  const supa = getServiceClient()
  const { data: profile } = await supa
    .from('profiles')
    .select('id, email, mfa_totp_enabled_at')
    .eq('auth_id', authUserId)
    .maybeSingle()

  if (!profile?.id) return res.status(400).json({ ok: false, error: 'PROFILE_NOT_FOUND' })

  if (profile.mfa_totp_enabled_at) {
    return res.status(200).json({ ok: true, already_enabled: true })
  }

  const secretBytes = crypto.randomBytes(20)
  const secretBase32 = base32Encode(secretBytes)
  const otpauthUrl = buildOtpAuthUrl({
    issuer: ISSUER,
    account: (profile.email || profile.id).toString(),
    secretBase32,
  })

  const expiresAt = new Date(Date.now() + ENROLL_TTL_MS).toISOString()
  let sealed = ''
  try {
    sealed = sealText(secretBase32)
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      error: 'SERVER_MISCONFIGURED',
      message: e?.message || 'SERVER_MISCONFIGURED',
    })
  }

  await supa.from('totp_enrollments').upsert(
    [
      {
        profile_id: profile.id,
        secret_enc: sealed,
        expires_at: expiresAt,
        attempt_count: 0,
        updated_at: new Date().toISOString(),
      },
    ],
    { onConflict: 'profile_id' }
  )

  return res.status(200).json({
    ok: true,
    otpauth_url: otpauthUrl,
    secret_base32: secretBase32,
    expires_in_seconds: Math.floor(ENROLL_TTL_MS / 1000),
  })
}


