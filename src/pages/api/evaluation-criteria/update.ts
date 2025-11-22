import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient, getAuthUserIdFromRequest } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') return res.status(405).end()
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })
  const { id, company_id, key, display_name, weight, max_score, scoring_logic, addition_rules, deduction_rules, sort_order } = req.body || {}
  
  if (!id || !company_id) return res.status(400).json({ error: 'MISSING_FIELDS' })

  if (weight !== undefined && (weight < 0 || weight > 1)) {
    return res.status(400).json({ error: 'INVALID_WEIGHT' })
  }

  const supa = getServiceClient()
  const { data: me } = await supa.from('profiles').select('id').eq('auth_id', authUserId).single()
  if (!me) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })
  const { data: scope } = await supa.from('company_members').select('profile_id').eq('company_id', company_id).eq('profile_id', me.id).maybeSingle()
  if (!scope) return res.status(403).json({ error: 'FORBIDDEN' })

  const payload: any = {}
  if (typeof key === 'string') payload.key = key
  if (typeof display_name === 'string') payload.display_name = display_name
  if (typeof weight === 'number') payload.weight = weight
  if (typeof max_score === 'number') payload.max_score = max_score
  if (typeof sort_order === 'number') payload.sort_order = sort_order
  if (scoring_logic === 'addition' || scoring_logic === 'deduction' || scoring_logic === 'composite') {
    payload.scoring_logic = scoring_logic
    // 根據計算邏輯設定對應的規則
    if (scoring_logic === 'addition') {
      // 加分制：只需要加分規則
      payload.addition_rules = addition_rules || []
      payload.deduction_rules = null
    } else if (scoring_logic === 'deduction') {
      // 扣分制：只需要扣分規則
      payload.deduction_rules = deduction_rules || []
      payload.addition_rules = null
    } else {
      // 綜合制：加分與扣分規則皆必填
      payload.addition_rules = addition_rules || []
      payload.deduction_rules = deduction_rules || []
    }
  }

  if (Object.keys(payload).length === 0) return res.status(400).json({ error: 'NO_FIELDS' })

  const { error } = await supa.from('evaluation_criteria').update(payload).eq('id', id).eq('company_id', company_id)
  if (error) return res.status(400).json({ error: 'UPDATE_FAILED' })
  return res.status(200).json({ ok: true })
}

