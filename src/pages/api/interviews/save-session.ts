import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient, getAuthUserIdFromRequest } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })
  
  const { 
    interviews_id, 
    interview_transcript, 
    ai_evaluations, 
    duration_seconds,
    tokens_input,
    tokens_output,
    video_path,
    is_cancelled_by_user,
  } = req.body || {}
  
  if (!interviews_id) return res.status(400).json({ error: 'MISSING_INTERVIEWS_ID' })

  const supa = getServiceClient()
  const { data: me } = await supa.from('profiles').select('id').eq('auth_id', authUserId).single()
  if (!me) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })

  // 獲取interview信息並檢查權限
  const { data: interview } = await supa
    .from('interviews')
    .select('company_id, profiles_id, candidate_email, review_type')
    .eq('id', interviews_id)
    .single()

  if (!interview) return res.status(404).json({ error: 'INTERVIEW_NOT_FOUND' })

  // 檢查權限：jobSeeker只能保存自己的session
  const { data: profile } = await supa.from('profiles').select('role, email').eq('auth_id', authUserId).single()
  if (profile?.role === 'jobSeeker') {
    if (interview.profiles_id !== me.id && profile.email?.toLowerCase() !== interview.candidate_email?.toLowerCase()) {
      return res.status(403).json({ error: 'FORBIDDEN' })
    }
  } else {
    // recruiter需要檢查是否為同公司成員
    const { data: scope } = await supa
      .from('company_members')
      .select('profile_id')
      .eq('company_id', interview.company_id)
      .eq('profile_id', me.id)
      .maybeSingle()
    if (!scope) return res.status(403).json({ error: 'FORBIDDEN' })
  }

  const isCancelledByUser = !!is_cancelled_by_user

  // 重要：save-session 不負責扣點；必須先呼叫 /api/interviews/start-session 建立 placeholder session。
  // 否則攻擊者可直接 upsert 繞過 quota。
  const { data: existingSession } = await supa
    .from('interview_sessions')
    .select('id')
    .eq('interviews_id', interviews_id)
    .maybeSingle()
  if (!existingSession) {
    return res.status(403).json({ error: 'SESSION_NOT_STARTED' })
  }

  // 準備數據
  const sessionData: any = {
    company_id: interview.company_id,
    interviews_id,
    duration_seconds: duration_seconds || 0,
  }

  // 根據面試設定決定 review_type，預設為 AI
  const baseReviewType = (interview as any).review_type as 'AI' | 'HUMAN' | 'MIXED' | null
  if (baseReviewType && ['AI', 'HUMAN', 'MIXED'].includes(baseReviewType)) {
    sessionData.review_type = baseReviewType
  } else {
    sessionData.review_type = 'AI'
  }

  if (interview_transcript) sessionData.interview_transcript = interview_transcript
  if (ai_evaluations) sessionData.ai_evaluations = ai_evaluations

  // token usage（可選；若前端/串流解析拿不到就不傳）
  const ti = typeof tokens_input === 'string' ? Number(tokens_input) : tokens_input
  const to = typeof tokens_output === 'string' ? Number(tokens_output) : tokens_output
  if (Number.isFinite(ti) && ti >= 0) sessionData.tokens_input = Math.floor(ti)
  if (Number.isFinite(to) && to >= 0) sessionData.tokens_output = Math.floor(to)

  if (video_path) sessionData.video_path = video_path

  // 若使用者提早結束，直接在 session 上標記結果與理由
  if (isCancelledByUser) {
    sessionData.interview_result = 'cancelByUser'
    sessionData.result_reason = 'cancelled_by_user'
  }

  // 僅更新既有 session（避免繞過 start-session/quota）
  const { data: session, error } = await supa
    .from('interview_sessions')
    .update(sessionData)
    .eq('interviews_id', interviews_id)
    .select()
    .single()

  if (error) {
    console.error('Save session error:', error)
    return res.status(400).json({ error: 'SAVE_SESSION_FAILED', details: error.message })
  }

  // 如果提供了ai_evaluations，且不是「使用者提早結束」，才調用評價函數計算總分
  if (!isCancelledByUser && ai_evaluations && Array.isArray(ai_evaluations) && ai_evaluations.length > 0) {
    try {
      const { data: evalResult, error: evalError } = await supa.rpc('evaluate_interview_total', {
        p_interviews_id: interviews_id
      })
      
      if (evalError) {
        console.error('Evaluate interview error:', evalError)
        // 不返回錯誤，只記錄日誌
      }
    } catch (err) {
      console.error('Evaluate interview exception:', err)
    }
  }

  // 更新interview狀態：正常完成 => completed；提早結束 => cancelled
  await supa
    .from('interviews')
    .update({ status: isCancelledByUser ? 'cancelled' : 'completed' })
    .eq('id', interviews_id)

  return res.status(200).json({ ok: true, session })
}

