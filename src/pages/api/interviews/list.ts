import type { NextApiRequest, NextApiResponse } from 'next'
import { getAuthUserIdFromRequest, getServiceClient } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })
  const company_id = String(req.query.company_id || '')
  if (!company_id) return res.status(400).json({ items: [] })

  const supa = getServiceClient()
  const { data: me } = await supa.from('profiles').select('id').eq('auth_id', authUserId).single()
  if (!me) return res.status(200).json({ items: [] })
  const { data: scope } = await supa.from('company_members').select('profile_id').eq('company_id', company_id).eq('profile_id', me.id).maybeSingle()
  if (!scope) return res.status(200).json({ items: [] })

  const { data, error } = await supa
    .from('interviews')
    .select(
      'id, job_opening_id, start_time, end_time, status, profiles_id, candidate_email, created_at, review_type, profiles:profiles_id(id, family_name, given_name), interview_sessions(id, interview_transcript, ai_evaluations, tokens_input, tokens_output, already_feedback, duration_seconds, video_path, interview_result, total_score, result_reason, review_type, created_at)'
    )
    .eq('company_id', company_id)
    .order('start_time', { ascending: false })
  if (error) return res.status(200).json({ items: [] })
  return res.status(200).json({ items: data || [] })
}


