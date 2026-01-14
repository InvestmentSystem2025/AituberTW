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

  const supa = getServiceClient()

  const kind = String(req.query.kind || '').trim()
  const company_id = String(req.query.company_id || '').trim()
  const date_from = String(req.query.date_from || '').trim()
  const date_to = String(req.query.date_to || '').trim()
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 200)
  const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0)

  let q = supa
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
      interviews(job_opening_id, start_time, status, candidate_email),
      interview_sessions(interview_result, total_score, review_type, ai_evaluations, tokens_input, tokens_output)
    `,
      { count: 'exact' }
    )
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (kind) q = q.eq('kind', kind)
  if (company_id) q = q.eq('company_id', company_id)
  if (date_from) q = q.gte('updated_at', date_from)
  if (date_to) q = q.lte('updated_at', date_to)

  const { data, error, count } = await q
  if (error) return res.status(400).json({ error: 'LIST_FAILED', details: error.message })

  return res.status(200).json({
    items: data || [],
    count: count ?? null,
    limit,
    offset,
  })
}


