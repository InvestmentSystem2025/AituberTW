import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient } from '@/lib/supabaseServer'
import { hashInvitationToken } from '@/lib/resumeReview'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const rawToken = String(req.query.token || '').trim()
  if (!rawToken) return res.status(400).json({ error: 'MISSING_TOKEN' })

  const tokenHash = hashInvitationToken(rawToken)
  const supa = getServiceClient()

  const { data: requestRow } = await supa
    .from('resume_review_requests')
    .select('id, company_id, job_opening_id, status, token_expires_at')
    .eq('invitation_token', tokenHash)
    .maybeSingle()

  if (!requestRow?.id) return res.status(404).json({ error: 'INVALID_TOKEN' })

  const isExpired = new Date(requestRow.token_expires_at).getTime() <= Date.now()
  if (isExpired) {
    await supa.from('resume_review_requests').update({ status: 'expired' }).eq('id', requestRow.id)
    return res.status(400).json({ error: 'TOKEN_EXPIRED' })
  }
  if (!['invited', 'opened'].includes(String(requestRow.status))) {
    return res.status(400).json({ error: 'TOKEN_NOT_AVAILABLE' })
  }

  const [jobRes, companyRes, standardsRes] = await Promise.all([
    supa.from('job_opening').select('id, job_title').eq('id', requestRow.job_opening_id).maybeSingle(),
    supa.from('company').select('id, company_name').eq('id', requestRow.company_id).maybeSingle(),
    supa
      .from('resume_review_standards')
      .select('name, label, sort_order')
      .eq('job_opening_id', requestRow.job_opening_id)
      .order('sort_order', { ascending: true }),
  ])

  if (requestRow.status === 'invited') {
    await supa.from('resume_review_requests').update({ status: 'opened' }).eq('id', requestRow.id)
  }

  return res.status(200).json({
    ok: true,
    company: {
      id: companyRes.data?.id || requestRow.company_id,
      company_name: companyRes.data?.company_name || '',
    },
    job_opening: {
      id: jobRes.data?.id || requestRow.job_opening_id,
      job_title: jobRes.data?.job_title || '',
    },
    standards: standardsRes.data || [],
  })
}
