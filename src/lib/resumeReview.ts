import crypto from 'crypto'

export type ResumeReviewLabel = 'MUST' | 'PLUS' | 'MINUS' | 'NG'

/** 審查標準類型（後台／下拉選單顯示用） */
export const RESUME_REVIEW_LABEL_ZH: Record<ResumeReviewLabel, string> = {
  MUST: '必須',
  PLUS: '加分',
  MINUS: '減分',
  NG: '禁止(有符合就不通過)',
}

/** 下拉選單選項順序 */
export const RESUME_REVIEW_LABEL_ORDER: readonly ResumeReviewLabel[] = ['MUST', 'PLUS', 'MINUS', 'NG']

export type ResumeReviewStandard = {
  name: string
  label: ResumeReviewLabel
  sort_order: number
}

export function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase()
}

export function generateInvitationToken(): { rawToken: string; storedTokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString('hex')
  return {
    rawToken,
    storedTokenHash: hashInvitationToken(rawToken),
  }
}

export function hashInvitationToken(rawToken: string): string {
  return crypto.createHash('sha256').update(String(rawToken || '')).digest('hex')
}

function flattenResumeText(payload: any): string {
  if (!payload) return ''
  const chunks: string[] = []
  const walk = (node: any) => {
    if (node == null) return
    if (typeof node === 'string') {
      chunks.push(node)
      return
    }
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (typeof node === 'object') {
      Object.values(node).forEach(walk)
    }
  }
  walk(payload)
  return chunks.join('\n').toLowerCase()
}

export function evaluateResumeAgainstStandards(
  standards: ResumeReviewStandard[],
  resumeInfo: any,
  rawText: string
): {
  criteriaResults: Array<{ name: string; label: ResumeReviewLabel; matched: boolean }>
  fitScore: number
  summary: string
} {
  const searchable = `${String(rawText || '').toLowerCase()}\n${flattenResumeText(resumeInfo)}`
  const criteriaResults = standards.map((s) => ({
    name: s.name,
    label: s.label,
    matched: searchable.includes(String(s.name || '').trim().toLowerCase()),
  }))

  const mustItems = criteriaResults.filter((x) => x.label === 'MUST')
  const plusItems = criteriaResults.filter((x) => x.label === 'PLUS')
  const minusItems = criteriaResults.filter((x) => x.label === 'MINUS')
  const ngItems = criteriaResults.filter((x) => x.label === 'NG')

  const mustMatched = mustItems.filter((x) => x.matched).length
  const plusMatched = plusItems.filter((x) => x.matched).length
  const minusMatched = minusItems.filter((x) => x.matched).length
  const ngMatched = ngItems.filter((x) => x.matched).length

  const mustScore = mustItems.length > 0 ? (mustMatched / mustItems.length) * 70 : 70
  const plusScore = plusItems.length > 0 ? (plusMatched / plusItems.length) * 30 : 0
  const ngPenalty = ngMatched * 20
  const minusPenalty = minusMatched * 15
  const fitScore = Math.max(0, Math.min(100, Number((mustScore + plusScore - ngPenalty - minusPenalty).toFixed(2))))

  const summary = `MUST ${mustMatched}/${mustItems.length || 0}, PLUS ${plusMatched}/${plusItems.length || 0}, MINUS ${minusMatched}/${minusItems.length || 0}, NG ${ngMatched}/${ngItems.length || 0}`
  return { criteriaResults, fitScore, summary }
}
