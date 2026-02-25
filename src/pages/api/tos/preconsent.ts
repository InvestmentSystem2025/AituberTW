import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient } from '@/lib/supabaseServer'

type Resp = { nonce: string; terms_version: string; expires_at: string }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 明確指定 JSON content-type（避免掃描工具在錯誤/非預期路徑誤判缺少 header）
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: `METHOD_NOT_ALLOWED:${req.method ?? 'UNKNOWN'}` })
  }

  try {
    const ua =
      (req.body?.user_agent as string) || (req.headers['user-agent'] as string) || ''
    const xf = (req.headers['x-forwarded-for'] as string) || ''
    const ip =
      (req.body?.ip as string) ||
      xf.split(',')[0]?.trim() ||
      (req.socket as any)?.remoteAddress ||
      ''

    const supa = getServiceClient()
    // get latest version
    const { data: latestRows, error: latestErr } = await supa.rpc('get_latest_tos_version')
    if (latestErr || !latestRows) return res.status(500).json({ error: 'LATEST_TOS_ERROR' })
    const latest = Array.isArray(latestRows) ? latestRows[0] : latestRows
    const version = typeof latest === 'string' ? latest : latest?.version || latest
    if (!version) return res.status(500).json({ error: 'LATEST_TOS_EMPTY' })

    const { data, error } = await supa.rpc('create_tos_preconsent', {
      p_version: version,
      p_ip: ip,
      p_ua: ua,
    })
    if (error || !data) return res.status(400).json({ error: 'PRECONSENT_FAILED' })

    // fetch expires_at to return
    const { data: row } = await supa
      .from('tos_preconsents')
      .select('nonce, terms_version, expires_at')
      .eq('nonce', data as string)
      .single()

    if (!row) return res.status(500).json({ error: 'PRECONSENT_LOOKUP_FAILED' })
    const resp: Resp = {
      nonce: row.nonce,
      terms_version: row.terms_version,
      expires_at: row.expires_at,
    }
    return res.status(200).json(resp)
  } catch (e) {
    console.error('tos/preconsent 未預期錯誤:', e)
    return res.status(500).json({ error: 'UNEXPECTED_ERROR' })
  }
}


