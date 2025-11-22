import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient, getAuthUserIdFromRequest } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })
  const { company_id, job_opening_id, key, display_name, weight, max_score, scoring_logic, addition_rules, deduction_rules, sort_order } = req.body || {}
  
  if (!company_id || !job_opening_id || !key || !display_name) {
    return res.status(400).json({ error: 'MISSING_FIELDS' })
  }

  if (weight !== undefined && (weight < 0 || weight > 1)) {
    return res.status(400).json({ error: 'INVALID_WEIGHT' })
  }

  const supa = getServiceClient()
  const { data: me } = await supa.from('profiles').select('id').eq('auth_id', authUserId).single()
  if (!me) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })
  const { data: scope } = await supa.from('company_members').select('profile_id').eq('company_id', company_id).eq('profile_id', me.id).maybeSingle()
  if (!scope) return res.status(403).json({ error: 'FORBIDDEN' })

  // 獲取下一個 sort_order
  const { data: existing } = await supa
    .from('evaluation_criteria')
    .select('sort_order')
    .eq('job_opening_id', job_opening_id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const next_sort_order = existing ? existing.sort_order + 1 : 1

  const logic = scoring_logic || 'deduction'
  const payload: any = {
    company_id,
    job_opening_id,
    key,
    display_name,
    weight: weight || 0.2,
    max_score: max_score || 10,
    scoring_logic: logic,
    sort_order: sort_order || next_sort_order
  }

  // 根據計算邏輯設定對應的規則
  if (logic === 'addition') {
    // 加分制：只需要加分規則
    payload.addition_rules = addition_rules || []
    payload.deduction_rules = null
  } else if (logic === 'deduction') {
    // 扣分制：只需要扣分規則
    payload.deduction_rules = deduction_rules || []
    payload.addition_rules = null
  } else if (logic === 'composite') {
    // 綜合制：加分與扣分規則皆必填
    payload.addition_rules = addition_rules || []
    payload.deduction_rules = deduction_rules || []
  }

  const { error } = await supa.from('evaluation_criteria').insert(payload)

  if (error) return res.status(400).json({ error: 'CREATE_FAILED' })
  return res.status(200).json({ ok: true })
}

