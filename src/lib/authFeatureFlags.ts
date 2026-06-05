import type { SupabaseClient } from '@supabase/supabase-js'

const isOff = (value: string | undefined | null): boolean =>
  ['off', 'false', '0', 'disabled', 'disable', 'no'].includes(
    String(value || '').trim().toLowerCase()
  )

export const isMfaCertificationRequired = (): boolean =>
  !isOff(
    process.env.MFA_CERTIFICATION ||
      process.env.MFA_Certification ||
      process.env.MFA_CERTIFICATION_ENABLED ||
      process.env.MFA_REQUIRED
  )

export async function ensureMfaCertifiedWhenDisabled(args: {
  supa: SupabaseClient
  authUserId: string
}): Promise<void> {
  if (isMfaCertificationRequired()) return

  const nowIso = new Date().toISOString()
  await args.supa
    .from('profiles')
    .update({
      mfa_totp_enabled_at: nowIso,
    })
    .eq('auth_id', args.authUserId)
    .is('mfa_totp_enabled_at', null)
}
