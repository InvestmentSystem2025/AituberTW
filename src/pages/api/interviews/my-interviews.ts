import type { NextApiRequest, NextApiResponse } from 'next'
import { getAuthUserIdFromRequest, getServiceClient } from '@/lib/supabaseServer'

type InterviewWithJob = {
  id: string
  job_opening_id: string
  job_title?: string
  company_id: string
  company_name?: string
  start_time: string
  end_time?: string | null
  status?: 'waitToStart' | 'inProgress' | 'expired' | 'completed' | 'lateButComplete' | 'noShow' | 'cancelled'
  claimed_at?: string | null
  invited_at?: string | null
}

const INPROGRESS_EXPIRE_SECONDS = 60 * 60

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const supa = getServiceClient()
  
  // 獲取使用者的 profile
  const { data: profile } = await supa
    .from('profiles')
    .select('id, role,email')
    .eq('auth_id', authUserId)
    .single()
  
  if (!profile) return res.status(200).json({ items: [] })

  // 獲取該使用者的所有面試（通過 profiles_id）
  const { data: interviews, error } = await supa
    .from('interviews')
    .select(`
      id,
      job_opening_id,
      company_id,
      start_time,
      end_time,
      status,
      claimed_at,
      invited_at,
      job_opening:job_opening_id (
        job_title
      ),
      company:company_id (
        company_name
      )
    `)
    .or(`profiles_id.eq.${profile.id},candidate_email.eq.${profile.email?.toLowerCase() || ''}`)
    .order('start_time', { ascending: false })

  if (error) {
    console.error('Error fetching interviews:', error)
    return res.status(200).json({ items: [] })
  }

  // inProgress 超時（最後一次互動後 3 分鐘未完成）=> expired
  // 注意：不要依賴 join 取 interview_sessions.updated_at（在某些 schema/relationship 設定下可能拿不到）
  // 改成額外查一次 sessions，避免 fallback 回 claimed_at 造成誤判。
  try {
    const now = Date.now()
    const candidates = (interviews || []).filter((iv: any) => iv?.status === 'inProgress' || iv?.status === 'expired')
    const candidateIds = candidates.map((iv: any) => String(iv.id))

    const sessionUpdatedAtByInterviewId = new Map<string, string>()
    if (candidateIds.length > 0) {
      const { data: sessions } = await supa
        .from('interview_sessions')
        .select('interviews_id, updated_at')
        .in('interviews_id', candidateIds)

      ;(sessions || []).forEach((s: any) => {
        if (!s?.interviews_id || !s?.updated_at) return
        sessionUpdatedAtByInterviewId.set(String(s.interviews_id), String(s.updated_at))
      })
    }

    const expiredIds: string[] = []
    const reviveIds: string[] = []

    candidates.forEach((iv: any) => {
      const interviewId = String(iv?.id || '')
      if (!interviewId) return

      const lastTouch = sessionUpdatedAtByInterviewId.get(interviewId) || iv?.claimed_at
      if (!lastTouch || typeof lastTouch !== 'string') return
      const ts = Date.parse(lastTouch)
      if (!Number.isFinite(ts)) return

      const elapsedSec = Math.floor((now - ts) / 1000)
      if (elapsedSec >= INPROGRESS_EXPIRE_SECONDS) {
        if (iv?.status === 'inProgress') expiredIds.push(interviewId)
      } else {
        // 修復：若先前被誤標 expired，但最後互動仍在時間窗內，復原成 inProgress
        if (iv?.status === 'expired') reviveIds.push(interviewId)
      }
    })

    if (expiredIds.length > 0) {
      await supa
        .from('interviews')
        .update({ status: 'expired' })
        .in('id', expiredIds)
        .eq('status', 'inProgress')

      // 同步更新回傳資料（避免前端還看到舊狀態）
      ;(interviews || []).forEach((iv: any) => {
        if (expiredIds.includes(String(iv?.id || ''))) iv.status = 'expired'
      })
    }

    if (reviveIds.length > 0) {
      await supa
        .from('interviews')
        .update({ status: 'inProgress' })
        .in('id', reviveIds)
        .eq('status', 'expired')

      ;(interviews || []).forEach((iv: any) => {
        if (reviveIds.includes(String(iv?.id || ''))) iv.status = 'inProgress'
      })
    }
  } catch (e) {
    console.warn('[my-interviews] expire inProgress failed:', e)
  }

  // 轉換數據格式
  const items: InterviewWithJob[] = (interviews || []).map((iv: any) => ({
    id: iv.id,
    job_opening_id: iv.job_opening_id,
    job_title: iv.job_opening?.job_title,
    company_id: iv.company_id,
    company_name: iv.company?.company_name,
    start_time: iv.start_time,
    end_time: iv.end_time,
    status: iv.status || 'waitToStart',
    claimed_at: iv.claimed_at,
    invited_at: iv.invited_at
  }))

  return res.status(200).json({ items })
}

