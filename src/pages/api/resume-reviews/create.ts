import type { NextApiRequest, NextApiResponse } from 'next'
import { createAuthContext } from '@/lib/authContext'
import { generateInvitationToken, normalizeEmail } from '@/lib/resumeReview'
import { sendResumeReviewInvitationEmail } from '@/lib/resumeReviewNotifications'

const EXPIRES_DAYS = 7
const INVITATION_LIMIT_PER_CANDIDATE = 3

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const ctx = createAuthContext(req)
  const me = await ctx.getProfile()
  if (!me?.id) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const { company_id, job_opening_id, candidate_email } = req.body || {}
  if (!company_id || !job_opening_id || !candidate_email) {
    return res.status(400).json({ error: 'MISSING_FIELDS' })
  }

  const isMember = await ctx.isCompanyMember(String(company_id))
  if (!isMember) return res.status(403).json({ error: 'FORBIDDEN' })

  const supa = ctx.supa

  const [standardsRes, jobRes, companyRes] = await Promise.all([
    supa.from('resume_review_standards').select('id').eq('job_opening_id', job_opening_id).limit(1),
    supa.from('job_opening').select('id, job_title, target_hires, hired_count').eq('id', job_opening_id).eq('company_id', company_id).maybeSingle(),
    supa.from('company').select('company_name').eq('id', company_id).maybeSingle(),
  ])

  if (!standardsRes.data || standardsRes.data.length === 0) {
    return res.status(400).json({ error: 'MISSING_REVIEW_STANDARD' })
  }
  if (!jobRes.data?.id) return res.status(404).json({ error: 'JOB_OPENING_NOT_FOUND' })
  if (Number(jobRes.data.hired_count || 0) >= Number(jobRes.data.target_hires || 1)) {
    return res.status(400).json({ error: 'CAPACITY_REACHED' })
  }

  const normalizedEmail = normalizeEmail(String(candidate_email))
  if (!normalizedEmail) return res.status(400).json({ error: 'INVALID_EMAIL' })

  const now = new Date()
  const expiresAt = new Date(now.getTime() + EXPIRES_DAYS * 24 * 60 * 60 * 1000)
  const tokenBundle = generateInvitationToken()

  const { data, error } = await supa
    .from('resume_review_requests')
    .insert({
      company_id,
      job_opening_id,
      candidate_email: normalizedEmail,
      invitation_token: tokenBundle.storedTokenHash,
      token_expires_at: expiresAt.toISOString(),
      invited_by_profile_id: me.id,
      status: 'invited',
    })
    .select('id')
    .single()

  if (error || !data?.id) {
    const msg = String(error?.message || '')
    if (msg.includes('INVITATION_LIMIT_EXCEEDED')) {
      return res.status(400).json({
        error: 'INVITATION_LIMIT_EXCEEDED',
        message: `同一候選人於同職缺的履歷審查邀請最多 ${INVITATION_LIMIT_PER_CANDIDATE} 次`,
      })
    }
    return res.status(400).json({ error: 'CREATE_FAILED' })
  }

  try {
    await sendResumeReviewInvitationEmail({
      to: normalizedEmail,
      companyName: String(companyRes.data?.company_name || company_id),
      jobTitle: String(jobRes.data?.job_title || job_opening_id),
      token: tokenBundle.rawToken,
      expiresAt: expiresAt.toISOString(),
    })
  } catch (mailErr) {
    console.error('[resume-reviews/create] email failed:', mailErr)
  }

  return res.status(200).json({ ok: true, id: data.id })
}
