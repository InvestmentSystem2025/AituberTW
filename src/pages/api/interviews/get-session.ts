import type { NextApiRequest, NextApiResponse } from 'next'
import { createAuthContext } from '@/lib/authContext'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const ctx = createAuthContext(req)
  const authUserId = await ctx.getAuthUserId()
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })

  let me: Awaited<ReturnType<typeof ctx.requireProfile>>
  try {
    me = await ctx.requireProfile()
  } catch {
    return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })
  }

  const interview_id = String(req.query.interview_id || '')
  if (!interview_id) return res.status(400).json({ error: 'MISSING_INTERVIEW_ID' })

  const supa = ctx.supa

  // 讀取 interview 基本資料（後續需做完整授權檢查）
  const { data: interview } = await supa
    .from('interviews')
    .select('id, company_id, profiles_id, candidate_email')
    .eq('id', interview_id)
    .single()

  if (!interview) return res.status(404).json({ error: 'INTERVIEW_NOT_FOUND' })

  // 完整授權檢查：
  // - jobSeeker：只能讀自己的 interview（profiles_id 或 candidate_email 匹配）
  // - recruiter/viewer：必須是同公司成員
  if (me.role === 'jobSeeker') {
    const myEmail = String(me.email || '').toLowerCase()
    const interviewEmail = String(interview.candidate_email || '').toLowerCase()
    const byProfile = interview.profiles_id && interview.profiles_id === me.id
    const byEmail = !!interview.candidate_email && myEmail.length > 0 && myEmail === interviewEmail
    if (!byProfile && !byEmail) {
      return res.status(403).json({ error: 'FORBIDDEN' })
    }
  } else {
    const { data: scope } = await supa
      .from('company_members')
      .select('id')
      .eq('company_id', interview.company_id)
      .eq('profile_id', me.id)
      .maybeSingle()
    if (!scope) return res.status(403).json({ error: 'FORBIDDEN' })
  }

  // 取得最新的 session（或唯一一筆）
  const { data: session, error } = await supa
    .from('interview_sessions')
    .select('*')
    .eq('interviews_id', interview_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return res.status(400).json({ error: 'GET_SESSION_FAILED', details: error.message })

  return res.status(200).json({ session })
}


