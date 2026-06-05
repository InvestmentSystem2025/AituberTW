import type { NextApiRequest, NextApiResponse } from 'next'
import { getAuthUserIdFromRequest, getServiceClient } from '@/lib/supabaseServer'
import { openText } from '@/lib/cryptoSeal'
import { verifyTotpCode } from '@/lib/totp'
import {
  ensureMfaCertifiedWhenDisabled,
  isMfaCertificationRequired,
} from '@/lib/authFeatureFlags'

type Resp = { ok: true; already_enabled?: boolean } | { ok: false; message: string }

const FAIL_MSG = '認證碼錯誤或已過期。'
const MAX_ATTEMPTS = 5

function normalizeOtpCode(raw: string): string {
  // 轉半形：全形 ０-９ -> 0-9，再移除非數字
  const half = raw.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
  return half.replace(/[^\d]/g, '')
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Resp>) {
  if (req.method !== 'POST') return res.status(405).end()

  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ ok: false, message: FAIL_MSG })
  if (!isMfaCertificationRequired()) {
    const supa = getServiceClient()
    await ensureMfaCertifiedWhenDisabled({ supa, authUserId })
    return res.status(200).json({ ok: true, already_enabled: true })
  }

  const code = normalizeOtpCode(String(req.body?.code || '').trim())
  if (!/^\d{6}$/.test(code)) return res.status(200).json({ ok: false, message: FAIL_MSG })

  const supa = getServiceClient()
  const { data: profile } = await supa
    .from('profiles')
    .select('id, role, mfa_totp_enabled_at')
    .eq('auth_id', authUserId)
    .maybeSingle()

  if (!profile?.id) return res.status(200).json({ ok: false, message: FAIL_MSG })

  if (profile.mfa_totp_enabled_at) {
    return res.status(200).json({ ok: true, already_enabled: true })
  }

  const nowIso = new Date().toISOString()
  const { data: enrollment } = await supa
    .from('totp_enrollments')
    .select('id, secret_enc, attempt_count, expires_at')
    .eq('profile_id', profile.id)
    .gt('expires_at', nowIso)
    .maybeSingle()

  if (!enrollment) return res.status(200).json({ ok: false, message: FAIL_MSG })
  if ((enrollment.attempt_count || 0) >= MAX_ATTEMPTS) return res.status(200).json({ ok: false, message: FAIL_MSG })

  let secretBase32 = ''
  try {
    secretBase32 = openText(enrollment.secret_enc)
  } catch {
    return res.status(200).json({ ok: false, message: FAIL_MSG })
  }

  const ok = verifyTotpCode({ secretBase32, code, window: 1 })
  if (!ok) {
    await supa
      .from('totp_enrollments')
      .update({ attempt_count: (enrollment.attempt_count || 0) + 1, updated_at: nowIso })
      .eq('id', enrollment.id)
    return res.status(200).json({ ok: false, message: FAIL_MSG })
  }

  // commit secret to profile
  await supa
    .from('profiles')
    .update({
      mfa_totp_secret_enc: enrollment.secret_enc,
      mfa_totp_enabled_at: nowIso,
      mfa_totp_secret_ver: 1,
    })
    .eq('id', profile.id)

  // consume enrollment
  await supa.from('totp_enrollments').delete().eq('id', enrollment.id)

  // init quota (jobSeeker only; do not overwrite existing)
  if (profile.role === 'jobSeeker') {
    await supa
      .from('job_seeker_usage')
      .upsert([{ profile_id: profile.id, used_count: 0, free_quota: 3, updated_at: nowIso }], { onConflict: 'profile_id' })
  }

  return res.status(200).json({ ok: true })
}

