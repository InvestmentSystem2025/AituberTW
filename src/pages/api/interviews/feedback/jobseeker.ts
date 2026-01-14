import type { NextApiRequest, NextApiResponse } from 'next'
import { getAuthUserIdFromRequest, getServiceClient } from '@/lib/supabaseServer'

const ISSUE_TYPES = [
  'audio_mic',
  'latency',
  'freeze',
  'weird_questions',
  'misjudge',
  'ui_unclear',
  'repeated_questions',
  'other',
] as const

type IssueType = (typeof ISSUE_TYPES)[number]

const isIntInRange = (v: any, min: number, max: number) =>
  Number.isInteger(v) && v >= min && v <= max

const normalizeRating = (v: any) => {
  const n = typeof v === 'string' ? Number(v) : v
  return isIntInRange(n, 1, 5) ? n : 3
}

const normalizeIssueTypes = (v: any): IssueType[] => {
  if (!Array.isArray(v)) return []
  const set = new Set<IssueType>()
  for (const x of v) {
    if (typeof x === 'string' && (ISSUE_TYPES as readonly string[]).includes(x)) {
      set.add(x as IssueType)
    }
  }
  return Array.from(set)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const interview_id = String((req.query.interview_id as string) || req.body?.interview_id || '')
  if (!interview_id) return res.status(400).json({ error: 'MISSING_INTERVIEW_ID' })

  const supa = getServiceClient()

  const { data: me, error: meErr } = await supa
    .from('profiles')
    .select('id, role, email')
    .eq('auth_id', authUserId)
    .single()
  if (meErr || !me) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })

  // 僅允許 jobseeker 提交自己的回饋
  if (me.role !== 'jobSeeker') return res.status(403).json({ error: 'FORBIDDEN' })

  const { data: interview, error: ivErr } = await supa
    .from('interviews')
    .select('id, company_id, profiles_id, candidate_email')
    .eq('id', interview_id)
    .single()
  if (ivErr || !interview) return res.status(404).json({ error: 'INTERVIEW_NOT_FOUND' })

  const myEmail = String(me.email || '').toLowerCase()
  const candidateEmail = String(interview.candidate_email || '').toLowerCase()
  const isOwner =
    interview.profiles_id === me.id ||
    (!!myEmail && !!candidateEmail && myEmail === candidateEmail)
  if (!isOwner) return res.status(403).json({ error: 'FORBIDDEN' })

  const { data: session, error: sessionErr } = await supa
    .from('interview_sessions')
    .select('id, company_id, interviews_id')
    .eq('interviews_id', interview_id)
    .maybeSingle()
  if (sessionErr) return res.status(400).json({ error: 'GET_SESSION_FAILED', details: sessionErr.message })
  if (!session) return res.status(404).json({ error: 'SESSION_NOT_FOUND' })

  // 讀取我自己已提交的 feedback（給 UI 顯示）
  if (req.method === 'GET') {
    const { data: fb, error: fbErr } = await supa
      .from('interview_session_feedback')
      .select('id, payload, created_at, updated_at')
      .eq('interview_session_id', session.id)
      .eq('kind', 'jobseeker')
      .eq('submitted_by_profile_id', me.id)
      .maybeSingle()
    if (fbErr) return res.status(400).json({ error: 'GET_FEEDBACK_FAILED', details: fbErr.message })
    return res.status(200).json({ feedback: fb || null })
  }

  if (req.method !== 'POST') return res.status(405).end()

  const body = req.body || {}
  const ratings = body.ratings || {}
  const issueTypes = normalizeIssueTypes(body.issue_types)
  const issueOtherText = typeof body.issue_other_text === 'string' ? body.issue_other_text.trim().slice(0, 500) : ''
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 2000) : ''

  const payload = {
    version: 1,
    ratings: {
      usability: normalizeRating(ratings.usability),
      speed: normalizeRating(ratings.speed),
      accuracy: normalizeRating(ratings.accuracy),
      satisfaction: normalizeRating(ratings.satisfaction),
    },
    issue_types: issueTypes,
    issue_other_text: issueTypes.includes('other') ? issueOtherText : '',
    comment,
    touched: (body.touched && typeof body.touched === 'object') ? body.touched : null,
  }

  const { data: saved, error: saveErr } = await supa
    .from('interview_session_feedback')
    .upsert(
      {
        company_id: session.company_id,
        interview_session_id: session.id,
        interviews_id: session.interviews_id,
        kind: 'jobseeker',
        submitted_by_profile_id: me.id,
        payload,
      },
      { onConflict: 'interview_session_id,kind,submitted_by_profile_id' }
    )
    .select('id, payload, created_at, updated_at')
    .single()

  if (saveErr) return res.status(400).json({ error: 'SAVE_FEEDBACK_FAILED', details: saveErr.message })
  return res.status(200).json({ ok: true, feedback: saved })
}


