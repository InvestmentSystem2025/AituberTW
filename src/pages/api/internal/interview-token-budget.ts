/**
 * POST /api/internal/interview-token-budget
 *
 * Internal Node.js API route called by the Edge AI route. Edge runtime should
 * not import the Supabase service client, so interview allocation token
 * reserve/finalize/release is delegated here.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import {
  getAuthUserIdFromRequest,
  getServiceClient,
} from '@/lib/supabaseServer'
import {
  finalizeInterviewAllocationTokens,
  releaseInterviewAllocationTokens,
  reserveInterviewAllocationTokens,
} from '@/lib/billing/tokenBudgetService'

const INTERNAL_SECRET = process.env.CRON_SECRET as string | undefined

function isAuthorized(req: NextApiRequest): boolean {
  if (!INTERNAL_SECRET) {
    if (process.env.NODE_ENV === 'development') return true
    console.error(
      '[Internal/interview-token-budget] CRON_SECRET not set - refusing'
    )
    return false
  }
  return req.headers['x-internal-secret'] === INTERNAL_SECRET
}

async function canAccessInterview(
  req: NextApiRequest,
  companyId: string,
  interviewId: string
) {
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return false

  const supa = getServiceClient()
  const [profileRes, interviewRes] = await Promise.all([
    supa
      .from('profiles')
      .select('id, email, role')
      .eq('auth_id', authUserId)
      .maybeSingle(),
    supa
      .from('interviews')
      .select('id, company_id, profiles_id, candidate_email')
      .eq('id', interviewId)
      .maybeSingle(),
  ])

  const profile = profileRes.data as any
  const interview = interviewRes.data as any
  if (!profile?.id || !interview?.id) return false
  if (String(interview.company_id) !== companyId) return false

  const profileEmail = String(profile.email || '').toLowerCase()
  const candidateEmail = String(interview.candidate_email || '').toLowerCase()
  const isCandidate =
    (interview.profiles_id &&
      String(interview.profiles_id) === String(profile.id)) ||
    (profileEmail.length > 0 && profileEmail === candidateEmail)
  if (isCandidate) return true

  const { data: membership } = await supa
    .from('company_members')
    .select('id')
    .eq('company_id', companyId)
    .eq('profile_id', profile.id)
    .maybeSingle()

  return !!membership
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!isAuthorized(req)) return res.status(401).end()

  const {
    action,
    companyId,
    interviewId,
    requestId,
    requestType,
    model,
    estimatedTokens,
    inputTokens,
    outputTokens,
    reason,
  } = req.body ?? {}

  if (typeof action !== 'string' || typeof requestId !== 'string') {
    return res.status(400).json({ error: 'INVALID_PARAMS' })
  }

  const supa = getServiceClient()

  try {
    if (action === 'reserve') {
      if (
        typeof companyId !== 'string' ||
        typeof interviewId !== 'string' ||
        typeof requestType !== 'string' ||
        typeof estimatedTokens !== 'number'
      ) {
        return res.status(400).json({ error: 'INVALID_PARAMS' })
      }

      const allowed = await canAccessInterview(req, companyId, interviewId)
      if (!allowed) return res.status(403).json({ error: 'FORBIDDEN' })

      const { data, error } = await reserveInterviewAllocationTokens({
        supa,
        companyId,
        interviewId,
        requestId,
        requestType,
        model: typeof model === 'string' ? model : null,
        estimatedTokens: Math.max(1, Math.floor(estimatedTokens)),
      })
      if (error) throw error
      return res.status(200).json({ ok: true, allocation: data })
    }

    if (action === 'finalize') {
      if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') {
        return res.status(400).json({ error: 'INVALID_PARAMS' })
      }
      const { data, error } = await finalizeInterviewAllocationTokens(
        supa,
        requestId,
        Math.max(0, Math.floor(inputTokens)),
        Math.max(0, Math.floor(outputTokens))
      )
      if (error) throw error
      return res.status(200).json({ ok: true, usage: data })
    }

    if (action === 'release') {
      const { data, error } = await releaseInterviewAllocationTokens(
        supa,
        requestId,
        typeof reason === 'string' ? reason : undefined
      )
      if (error) throw error
      return res.status(200).json({ ok: true, usage: data })
    }

    return res.status(400).json({ error: 'INVALID_ACTION' })
  } catch (err: any) {
    const message = String(err?.message || '')
    if (message.includes('TOKEN_LIMIT_EXCEEDED')) {
      return res.status(402).json({ error: 'TOKEN_LIMIT_EXCEEDED' })
    }
    if (message.includes('INTERVIEW_ALLOCATION_NOT_FOUND')) {
      return res.status(404).json({ error: 'INTERVIEW_ALLOCATION_NOT_FOUND' })
    }
    if (message.includes('DUPLICATE_REQUEST_ID')) {
      return res.status(409).json({ error: 'DUPLICATE_REQUEST_ID' })
    }
    console.error('[Internal/interview-token-budget] failed:', err)
    return res.status(500).json({ error: 'INTERVIEW_TOKEN_BUDGET_FAILED' })
  }
}
