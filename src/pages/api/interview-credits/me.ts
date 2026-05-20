import type { NextApiRequest, NextApiResponse } from 'next'
import { createAuthContext } from '@/lib/authContext'

type Resp =
  | {
      ok: true
      credits: {
        companyId: string | null
        freeQuota: number
        freeUsed: number
        freeRemaining: number
        purchasedCreditsRemaining: number
      }
      packages: Array<{
        id: string
        code: string
        name: string
        priceTwd: number
        interviewCount: number
        perInterviewTokenCap: number
      }>
    }
  | { ok: false; error: string }

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Resp>
) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.method !== 'GET')
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' })

  const ctx = createAuthContext(req)
  const profile = await ctx.getProfile()
  if (!profile?.id)
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' })
  if (profile.role !== 'recruiter')
    return res.status(403).json({ ok: false, error: 'RECRUITER_ONLY' })

  const requestedCompanyId =
    typeof req.query.company_id === 'string' ? req.query.company_id : null
  let companyId = requestedCompanyId
  if (companyId) {
    const isMember = await ctx.isCompanyMember(companyId)
    if (!isMember)
      return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  } else {
    const { data: member } = await ctx.supa
      .from('company_members')
      .select('company_id')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    companyId = (member as any)?.company_id || null
  }

  const [quotaRes, balanceRes, packagesRes] = await Promise.all([
    companyId
      ? ctx.supa
          .from('company_interview_quota')
          .select('used_count, free_quota')
          .eq('company_id', companyId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    companyId
      ? ctx.supa
          .from('company_interview_credit_balance')
          .select('purchased_credits_remaining')
          .eq('company_id', companyId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    ctx.supa
      .from('credit_packages')
      .select(
        'id, code, name, price_twd, interview_count, per_interview_token_cap'
      )
      .eq('is_active', true)
      .order('price_twd', { ascending: true }),
  ])

  const freeUsed = Number((quotaRes.data as any)?.used_count || 0)
  const freeQuota = Number((quotaRes.data as any)?.free_quota || 0)

  return res.status(200).json({
    ok: true,
    credits: {
      companyId,
      freeQuota,
      freeUsed,
      freeRemaining: Math.max(0, freeQuota - freeUsed),
      purchasedCreditsRemaining: Number(
        (balanceRes.data as any)?.purchased_credits_remaining || 0
      ),
    },
    packages: ((packagesRes.data as any[]) || []).map((pkg) => ({
      id: pkg.id,
      code: pkg.code,
      name: pkg.name,
      priceTwd: Number(pkg.price_twd),
      interviewCount: Number(pkg.interview_count),
      perInterviewTokenCap: Number(pkg.per_interview_token_cap),
    })),
  })
}
