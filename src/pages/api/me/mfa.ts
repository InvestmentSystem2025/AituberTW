import type { NextApiRequest, NextApiResponse } from 'next'
import { getAuthUserIdFromRequest, getServiceClient } from '@/lib/supabaseServer'
import {
  ensureMfaCertifiedWhenDisabled,
  isMfaCertificationRequired,
} from '@/lib/authFeatureFlags'

type Resp = { mfa_enabled: boolean; role?: string } | { error: string }

export default async function handler(req: NextApiRequest, res: NextApiResponse<Resp>) {
  if (req.method !== 'GET') return res.status(405).end()

  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const supa = getServiceClient()
  if (!isMfaCertificationRequired()) {
    await ensureMfaCertifiedWhenDisabled({ supa, authUserId })
  }

  const { data: profile, error } = await supa
    .from('profiles')
    .select('role, mfa_totp_enabled_at')
    .eq('auth_id', authUserId)
    .maybeSingle()

  // 首次登入/剛驗證完 email 的瞬間，profiles 可能尚未同步建立。
  // 這裡不要回 500（會讓前端誤以為可進 /me），而是保守視為「尚未完成 MFA」。
  if (error || !profile) {
    return res.status(200).json({ mfa_enabled: !isMfaCertificationRequired() })
  }

  return res.status(200).json({
    mfa_enabled:
      !isMfaCertificationRequired() || !!profile.mfa_totp_enabled_at,
    role: profile.role,
  })
}

