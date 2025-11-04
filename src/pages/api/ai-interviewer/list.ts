import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient, getAuthUserIdFromRequest } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const company_id = String(req.query.company_id || '')
  if (!company_id) return res.status(400).json({ error: 'MISSING_COMPANY_ID' })

  const supa = getServiceClient()

  // 取得本人 profile
  const { data: me, error: meErr } = await supa.from('profiles').select('id').eq('auth_id', authUserId).single()
  if (meErr || !me) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })

  // 權限檢查：必須為該公司成員
  const { data: scope } = await supa
    .from('company_members')
    .select('company_role')
    .eq('company_id', company_id)
    .eq('profile_id', me.id)
    .maybeSingle()
  if (!scope) return res.status(403).json({ error: 'FORBIDDEN' })

  // 列出 AI 面試官
  const { data, error } = await supa
    .from('ai_interviewer')
    .select('id, name, model_name, model_config')
    .eq('company_id', company_id)

  if (error) return res.status(200).json({ items: [] })
  return res.status(200).json({ items: data || [] })
}

