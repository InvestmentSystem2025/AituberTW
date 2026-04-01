import type { ResumeReviewStandard } from '@/lib/resumeReview'

type AiCriteriaResult = {
  name: string
  label: 'MUST' | 'PLUS' | 'MINUS' | 'NG'
  matched: boolean
  score: number
  reasoning: string
}

type AiReviewOutput = {
  fit_score: number
  summary: string
  criteria_results: AiCriteriaResult[]
  special_attention: string[]
  non_job_experience: string[]
}

function clampScore(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, Number(v.toFixed(2))))
}

function hasFormalExperienceRequirement(name: string): boolean {
  return /(工程師經驗|實務經驗|職務經驗|工作經驗)/.test(String(name || ''))
}

function isReasoningAdmittingNoFormalItExperience(reasoning: string): boolean {
  const text = String(reasoning || '').toLowerCase()
  const patterns = [
    /缺乏.{0,12}正式.{0,8}(it|資訊|工程).{0,12}(職務|工作).{0,8}經驗/,
    /無.{0,8}正式.{0,8}(it|資訊|工程).{0,12}(職務|工作).{0,8}經驗/,
    /沒有.{0,8}正式.{0,8}(it|資訊|工程).{0,12}(職務|工作).{0,8}經驗/,
    /僅.{0,10}(自學|專案|作品|證照).{0,12}(非正式|非職務)/,
  ]
  return patterns.some((p) => p.test(text))
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
    let matched = !!ai.matched
    let score = clampScore(Number(ai.score))
    let reasoning = String(ai.reasoning || '').slice(0, 1000)

    // 守門規則：
    // 若是「必須」且屬於「正式經驗」要求，但 reasoning 自承缺乏正式 IT/工程職務經驗，
    // 直接強制改為不符合與 0 分，避免模型輸出自相矛盾（說缺乏正式經驗卻給通過）。
    if (s.label === 'MUST' && hasFormalExperienceRequirement(s.name) && isReasoningAdmittingNoFormalItExperience(reasoning)) {
      matched = false
      score = 0
      reasoning = `依規則改判：此項要求正式相關職務經驗；${reasoning}`
    }

    // MUST 不符合時，一律 0 分（避免出現 matched=false 但仍有分數的矛盾）。
    if (s.label === 'MUST' && !matched) {
      score = 0
    }

    return {
      name: s.name,
      label: s.label,
      matched,
      score,
      reasoning,
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
    non_job_experience: Array.isArray(raw?.non_job_experience)
      ? raw.non_job_experience
          .map((x: any) => String(x || '').trim())
          .filter(Boolean)
          .slice(0, 8)
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
    '  "special_attention": ["需要特別注意的事項（疾病、家族因素、就業限制等）"]',
    '  "non_job_experience": ["與職缺相關但非正式職務經歷（如專案、證書、社群貢獻）"]',
    '}',
    '',
    '規則：',
    '1) criteria_results 需要涵蓋所有標準名稱，不可漏掉。',
    '2) label=NG（禁止）若命中 matched=true 則審查不通過。',
    '3) label=MINUS（減分）若命中 matched=true 應明顯拉低 fit_score 與該項 score（表示不利因素），但不單獨構成審查不通過。',
    '4) fit_score 是整體適配度百分比。',
    '5) 若履歷提到疾病、家族照護/家庭重大因素，長期請假限制等、或是履歷中明顯有以上問題的跡象，必須寫入 special_attention（可多項）。若沒有就輸出空陣列。',
    '6) 關於「業務經驗年數」：若招聘方已明示自己的計分標準，優先遵守招聘方標準；若未明示，使用預設加分規則：1-3年=50分、3-5年=60分、5年以上=70分（少於1年可視為25分）。此規則應反映在相關 criteria 的 score 與 reasoning。',
    '7) 針對「正式職務經驗」條件（例如 Web 服務/AI 工程師經驗）：只計入正式受僱的相關工作經歷；自學、作品、課程、證照、個人專案不可視為正式職務經驗。',
    '8) 若某 MUST 條件是正式職務經驗要求，而候選人僅有非正式經歷，必須輸出 matched=false 且 score=0；reasoning 要明確寫出「僅有非正式經歷，無正式相關職務經驗」。',
    '9) 禁止自我矛盾：若 reasoning 提到「缺乏正式相關職務經驗」，則該 criteria 不可標記為 matched=true。',
    '10) 履歷中的相關專案、證書、自學作品、社群貢獻等「非正式職務經歷」請整理到 non_job_experience（可多項）。這些可做輔助評語，但不得直接等同正式職務年資。',
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
