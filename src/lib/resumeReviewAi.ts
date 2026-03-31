import type { ResumeReviewStandard } from '@/lib/resumeReview'

type AiCriteriaResult = {
  name: string
  label: 'MUST' | 'PLUS' | 'NG'
  matched: boolean
  score: number
  reasoning: string
}

type AiReviewOutput = {
  fit_score: number
  summary: string
  criteria_results: AiCriteriaResult[]
  special_attention: string[]
}

function clampScore(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, Number(v.toFixed(2))))
}

function normalizeAiOutput(raw: any, standards: ResumeReviewStandard[]): AiReviewOutput {
  const byName = new Map<string, any>()
  const rawCriteria = Array.isArray(raw?.criteria_results) ? raw.criteria_results : []
  for (const item of rawCriteria) {
    const key = String(item?.name || '').trim()
    if (!key) continue
    byName.set(key, item)
  }

  const criteria_results: AiCriteriaResult[] = standards.map((s) => {
    const ai = byName.get(s.name) || {}
    return {
      name: s.name,
      label: s.label,
      matched: !!ai.matched,
      score: clampScore(Number(ai.score)),
      reasoning: String(ai.reasoning || '').slice(0, 1000),
    }
  })

  return {
    fit_score: clampScore(Number(raw?.fit_score)),
    summary: String(raw?.summary || '').slice(0, 2000),
    criteria_results,
    special_attention: Array.isArray(raw?.special_attention)
      ? raw.special_attention
          .map((x: any) => String(x || '').trim())
          .filter(Boolean)
          .slice(0, 5)
      : [],
  }
}

export async function runOpenAiResumeReview(args: {
  standards: ResumeReviewStandard[]
  resumeRawText: string
  resumeInfo: any
  model?: string
}): Promise<AiReviewOutput> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY_MISSING')

  const model = args.model || process.env.RESUME_REVIEW_OPENAI_MODEL || 'gpt-4.1-mini'
  const standardsText = args.standards
    .map((s, i) => `${i + 1}. name="${s.name}", label=${s.label}`)
    .join('\n')

  const resumeRawText = String(args.resumeRawText || '').slice(0, 20000)
  const resumeInfoText = JSON.stringify(args.resumeInfo || {}).slice(0, 12000)

  const systemPrompt = [
    '你是嚴謹的人才履歷審查官。',
    '請根據招聘方提供的審查標準，評估候選人履歷與職缺的匹配程度。',
    '你必須輸出 JSON，且只能輸出 JSON，不要加上 markdown。'
  ].join('\n')

  const userPrompt = [
    '【審查標準】',
    standardsText,
    '',
    '【履歷 OCR 原文】',
    resumeRawText,
    '',
    '【履歷結構化資訊】',
    resumeInfoText,
    '',
    '請輸出 JSON 格式：',
    '{',
    '  "fit_score": number(0-100),',
    '  "summary": "整體評語",',
    '  "criteria_results": [',
    '    {',
    '      "name": "標準名稱(需對應輸入標準)",',
    '      "matched": true/false,',
    '      "score": number(0-100),',
    '      "reasoning": "判斷理由（盡量引用履歷內容）"',
    '    }',
    '  ],',
    '  "special_attention": ["需要特別注意的事項（病氣、家族因素、就業限制等）"]',
    '}',
    '',
    '規則：',
    '1) criteria_results 需要涵蓋所有標準名稱，不可漏掉。',
    '2) label=NG 若命中應降低 fit_score。',
    '3) fit_score 是整體適配度百分比。',
    '4) 若履歷提到病氣、家族照護/家庭重大因素、長期請假限制等，必須寫入 special_attention（可多項）。若沒有就輸出空陣列。',
    '5) 關於「業務經驗年數」：若招聘方已明示自己的計分標準，優先遵守招聘方標準；若未明示，使用預設加分規則：1-3年=50分、3-5年=75分、5年以上=100分（少於1年可視為25分）。此規則應反映在相關 criteria 的 score 與 reasoning。',
  ].join('\n')

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  })

  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`OPENAI_REVIEW_FAILED:${resp.status}:${body}`)
  }

  const json = await resp.json()
  const content = String(json?.choices?.[0]?.message?.content || '').trim()
  if (!content) throw new Error('OPENAI_EMPTY_CONTENT')

  let parsed: any
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('OPENAI_INVALID_JSON')
  }

  return normalizeAiOutput(parsed, args.standards)
}
