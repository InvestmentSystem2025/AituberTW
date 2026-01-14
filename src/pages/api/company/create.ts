import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient, getAuthUserIdFromRequest } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const { company_name, company_phone_number, company_address, company_profile, ideal_candidate_profile } = req.body || {}
  if (!company_name) return res.status(400).json({ error: 'MISSING_COMPANY_NAME' })

  const supa = getServiceClient()
  // 找到當前使用者的 profiles.id
  const { data: me, error: meErr } = await supa.from('profiles').select('id, role').eq('auth_id', authUserId).single()
  if (meErr || !me) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })

  // 檢查 role，只有 recruiter 可以建立公司
  if (me.role !== 'recruiter') {
    return res.status(403).json({ error: 'ONLY_RECRUITER_CAN_CREATE_COMPANY' })
  }

  // 建立公司
  const { data: company, error: cErr } = await supa
    .from('company')
    .insert({ company_name, company_phone_number, company_address, company_profile, ideal_candidate_profile })
    .select('id')
    .single()
  if (cErr || !company) return res.status(400).json({ error: 'COMPANY_CREATE_FAILED' })

  // 初始化 company 的 AI 生成問題免費額度（company 維度、永久累計；idempotent）
  // 讓後台一建立公司就可看到對應 usage row，也避免第一次使用才補建造成「看起來是空的」。
  try {
    await supa
      .from('company_ai_usage')
      .upsert(
        {
          company_id: company.id,
          joq_used_count: 0,
          joq_free_quota: 5,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id' }
      )
  } catch {
    // 不阻擋公司建立；扣點時 RPC 也會補建
  }

  // 自動把本人加入 company_members 並設 admin
  const { error: mErr } = await supa
    .from('company_members')
    .insert({ company_id: company.id, profile_id: me.id, company_role: 'admin' })
  if (mErr) return res.status(400).json({ error: 'MEMBER_BIND_FAILED' })

  return res.status(200).json({ ok: true, company_id: company.id })
}


