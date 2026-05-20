import type { NextApiRequest } from 'next'
import {
  createAuthContext,
  type AuthContext,
  type AuthProfile,
} from '@/lib/authContext'

export type BillingAuthContext = AuthContext & {
  profile: AuthProfile
}

export const requireBillingProfile = async (
  req: NextApiRequest
): Promise<BillingAuthContext> => {
  const ctx = createAuthContext(req)
  const profile = await ctx.getProfile()
  if (!profile?.id) throw new Error('UNAUTHORIZED')
  return Object.assign(ctx, { profile })
}

export const requireRecruiterCompanyMember = async (
  req: NextApiRequest,
  companyId: string
): Promise<BillingAuthContext> => {
  const ctx = await requireBillingProfile(req)
  if (ctx.profile.role !== 'recruiter') throw new Error('RECRUITER_ONLY')
  const isMember = await ctx.isCompanyMember(companyId)
  if (!isMember) throw new Error('FORBIDDEN')
  return ctx
}

export const requireBillingAdmin = async (
  req: NextApiRequest
): Promise<BillingAuthContext> => {
  const ctx = await requireBillingProfile(req)
  const email = (ctx.profile.email || '').toLowerCase()

  let query = ctx.supa
    .from('app_admins')
    .select('id, profile_id, email, role, is_active')
    .eq('is_active', true)
    .in('role', ['billing_admin', 'system_admin'])

  if (ctx.profile.id) {
    query = query.eq('profile_id', ctx.profile.id)
    const { data, error } = await query.maybeSingle()
    if (!error && data) return ctx
  }

  if (email) {
    const { data, error } = await ctx.supa
      .from('app_admins')
      .select('id, email, role, is_active')
      .eq('is_active', true)
      .in('role', ['billing_admin', 'system_admin'])
      .eq('email', email)
      .maybeSingle()
    if (!error && data) return ctx
  }

  throw new Error('FORBIDDEN')
}

export const mapAuthErrorToStatus = (error: unknown): number => {
  const message = error instanceof Error ? error.message : String(error)
  if (message === 'UNAUTHORIZED') return 401
  if (message === 'RECRUITER_ONLY' || message === 'FORBIDDEN') return 403
  return 400
}
