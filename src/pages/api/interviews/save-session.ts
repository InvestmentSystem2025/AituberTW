import type { NextApiRequest, NextApiResponse } from 'next'
import { createAuthContext } from '@/lib/authContext'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const ctx = createAuthContext(req)
  const authUserId = await ctx.getAuthUserId()
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })
  
  const { 
    interviews_id, 
    interview_transcript, 
    progress_state,
    ai_evaluations, 
    duration_seconds,
    tokens_input,
    tokens_output,
    video_path,
    is_cancelled_by_user,
    is_token_limit_exceeded,
    is_final,
  } = req.body || {}
  
  if (!interviews_id) return res.status(400).json({ error: 'MISSING_INTERVIEWS_ID' })

  const supa = ctx.supa
  let me: Awaited<ReturnType<typeof ctx.requireProfile>>
  try {
    me = await ctx.requireProfile()
  } catch {
    return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })
  }

  // 獲取interview信息並檢查權限
  const { data: interview } = await supa
    .from('interviews')
    .select('company_id, profiles_id, candidate_email, review_type')
    .eq('id', interviews_id)
    .single()

  if (!interview) return res.status(404).json({ error: 'INTERVIEW_NOT_FOUND' })

  // 檢查權限：jobSeeker只能保存自己的session
  if (me.role === 'jobSeeker') {
    if (interview.profiles_id !== me.id && me.email?.toLowerCase() !== interview.candidate_email?.toLowerCase()) {
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
  const isTokenLimitExceeded = !!is_token_limit_exceeded
  const isFinal = isCancelledByUser || isTokenLimitExceeded ? true : (is_final !== false)

  // 重要：save-session 不負責扣點；必須先呼叫 /api/interviews/start-session 建立 placeholder session。
  // 否則攻擊者可直接 upsert 繞過 quota。
  // 準備數據
  const sessionData: any = {
    company_id: interview.company_id,
    interviews_id,
    duration_seconds: duration_seconds || 0,
  }

  // 以「最後一次互動」作為可續接/超時計算依據
  // DB 端也會加 trigger 自動更新，但這裡顯式寫入可避免既有環境尚未套用 trigger 時 updated_at 不變。
  sessionData.updated_at = new Date().toISOString()

  // 根據面試設定決定 review_type，預設為 AI
  const baseReviewType = (interview as any).review_type as 'AI' | 'HUMAN' | 'MIXED' | null
  if (baseReviewType && ['AI', 'HUMAN', 'MIXED'].includes(baseReviewType)) {
    sessionData.review_type = baseReviewType
  } else {
    sessionData.review_type = 'AI'
  }

  if (interview_transcript) sessionData.interview_transcript = interview_transcript
  if (progress_state) sessionData.progress_state = progress_state
  if (ai_evaluations) sessionData.ai_evaluations = ai_evaluations

  // token usage：優先使用逐回合 transcript 的 token_usage 加總，避免前端累加誤差
  const transcriptTokenSum = (() => {
    if (!Array.isArray(interview_transcript)) return null
    let input = 0
    let output = 0
    let hasAny = false
    for (const row of interview_transcript) {
      const usage = (row as any)?.token_usage
      if (!usage || typeof usage !== 'object') continue
      const ti = Number((usage as any).tokens_input)
      const to = Number((usage as any).tokens_output)
      if (Number.isFinite(ti) && ti >= 0) {
        input += Math.floor(ti)
        hasAny = true
      }
      if (Number.isFinite(to) && to >= 0) {
        output += Math.floor(to)
        hasAny = true
      }
    }
    return hasAny ? { input, output } : null
  })()

  if (transcriptTokenSum) {
    sessionData.tokens_input = transcriptTokenSum.input
    sessionData.tokens_output = transcriptTokenSum.output
  } else {
    // fallback：沿用前端傳入的 session 累計
    const ti = typeof tokens_input === 'string' ? Number(tokens_input) : tokens_input
    const to = typeof tokens_output === 'string' ? Number(tokens_output) : tokens_output
    if (Number.isFinite(ti) && ti >= 0) sessionData.tokens_input = Math.floor(ti)
    if (Number.isFinite(to) && to >= 0) sessionData.tokens_output = Math.floor(to)
  }

  if (video_path) sessionData.video_path = video_path

  // 若使用者提早結束（或結算），在 session 上標記結果與理由
  if (isFinal && isCancelledByUser) {
    sessionData.interview_result = 'cancelByUser'
    sessionData.result_reason = 'cancelled_by_user'
  } else if (isFinal && isTokenLimitExceeded) {
    sessionData.interview_result = 'cancelByUser'
    sessionData.result_reason = 'token_limit_exceeded'
  }

  // 僅更新既有 session（避免繞過 start-session/quota）
  const { data: session, error } = await supa
    .from('interview_sessions')
    .update(sessionData)
    .eq('interviews_id', interviews_id)
    .select()
    .maybeSingle()

  if (error) {
    console.error('Save session error:', error)
    return res.status(400).json({ error: 'SAVE_SESSION_FAILED', details: error.message })
  }
  if (!session) {
    return res.status(403).json({ error: 'SESSION_NOT_STARTED' })
  }

  // 進度保存（非結算）：只回傳 session，不更新 interviews 狀態、不計分
  if (!isFinal) {
    return res.status(200).json({ ok: true, session })
  }

  // 結算：如果提供了ai_evaluations，且不是「使用者提早結束」，才調用評價函數計算總分
  if (!isCancelledByUser && !isTokenLimitExceeded && ai_evaluations && Array.isArray(ai_evaluations) && ai_evaluations.length > 0) {
    try {
      const { error: evalError } = await supa.rpc('evaluate_interview_total', {
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

  // 重要：evaluate_interview_total 會更新 interview_sessions.total_score / interview_result / result_reason
  // 所以結算後需要重新抓一次，避免 response 回傳的是「更新前」的 session 內容。
  const { data: freshSession, error: freshErr } = await supa
    .from('interview_sessions')
    .select('*')
    .eq('interviews_id', interviews_id)
    .maybeSingle()

  if (freshErr) {
    // 不致命：至少回傳已更新的 session（但可能缺少 total_score 等）
    console.error('Fetch fresh session error:', freshErr)
    return res.status(200).json({ ok: true, session })
  }

  return res.status(200).json({ ok: true, session: freshSession || session })
}
