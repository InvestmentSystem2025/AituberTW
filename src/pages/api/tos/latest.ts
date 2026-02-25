import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient } from '@/lib/supabaseServer'

type Resp = { version: string | null; body?: string } | { error: string }

export default async function handler(req: NextApiRequest, res: NextApiResponse<Resp>) {
  // 明確指定 JSON content-type（避免掃描工具在錯誤/非預期路徑誤判缺少 header）
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: `METHOD_NOT_ALLOWED:${req.method ?? 'UNKNOWN'}` })
  }

  try {
    const supa = getServiceClient()

    // 先取最新版版本號
    const { data: vrows, error: verr } = await supa.rpc('get_latest_tos_version')
    if (verr) return res.status(500).json({ error: 'LATEST_TOS_ERROR' })
    const v = Array.isArray(vrows) ? (vrows as any[])[0] : (vrows as any)
    const version = typeof v === 'string' ? v : v?.version || v || null
    if (!version) return res.status(200).json({ version: null })

    // 取本文
    const { data: rows, error } = await supa
      .from('terms_of_service')
      .select('body')
      .eq('version', version)
      .maybeSingle()
    if (error) return res.status(500).json({ error: 'FETCH_TOS_ERROR' })
    return res.status(200).json({ version, body: rows?.body ?? '' })
  } catch (e) {
    console.error('tos/latest 未預期錯誤:', e)
    return res.status(500).json({ error: 'UNEXPECTED_ERROR' })
  }
}


