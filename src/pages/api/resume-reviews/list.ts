import type { NextApiRequest, NextApiResponse } from 'next'
import { createAuthContext } from '@/lib/authContext'
import { getServiceClient } from '@/lib/supabaseServer'

function splitSummaryMeta(rawSummary: string): {
  summary: string
  special_attention: string[]
  non_job_experience: string[]
} {
  const source = String(rawSummary || '')
  const markerRegex = /【(特別注意|非職務上經歷)】/g
  const matches = Array.from(source.matchAll(markerRegex))
  if (matches.length === 0) {
    return { summary: source, special_attention: [], non_job_experience: [] }
  }

  const summary = source.slice(0, matches[0].index || 0).replace(/\s+\|\s*$/, '').trim()
  const special_attention: string[] = []
  const non_job_experience: string[] = []

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]
    const markerName = String(current[1] || '')
    const bodyStart = (current.index || 0) + current[0].length
    const bodyEnd = i + 1 < matches.length ? (matches[i + 1].index || source.length) : source.length
    const bodyText = source.slice(bodyStart, bodyEnd).trim().replace(/^\|\s*/, '')
    const items = bodyText
      .split(/[；;|\n]/)
      .map((x) => x.trim())
      .filter(Boolean)

    if (markerName === '特別注意') {
      special_attention.push(...items)
    } else if (markerName === '非職務上經歷') {
      non_job_experience.push(...items)
    }
  }

  return {
    summary,
    special_attention: special_attention.slice(0, 5),
    non_job_experience: non_job_experience.slice(0, 8),
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const ctx = createAuthContext(req)
  const me = await ctx.getProfile()
  if (!me?.id) return res.status(401).json({ error: 'UNAUTHORIZED', items: [] })

  const company_id = String(req.query.company_id || '')
  const job_opening_id = String(req.query.job_opening_id || '')
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '20'), 10) || 20, 1), 100)
  const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0)

  if (!company_id) return res.status(400).json({ items: [] })
  const isMember = await ctx.isCompanyMember(company_id)
  if (!isMember) return res.status(403).json({ error: 'FORBIDDEN', items: [] })

  let q = ctx.supa
    .from('resume_review_results')
    .select(
      'id, candidate_profile_id, candidate_email, job_opening_id, fit_score, criteria_results, summary, created_at, review_request_id, resume_review_requests(remarks), job_opening:job_opening_id(job_title)',
      { count: 'exact' },
    )
    .eq('company_id', company_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (job_opening_id) q = q.eq('job_opening_id', job_opening_id)

  const { data, error, count } = await q
  if (error) return res.status(200).json({ items: [], total: 0, limit, offset })

  const rawItems = data || []

  // RLS 限制導致一般 client 無法查其他人的 profiles（包含 candidate 姓名）
  // 這裡改用 service_role + 批次查詢，且只查本公司已授權可見的 candidate_profile_id。
  const candidateProfileIds = Array.from(
    new Set(
      (rawItems as any[])
        .map((r) => r?.candidate_profile_id)
        .filter((id) => typeof id === 'string' && id.length > 0),
    ),
  )

  const service = getServiceClient()
  const { data: profiles } = candidateProfileIds.length
    ? await service
        .from('profiles')
        .select('id, family_name, given_name')
        .in('id', candidateProfileIds)
    : { data: [] as any[] }

  const profileNameById = new Map<string, string>()
  ;(profiles || []).forEach((p: any) => {
    const family = p?.family_name || ''
    const given = p?.given_name || ''
    const name = `${family}${given}`.trim()
    if (p?.id && name) profileNameById.set(String(p.id), name)
  })

  const items = (rawItems as any[]).map((r) => {
    const candidateProfileId = r?.candidate_profile_id || null
    const candidateName = candidateProfileId ? profileNameById.get(String(candidateProfileId)) || null : null
    const reqRemarks = r?.resume_review_requests
    const remarks =
      typeof reqRemarks === 'object' && reqRemarks !== null && !Array.isArray(reqRemarks)
        ? String((reqRemarks as { remarks?: string }).remarks || '')
        : Array.isArray(reqRemarks) && reqRemarks[0]
          ? String((reqRemarks[0] as { remarks?: string }).remarks || '')
          : ''
    const parsedSummary = splitSummaryMeta(String(r.summary || ''))
    return {
      review_result_id: r.id,
      candidate_profile_id: candidateProfileId,
      candidate_email: r.candidate_email,
      candidate_name: candidateName,
      job_opening_id: r.job_opening_id,
      job_title: r.job_opening?.job_title || '',
      fit_score: r.fit_score,
      criteria_results: r.criteria_results,
      summary: parsedSummary.summary,
      special_attention: parsedSummary.special_attention,
      non_job_experience: parsedSummary.non_job_experience,
      remarks,
      created_at: r.created_at,
    }
  })

  return res.status(200).json({ items, total: count || 0, limit, offset })
}
