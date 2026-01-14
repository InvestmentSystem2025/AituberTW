import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient } from '@/lib/supabaseServer'

const ADMIN_USERNAME = 'super123'
const ADMIN_PASSWORD = 'kapibarachiikawa'

const encodeBasicToken = (username: string, password: string) =>
  Buffer.from(`${username}:${password}`).toString('base64')

const EXPECTED_TOKEN = encodeBasicToken(ADMIN_USERNAME, ADMIN_PASSWORD)

const isValidAdminRequest = (req: NextApiRequest): boolean => {
  const header = req.headers['x-admin-auth']
  if (!header || typeof header !== 'string') return false
  const token = header.startsWith('Basic ') ? header.slice(6).trim() : header
  return token === EXPECTED_TOKEN
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  if (!isValidAdminRequest(req)) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const id = String(req.query.id || '').trim()
  if (!id) return res.status(400).json({ error: 'MISSING_ID' })

  const supa = getServiceClient()
  const { data, error } = await supa
    .from('interview_session_feedback')
    .select(
      `
      id,
      kind,
      payload,
      created_at,
      updated_at,
      submitted_by_profile_id,
      company_id,
      interviews_id,
      interview_session_id,
      company(company_name),
      profiles(email, role),
      interviews(job_opening_id, start_time, status, candidate_email, profiles_id),
      interview_sessions(interview_result, total_score, review_type, duration_seconds, video_path, result_reason, ai_evaluations, tokens_input, tokens_output)
    `
    )
    .eq('id', id)
    .maybeSingle()

  if (error) return res.status(400).json({ error: 'GET_FAILED', details: error.message })

  // Attach evaluation_criteria (key -> display_name) for this interview's job_opening
  let evaluation_criteria: any[] = []
  try {
    const interview = Array.isArray((data as any)?.interviews)
      ? (data as any).interviews[0]
      : (data as any)?.interviews
    const jobOpeningId = interview?.job_opening_id
    if (jobOpeningId) {
      const { data: criteria, error: cErr } = await supa
        .from('evaluation_criteria')
        .select('key, display_name, max_score, weight, sort_order')
        .eq('job_opening_id', jobOpeningId)
        .order('sort_order', { ascending: true })
      if (!cErr && Array.isArray(criteria)) evaluation_criteria = criteria
    }
  } catch {
    // ignore
  }

  return res.status(200).json({
    item: data ? { ...(data as any), evaluation_criteria } : null,
  })
}


