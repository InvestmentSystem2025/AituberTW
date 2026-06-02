import type { NextApiRequest, NextApiResponse } from 'next'
import { createAuthContext } from '@/lib/authContext'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') return res.status(405).end()

  const company_id = String(req.query.company_id || '')
  if (!company_id) return res.status(400).json({ error: 'MISSING_COMPANY_ID' })

  const ctx = createAuthContext(req)
  const me = await ctx.getProfile()
  if (!me?.id) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const isMember = await ctx.isCompanyMember(company_id)
  if (!isMember) return res.status(403).json({ error: 'FORBIDDEN' })

  const supa = ctx.supa
  const nowIso = new Date().toISOString()
  const [quotaRes, balanceRes, tokenSummaryRes, subscriptionRes, entitlementRes] = await Promise.all([
    supa
      .from('company_interview_quota')
      .select('used_count, free_quota')
      .eq('company_id', company_id)
      .maybeSingle(),
    supa
      .from('company_interview_credit_balance')
      .select('purchased_credits_remaining, purchased_tokens_remaining')
      .eq('company_id', company_id)
      .maybeSingle(),
    supa.rpc('get_company_interview_token_summary', {
      p_company_id: company_id,
    }),
    supa
      .from('subscriptions')
      .select('id, status, current_period_end, monthly_token_limit, monthly_token_used')
      .eq('company_id', company_id)
      .in('status', [
        'active',
        'past_due',
        'payment_failed',
        'cancel_at_period_end',
        'card_update_required',
      ])
      .gt('current_period_end', nowIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supa
      .from('admin_billing_entitlements')
      .select('id, ends_at, monthly_token_limit_override, monthly_token_used')
      .eq('company_id', company_id)
      .eq('status', 'active')
      .lte('starts_at', nowIso)
      .gt('ends_at', nowIso)
      .order('ends_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const used = Number(quotaRes.data?.used_count || 0)
  const free = Number(quotaRes.data?.free_quota || 3)
  const purchasedCreditsRemaining = Number(
    balanceRes.data?.purchased_credits_remaining || 0
  )
  const purchasedTokensRemaining = Number(
    balanceRes.data?.purchased_tokens_remaining || 0
  )
  const tokenSummary = (tokenSummaryRes.data as any) || {}
  const freeInterviewTokenCap = Number(tokenSummary.free_interview_token_cap || 0)
  const requiredTokensForNewInterview = Number(
    tokenSummary.required_tokens_for_new_interview || 0
  )
  const estimatedRemainingInterviews =
    requiredTokensForNewInterview > 0
      ? Math.floor(purchasedTokensRemaining / requiredTokensForNewInterview)
      : 0
  const freeCanCreate =
    used < free &&
    freeInterviewTokenCap > 0 &&
    requiredTokensForNewInterview > 0 &&
    freeInterviewTokenCap > requiredTokensForNewInterview
  const paidTokenCanCreate =
    requiredTokensForNewInterview > 0 &&
    purchasedTokensRemaining > requiredTokensForNewInterview
  const subscriptionRemainingTokens =
    (subscriptionRes.data as any)?.monthly_token_limit == null
      ? 0
      : Math.max(
          0,
          Number((subscriptionRes.data as any).monthly_token_limit || 0) -
            Number((subscriptionRes.data as any).monthly_token_used || 0)
        )
  const adminRemainingTokens =
    (entitlementRes.data as any)?.monthly_token_limit_override == null
      ? 0
      : Math.max(
          0,
          Number((entitlementRes.data as any).monthly_token_limit_override || 0) -
            Number((entitlementRes.data as any).monthly_token_used || 0)
        )
  const entitlementCanCreate =
    requiredTokensForNewInterview > 0 &&
    Math.max(subscriptionRemainingTokens, adminRemainingTokens) >
      requiredTokensForNewInterview
  return res.status(200).json({
    ok: true,
    used_count: used,
    free_quota: free,
    remaining: Math.max(0, free - used),
    purchased_credits_remaining: purchasedCreditsRemaining,
    purchased_tokens_remaining: purchasedTokensRemaining,
    available_tokens: purchasedTokensRemaining,
    required_tokens_for_new_interview: requiredTokensForNewInterview,
    historical_max_interview_tokens: Number(
      tokenSummary.historical_max_interview_tokens || 0
    ),
    default_estimated_interview_tokens: Number(
      tokenSummary.default_estimated_interview_tokens || 0
    ),
    estimated_remaining_interviews: estimatedRemainingInterviews,
    subscription_tokens_remaining: subscriptionRemainingTokens,
    admin_tokens_remaining: adminRemainingTokens,
    can_create_interview: freeCanCreate || entitlementCanCreate || paidTokenCanCreate,
    total_remaining: Math.max(0, free - used) + purchasedCreditsRemaining,
  })
}
