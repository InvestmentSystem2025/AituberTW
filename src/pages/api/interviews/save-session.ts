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
    video_path 
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
  if (video_path) sessionData.video_path = video_path

  // 插入或更新session（使用upsert因為interviews_id是UNIQUE）
  const { data: session, error } = await supa
    .from('interview_sessions')
    .upsert(sessionData, { onConflict: 'interviews_id' })
    .select()
    .single()

  if (error) {
    console.error('Save session error:', error)
    return res.status(400).json({ error: 'SAVE_SESSION_FAILED', details: error.message })
  }

  // 如果提供了ai_evaluations，調用評價函數計算總分
  if (ai_evaluations && Array.isArray(ai_evaluations) && ai_evaluations.length > 0) {
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

  // 更新interview狀態為completed
  await supa
    .from('interviews')
    .update({ status: 'completed' })
    .eq('id', interviews_id)

  return res.status(200).json({ ok: true, session })
}

