import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient, getAuthUserIdFromRequest } from '@/lib/supabaseServer'
import { sendInterviewCreationEmail } from '@/lib/interviewNotifications'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })
  const { company_id, job_opening_id, start_time, end_time, profiles_id, candidate_email, review_type } = req.body || {}
  if (!company_id || !job_opening_id || !start_time) return res.status(400).json({ error: 'MISSING_FIELDS' })
  
  // 確保 profiles_id 和 candidate_email 只有一個被提供
  if (profiles_id && candidate_email) return res.status(400).json({ error: 'XOR_PROFILE_EMAIL' })
  if (!profiles_id && !candidate_email) return res.status(400).json({ error: 'XOR_PROFILE_EMAIL' })

  const supa = getServiceClient()
  const { data: me } = await supa.from('profiles').select('id').eq('auth_id', authUserId).single()
  if (!me) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })
  const { data: scope } = await supa.from('company_members').select('profile_id').eq('company_id', company_id).eq('profile_id', me.id).maybeSingle()
  if (!scope) return res.status(403).json({ error: 'FORBIDDEN' })

  // 如果提供了 profiles_id，驗證它是否存在
  if (profiles_id) {
    const { data: profileCheck } = await supa.from('profiles').select('id').eq('id', profiles_id).maybeSingle()
    if (!profileCheck) {
      return res.status(400).json({ error: 'PROFILE_ID_NOT_FOUND' })
    }
  }

  const { data: rpcData, error: rpcErr } = await supa.rpc('create_interview_with_quota', {
    p_company_id: company_id,
    p_job_opening_id: job_opening_id,
    p_start_time: start_time,
    p_end_time: end_time || null,
    p_profiles_id: profiles_id || null,
    p_candidate_email: candidate_email ? String(candidate_email).toLowerCase() : null,
    p_review_type: review_type && ['AI', 'HUMAN', 'MIXED'].includes(review_type) ? review_type : 'AI',
    p_created_by_profile_id: me.id,
  })

  if (rpcErr) {
    const msg = rpcErr.message || ''
    if (msg.includes('CAPACITY_REACHED')) return res.status(400).json({ error: 'CAPACITY_REACHED' })
    if (msg.includes('INTERVIEW_QUOTA_EXCEEDED')) return res.status(400).json({ error: 'INTERVIEW_QUOTA_EXCEEDED' })
    if (msg.includes('CANDIDATE_NOT_JOBSEEKER')) return res.status(400).json({ error: 'CANDIDATE_NOT_JOBSEEKER' })
    if (msg.includes('PROFILE_ID_NOT_FOUND')) return res.status(400).json({ error: 'PROFILE_ID_NOT_FOUND' })
    if (msg.includes('XOR_PROFILE_EMAIL')) return res.status(400).json({ error: 'XOR_PROFILE_EMAIL' })
    if (msg.includes('BILLING_REQUIRED')) return res.status(402).json({ error: 'BILLING_REQUIRED' })
    if (msg.includes('PURCHASED_CREDIT_LEDGER_MISMATCH')) return res.status(409).json({ error: 'PURCHASED_CREDIT_LEDGER_MISMATCH' })
    console.error('Interview create rpc error:', rpcErr)
    return res.status(400).json({ error: 'CREATE_FAILED' })
  }

  const inserted = {
    id: rpcData?.id,
    company_id: rpcData?.company_id,
    job_opening_id: rpcData?.job_opening_id,
    start_time: rpcData?.start_time,
    candidate_email: rpcData?.candidate_email,
    profiles_id: rpcData?.profiles_id,
  }

  try {
    await sendInterviewCreationEmail(inserted)
  } catch (mailErr) {
    console.error('Interview notification email error:', mailErr)
    return res.status(500).json({ error: 'EMAIL_FAILED' })
  }

  return res.status(200).json({ ok: true })
}

