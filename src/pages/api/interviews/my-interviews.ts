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
  status?: 'waitToStart' | 'completed' | 'lateButComplete' | 'noShow' | 'cancelled'
  claimed_at?: string | null
  invited_at?: string | null
}

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

