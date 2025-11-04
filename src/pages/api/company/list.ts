import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient, getAuthUserIdFromRequest } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const supa = getServiceClient()
  // 取得本人 profile 與可見公司
  const { data: me, error: meErr } = await supa.from('profiles').select('id').eq('auth_id', authUserId).single()
  if (meErr || !me) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })

  // 兩段式安全查詢，確保 .in 的參數永遠是陣列，且空集合回傳空清單
  const { data: cms, error: cmErr } = await supa.from('company_members').select('company_id').eq('profile_id', me.id)
  if (cmErr) return res.status(400).json({ items: [] })
  const idsRaw = Array.isArray(cms) ? cms.map((x: any) => x?.company_id).filter(Boolean) : []
  const ids = Array.from(new Set(idsRaw))
  if (ids.length === 0) return res.status(200).json({ items: [] })
  const { data: companies, error: cErr } = await supa
    .from('company')
    .select('id, company_name, company_phone_number, company_address, company_profile, ideal_candidate_profile, created_at')
    .in('id', ids)
  if (cErr) return res.status(200).json({ items: [] })
  return res.status(200).json({ items: companies || [] })
}


