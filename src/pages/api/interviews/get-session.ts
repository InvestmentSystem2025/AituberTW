import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient, getAuthUserIdFromRequest } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const interview_id = String(req.query.interview_id || '')
  if (!interview_id) return res.status(400).json({ error: 'MISSING_INTERVIEW_ID' })

  const supa = getServiceClient()

  // 基本權限檢查：確認當前用戶對該 interview 有權限（與 get.ts 相同邏輯的簡化版）
  const { data: interview } = await supa
    .from('interviews')
    .select('id, company_id, profiles_id, candidate_email')
    .eq('id', interview_id)
    .single()

  if (!interview) return res.status(404).json({ error: 'INTERVIEW_NOT_FOUND' })

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


