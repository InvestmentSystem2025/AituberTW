import type { NextApiRequest } from 'next'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthUserIdFromRequest, getServiceClient } from '@/lib/supabaseServer'

export type AuthProfile = {
  id: string
  role: string
  email: string | null
  mfa_totp_enabled_at: string | null
  preferred_language: string | null
  family_name: string | null
  given_name: string | null
}

export type AuthContext = {
  supa: SupabaseClient
  getAuthUserId(): Promise<string | null>
  getProfile(): Promise<AuthProfile | null>
  requireProfile(): Promise<AuthProfile>
  isCompanyMember(companyId: string): Promise<boolean>
}

export function createAuthContext(req: NextApiRequest): AuthContext {
  const supa = getServiceClient()
  const authUserIdPromise = getAuthUserIdFromRequest(req)

  let profilePromise: Promise<AuthProfile | null> | null = null
  const membershipCache = new Map<string, Promise<boolean>>()

  const getProfile = async () => {
    if (!profilePromise) {
      profilePromise = (async () => {
        const authUserId = await authUserIdPromise
        if (!authUserId) return null

        const { data, error } = await supa
          .from('profiles')
          .select('id, role, email, mfa_totp_enabled_at, preferred_language, family_name, given_name')
          .eq('auth_id', authUserId)
          .maybeSingle()
        if (error || !data?.id) return null
        return {
          id: String(data.id),
          role: String((data as any).role || ''),
          email: (data as any).email ?? null,
          mfa_totp_enabled_at: (data as any).mfa_totp_enabled_at ?? null,
          preferred_language: (data as any).preferred_language ?? null,
          family_name: (data as any).family_name ?? null,
          given_name: (data as any).given_name ?? null,
        } satisfies AuthProfile
      })()
    }
    return profilePromise
  }

  const requireProfile = async () => {
    const p = await getProfile()
    if (!p) throw new Error('PROFILE_NOT_FOUND')
    return p
  }

  const isCompanyMember = async (companyId: string) => {
    const key = String(companyId || '')
    const existing = membershipCache.get(key)
    if (existing) return existing

    const p = (async () => {
      const prof = await getProfile()
      if (!prof?.id) return false
      const { data } = await supa
        .from('company_members')
        .select('id')
        .eq('company_id', key)
        .eq('profile_id', prof.id)
        .maybeSingle()
      return !!data
    })()
    membershipCache.set(key, p)
    return p
  }

  return {
    supa,
    getAuthUserId: () => authUserIdPromise,
    getProfile,
    requireProfile,
    isCompanyMember,
  }
}

