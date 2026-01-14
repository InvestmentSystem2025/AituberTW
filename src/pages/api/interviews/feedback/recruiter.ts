import type { NextApiRequest, NextApiResponse } from 'next'
import { getAuthUserIdFromRequest, getServiceClient } from '@/lib/supabaseServer'

const isBiasValue = (v: any) => {
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isInteger(n) && n >= -2 && n <= 2
}

const normalizeBiasRecord = (v: any): Record<string, number> => {
  if (!v || typeof v !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [k, raw] of Object.entries(v)) {
    if (!k || typeof k !== 'string') continue
    if (!isBiasValue(raw)) continue
    out[k] = Number(raw)
  }
  return out
}

const normalizeExplainability = (v: any) => {
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 3
}

const normalizeOtherDetail = (v: any) => {
  if (typeof v !== 'string') return ''
  return v.trim().slice(0, 2000)
}

const REASON_FLAGS = [
  'insufficient_evidence',
  'logic_issue',
  'risk_missed',
  'followup_inappropriate',
  'other',
] as const
type ReasonFlag = (typeof REASON_FLAGS)[number]

const normalizeReasonFlags = (v: any): ReasonFlag[] => {
  if (!Array.isArray(v)) return []
  const set = new Set<ReasonFlag>()
  for (const x of v) {
    if (typeof x === 'string' && (REASON_FLAGS as readonly string[]).includes(x)) {
      set.add(x as ReasonFlag)
    }
  }
  return Array.from(set).slice(0, 20)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const interview_id = String((req.query.interview_id as string) || req.body?.interview_id || '')
  if (!interview_id) return res.status(400).json({ error: 'MISSING_INTERVIEW_ID' })

  const supa = getServiceClient()

  const { data: me, error: meErr } = await supa
    .from('profiles')
    .select('id, role')
    .eq('auth_id', authUserId)
    .single()
  if (meErr || !me) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })

  // 僅允許 recruiter 提交校正回饋（viewer 不可）
  if (me.role !== 'recruiter') return res.status(403).json({ error: 'FORBIDDEN' })

  const { data: interview, error: ivErr } = await supa
    .from('interviews')
    .select('id, company_id')
    .eq('id', interview_id)
    .single()
  if (ivErr || !interview) return res.status(404).json({ error: 'INTERVIEW_NOT_FOUND' })

  const { data: scope, error: scopeErr } = await supa
    .from('company_members')
    .select('profile_id')
    .eq('company_id', interview.company_id)
    .eq('profile_id', me.id)
    .maybeSingle()
  if (scopeErr) return res.status(400).json({ error: 'SCOPE_CHECK_FAILED', details: scopeErr.message })
  if (!scope) return res.status(403).json({ error: 'FORBIDDEN' })

  const { data: session, error: sessionErr } = await supa
    .from('interview_sessions')
    .select('id, company_id, interviews_id, already_feedback')
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
      .eq('kind', 'recruiter')
      .eq('submitted_by_profile_id', me.id)
      .maybeSingle()
    if (fbErr) return res.status(400).json({ error: 'GET_FEEDBACK_FAILED', details: fbErr.message })
    return res.status(200).json({ feedback: fb || null, already_feedback: !!(session as any).already_feedback })
  }

  if (req.method !== 'POST') return res.status(405).end()

  const body = req.body || {}

  const criteriaBias = normalizeBiasRecord(body.criteria_bias)
  const overallDecisionBias = isBiasValue(body.overall_decision_bias) ? Number(body.overall_decision_bias) : 0
  const explainability = normalizeExplainability(body.explainability)
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 2000) : ''
  const reasonFlags = normalizeReasonFlags(body.reason_flags)
  const otherDetailRaw = normalizeOtherDetail(body.other_detail)
  const otherDetail = reasonFlags.includes('other') ? otherDetailRaw : ''

  const payload = {
    version: 2,
    criteria_bias: criteriaBias,
    overall_decision_bias: overallDecisionBias,
    explainability,
    reason_flags: reasonFlags,
    other_detail: otherDetail,
    comment,
  }

  const { data: saved, error: saveErr } = await supa
    .from('interview_session_feedback')
    .upsert(
      {
        company_id: session.company_id,
        interview_session_id: session.id,
        interviews_id: session.interviews_id,
        kind: 'recruiter',
        submitted_by_profile_id: me.id,
        payload,
      },
      { onConflict: 'interview_session_id,kind,submitted_by_profile_id' }
    )
    .select('id, payload, created_at, updated_at')
    .single()

  if (saveErr) return res.status(400).json({ error: 'SAVE_FEEDBACK_FAILED', details: saveErr.message })
  // 記錄此場面試已提交過 recruiter feedback（用於 UI 避免再次提醒）
  try {
    await supa.from('interview_sessions').update({ already_feedback: true }).eq('id', session.id)
  } catch {
    // ignore（不影響主要回饋提交）
  }
  return res.status(200).json({ ok: true, feedback: saved })
}


