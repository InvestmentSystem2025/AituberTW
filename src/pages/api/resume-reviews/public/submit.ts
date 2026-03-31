import type { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import fs from 'fs'
import { getAuthUserIdFromRequest, getServiceClient } from '@/lib/supabaseServer'
import { evaluateResumeAgainstStandards, hashInvitationToken, normalizeEmail } from '@/lib/resumeReview'
import { runOpenAiResumeReview } from '@/lib/resumeReviewAi'

export const config = {
  api: { bodyParser: false },
}

async function parseMultipart(req: NextApiRequest): Promise<{ fields: formidable.Fields; files: formidable.Files }> {
  const form = formidable({ maxFileSize: 20 * 1024 * 1024 })
  return form.parse(req).then(([fields, files]) => ({ fields, files }))
}

function resolveMcpServerCandidates(): string[] {
  const candidates = [
    process.env.MCP_SERVER_URL,
    process.env.NEXT_PUBLIC_MCP_SERVER_URL,
    process.env.MCP_INTERNAL_URL,
    'http://mcp-server:3001',
    'http://mcp-server-dev:3001',
    'http://localhost:3001',
  ]
  const dedup = new Set<string>()
  for (const c of candidates) {
    const v = String(c || '').trim().replace(/\/+$/, '')
    if (v) dedup.add(v)
  }
  return Array.from(dedup)
}

async function uploadAndExtractResume(filePath: string, originalName: string, mimeType: string): Promise<{ resumeInfo: any; rawText: string }> {
  const content = await fs.promises.readFile(filePath)

  const candidates = resolveMcpServerCandidates()
  if (candidates.length === 0) {
    throw new Error('MCP_SERVER_URL_NOT_CONFIGURED')
  }

  const errors: string[] = []
  for (const mcpServerUrl of candidates) {
    try {
      const formData = new FormData()
      formData.append('file', new Blob([content], { type: mimeType || 'application/octet-stream' }), originalName || 'resume.pdf')
      const uploadResp = await fetch(`${mcpServerUrl}/api/files/upload`, { method: 'POST', body: formData as any })
      if (!uploadResp.ok) {
        errors.push(`${mcpServerUrl}:UPLOAD_${uploadResp.status}`)
        continue
      }
      const uploadJson: any = await uploadResp.json()
      const fileName = uploadJson?.file?.filename
      if (!fileName) {
        errors.push(`${mcpServerUrl}:MCP_UPLOAD_FILE_MISSING`)
        continue
      }

      const extractResp = await fetch(`${mcpServerUrl}/api/mcp/tool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'extract_resume_info',
          arguments: { filePath: fileName },
        }),
      })
      if (!extractResp.ok) {
        errors.push(`${mcpServerUrl}:EXTRACT_${extractResp.status}`)
        continue
      }
      const extractJson: any = await extractResp.json()
      const result = extractJson?.result || extractJson
      return {
        resumeInfo: result?.resumeInfo || {},
        rawText: String(result?.rawText || ''),
      }
    } catch (err: any) {
      errors.push(`${mcpServerUrl}:${String(err?.message || 'UNKNOWN')}`)
    }
  }

  throw new Error(`MCP_EXTRACT_FAILED_ALL:${errors.join('|')}`)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'LOGIN_REQUIRED' })

  const supa = getServiceClient()
  const { data: me } = await supa
    .from('profiles')
    .select('id, email, role')
    .eq('auth_id', authUserId)
    .maybeSingle()
  if (!me?.id) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })
  if (me.role !== 'jobSeeker') return res.status(403).json({ error: 'CANDIDATE_NOT_JOBSEEKER' })

  const { fields, files } = await parseMultipart(req)
  const rawToken = String((fields.token as any)?.[0] || fields.token || '').trim()
  if (!rawToken) return res.status(400).json({ error: 'MISSING_TOKEN' })

  const tokenHash = hashInvitationToken(rawToken)
  const { data: requestRow } = await supa
    .from('resume_review_requests')
    .select('id, company_id, job_opening_id, candidate_email, status, token_expires_at')
    .eq('invitation_token', tokenHash)
    .maybeSingle()

  if (!requestRow?.id) return res.status(404).json({ error: 'INVALID_TOKEN' })
  if (new Date(requestRow.token_expires_at).getTime() <= Date.now()) {
    await supa.from('resume_review_requests').update({ status: 'expired' }).eq('id', requestRow.id)
    return res.status(400).json({ error: 'TOKEN_EXPIRED' })
  }
  if (!['invited', 'opened'].includes(String(requestRow.status))) {
    return res.status(400).json({ error: 'TOKEN_NOT_AVAILABLE' })
  }

  // 防止連結被轉傳後由其他 jobSeeker 代投：提交者 email 必須與邀請目標 email 一致
  const requestCandidateEmail = normalizeEmail(String(requestRow.candidate_email || ''))
  const meEmail = normalizeEmail(String(me.email || ''))
  if (!requestCandidateEmail || !meEmail || requestCandidateEmail !== meEmail) {
    return res.status(403).json({ error: 'FORBIDDEN_TOKEN_OWNER_MISMATCH' })
  }

  const file = (files.file as formidable.File[] | undefined)?.[0]
  if (!file) return res.status(400).json({ error: 'MISSING_RESUME_FILE' })

  const standardsRes = await supa
    .from('resume_review_standards')
    .select('name, label, sort_order')
    .eq('job_opening_id', requestRow.job_opening_id)
    .order('sort_order', { ascending: true })
  const standards = standardsRes.data || []
  if (standards.length === 0) return res.status(400).json({ error: 'MISSING_REVIEW_STANDARD' })

  try {
    const extracted = await uploadAndExtractResume(file.filepath, file.originalFilename || 'resume.pdf', file.mimetype || 'application/pdf')
    let evaluated: {
      criteriaResults: Array<{ name: string; label: 'MUST' | 'PLUS' | 'NG'; matched: boolean; score?: number; reasoning?: string }>
      fitScore: number
      summary: string
      specialAttention: string[]
    }

    try {
      const aiReviewed = await runOpenAiResumeReview({
        standards: standards as any,
        resumeRawText: extracted.rawText,
        resumeInfo: extracted.resumeInfo,
      })
      evaluated = {
        criteriaResults: aiReviewed.criteria_results,
        fitScore: aiReviewed.fit_score,
        summary: aiReviewed.summary,
        specialAttention: aiReviewed.special_attention,
      }
    } catch (aiErr) {
      // fallback: 若 OpenAI 暫時不可用，仍可回退到規則比對避免流程中斷
      console.error('[resume-reviews/public/submit] OpenAI review failed, fallback to heuristic:', aiErr)
      const fallback = evaluateResumeAgainstStandards(standards as any, extracted.resumeInfo, extracted.rawText)
      evaluated = {
        criteriaResults: fallback.criteriaResults.map((x) => ({
          ...x,
          score: x.matched ? 80 : 20,
          reasoning: 'OpenAI 評估暫時不可用，使用規則比對結果。',
        })),
        fitScore: fallback.fitScore,
        summary: fallback.summary,
        specialAttention: [],
      }
    }

    const mustNotMatched = evaluated.criteriaResults.filter((x) => x.label === 'MUST' && !x.matched)
    const ngMatched = evaluated.criteriaResults.filter((x) => x.label === 'NG' && x.matched)
    const isPassed = mustNotMatched.length === 0 && ngMatched.length === 0
    const failReasonParts: string[] = []
    if (mustNotMatched.length > 0) failReasonParts.push(`必須條件未滿足：${mustNotMatched.map((x) => x.name).join('、')}`)
    if (ngMatched.length > 0) failReasonParts.push(`命中 NG 條件：${ngMatched.map((x) => x.name).join('、')}`)
    const decisionText = isPassed ? '審查通過' : '審查不通過'
    const specialAttentionText = evaluated.specialAttention
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .slice(0, 5)
      .join('；')
    const mergedSummary = [
      decisionText,
      evaluated.summary,
      failReasonParts.join('；'),
      specialAttentionText ? `【特別注意】${specialAttentionText}` : '',
    ]
      .filter(Boolean)
      .join(' | ')

    const { error: resultErr } = await supa.from('resume_review_results').insert({
      review_request_id: requestRow.id,
      company_id: requestRow.company_id,
      job_opening_id: requestRow.job_opening_id,
      candidate_profile_id: me.id,
      candidate_email: String(me.email || '').toLowerCase(),
      criteria_results: evaluated.criteriaResults,
      fit_score: evaluated.fitScore,
      summary: mergedSummary,
    })
    if (resultErr) return res.status(400).json({ error: 'SUBMIT_FAILED' })

    await supa
      .from('resume_review_requests')
      .update({ status: 'submitted', token_expires_at: new Date().toISOString() })
      .eq('id', requestRow.id)

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[resume-reviews/public/submit] failed:', err)
    return res.status(500).json({
      error: 'RESUME_PROCESS_FAILED',
      message: String((err as any)?.message || 'UNKNOWN'),
    })
  }
}
