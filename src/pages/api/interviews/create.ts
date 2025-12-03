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

  const payload: any = { company_id, job_opening_id, start_time }
  if (end_time) payload.end_time = end_time
  if (profiles_id) payload.profiles_id = profiles_id
  if (candidate_email) payload.candidate_email = String(candidate_email).toLowerCase()
  // 評價方式：預設為 AI，可選 HUMAN 或 MIXED
  if (review_type && ['AI', 'HUMAN', 'MIXED'].includes(review_type)) {
    payload.review_type = review_type
  }

  const { data: inserted, error } = await supa
    .from('interviews')
    .insert(payload)
    .select('id, company_id, job_opening_id, start_time, candidate_email, profiles_id')
    .single()

  if (error) {
    console.error('Interview create error:', error)
    return res.status(400).json({ error: 'CREATE_FAILED' })
  }

  try {
    await sendInterviewCreationEmail(inserted)
  } catch (mailErr) {
    console.error('Interview notification email error:', mailErr)
    return res.status(500).json({ error: 'EMAIL_FAILED' })
  }

  return res.status(200).json({ ok: true })
}


