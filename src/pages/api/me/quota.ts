import type { NextApiRequest, NextApiResponse } from 'next'
import { getAuthUserIdFromRequest, getServiceClient } from '@/lib/supabaseServer'

type Resp =
  | { ok: true; remaining: number; used_count: number; free_quota: number }
  | { ok: false; error: string }

export default async function handler(req: NextApiRequest, res: NextApiResponse<Resp>) {
  if (req.method !== 'GET') return res.status(405).end()

  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' })

  const supa = getServiceClient()
  const { data: profile } = await supa
    .from('profiles')
    .select('id, role')
    .eq('auth_id', authUserId)
    .maybeSingle()

  if (!profile?.id) return res.status(400).json({ ok: false, error: 'PROFILE_NOT_FOUND' })

  // 目前需求只針對 jobSeeker 顯示免費次數；其他角色回 0/0
  if (profile.role !== 'jobSeeker') {
    return res.status(200).json({ ok: true, remaining: 0, used_count: 0, free_quota: 0 })
  }

  const { data: usage } = await supa
    .from('job_seeker_usage')
    .select('used_count, free_quota')
    .eq('profile_id', profile.id)
    .maybeSingle()

  const used = usage?.used_count ?? 0
  const free = usage?.free_quota ?? 3
  const remaining = Math.max(0, free - used)

  return res.status(200).json({ ok: true, remaining, used_count: used, free_quota: free })
}


