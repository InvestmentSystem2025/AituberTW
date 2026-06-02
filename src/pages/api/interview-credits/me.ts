import type { NextApiRequest, NextApiResponse } from 'next'
import { createAuthContext } from '@/lib/authContext'

type Resp =
  | {
      ok: true
      balance: {
        purchased_credits_remaining: number
        purchased_tokens_remaining: number
      }
      credits: {
        companyId: string | null
        freeQuota: number
        freeUsed: number
        freeRemaining: number
        purchasedCreditsRemaining: number
        purchasedTokensRemaining: number
        availableTokens: number
        historicalMaxInterviewTokens: number
        defaultEstimatedInterviewTokens: number
        requiredTokensForNewInterview: number
        estimatedRemainingInterviews: number
      }
      packages: Array<{
        id: string
        code: string
        name: string
        price_twd: number
        interview_count: number
        per_interview_token_cap: number
        token_amount: number
        is_active: boolean
        priceTwd: number
        interviewCount: number
        perInterviewTokenCap: number
        tokenAmount: number
      }>
      recent_purchases: Array<{
        id: string
        merchant_order_no: string
        amount: number
        interview_count: number
        token_amount: number
        status: string
        trade_no: string | null
        message: string | null
        created_at: string
        updated_at: string
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

  const [quotaRes, balanceRes, packagesRes, tokenSummaryRes] = await Promise.all([
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
          .select('purchased_credits_remaining, purchased_tokens_remaining')
          .eq('company_id', companyId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    ctx.supa
      .from('credit_packages')
      .select(
        'id, code, name, price_twd, interview_count, per_interview_token_cap, token_amount, is_active'
      )
      .eq('is_active', true)
      .order('price_twd', { ascending: true }),
    companyId
      ? ctx.supa.rpc('get_company_interview_token_summary', {
          p_company_id: companyId,
        })
      : Promise.resolve({ data: null }),
  ])

  const purchasesRes = companyId
    ? await ctx.supa
        .from('one_time_purchases')
        .select(
          'id, merchant_order_no, amount, interview_count, token_amount, status, trade_no, message, created_at, updated_at'
        )
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(5)
    : { data: [] }

  const freeUsed = Number((quotaRes.data as any)?.used_count || 0)
  const freeQuota = Number((quotaRes.data as any)?.free_quota || 0)
  const purchasedCreditsRemaining = Number(
    (balanceRes.data as any)?.purchased_credits_remaining || 0
  )
  const purchasedTokensRemaining = Number(
    (balanceRes.data as any)?.purchased_tokens_remaining || 0
  )
  const tokenSummary = (tokenSummaryRes.data as any) || {}
  const historicalMaxInterviewTokens = Number(
    tokenSummary.historical_max_interview_tokens || 0
  )
  const defaultEstimatedInterviewTokens = Number(
    tokenSummary.default_estimated_interview_tokens || 0
  )
  const requiredTokensForNewInterview = Number(
    tokenSummary.required_tokens_for_new_interview ||
      Math.max(historicalMaxInterviewTokens, defaultEstimatedInterviewTokens)
  )
  const estimatedRemainingInterviews =
    requiredTokensForNewInterview > 0
      ? Math.floor(purchasedTokensRemaining / requiredTokensForNewInterview)
      : 0

  return res.status(200).json({
    ok: true,
    balance: {
      purchased_credits_remaining: purchasedCreditsRemaining,
      purchased_tokens_remaining: purchasedTokensRemaining,
    },
    credits: {
      companyId,
      freeQuota,
      freeUsed,
      freeRemaining: Math.max(0, freeQuota - freeUsed),
      purchasedCreditsRemaining,
      purchasedTokensRemaining,
      availableTokens: purchasedTokensRemaining,
      historicalMaxInterviewTokens,
      defaultEstimatedInterviewTokens,
      requiredTokensForNewInterview,
      estimatedRemainingInterviews,
    },
    packages: ((packagesRes.data as any[]) || []).map((pkg) => ({
      id: pkg.id,
      code: pkg.code,
      name: pkg.name,
      price_twd: Number(pkg.price_twd),
      interview_count: Number(pkg.interview_count),
      per_interview_token_cap: Number(pkg.per_interview_token_cap),
      token_amount: Number(pkg.token_amount || 0),
      is_active: Boolean(pkg.is_active),
      priceTwd: Number(pkg.price_twd),
      interviewCount: Number(pkg.interview_count),
      perInterviewTokenCap: Number(pkg.per_interview_token_cap),
      tokenAmount: Number(pkg.token_amount || 0),
    })),
    recent_purchases: ((purchasesRes.data as any[]) || []).map((purchase) => ({
      id: purchase.id,
      merchant_order_no: purchase.merchant_order_no,
      amount: Number(purchase.amount),
      interview_count: Number(purchase.interview_count),
      token_amount: Number(purchase.token_amount || 0),
      status: purchase.status,
      trade_no: purchase.trade_no || null,
      message: purchase.message || null,
      created_at: purchase.created_at,
      updated_at: purchase.updated_at,
    })),
  })
}
