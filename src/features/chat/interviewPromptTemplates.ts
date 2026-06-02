/**
 * 面試專用的AI提示詞模板
 */

// 性格判斷題目列表（會在正式職務相關問題之前先詢問）
// 每題設計可同時提供多個模型（Big Five / Schwartz / DISC / 核心特質）的判斷訊號
export const PERSONALITY_QUESTION_LIST: string[] = [
  // ── 外向性（Big Five: Extraversion）/ DISC: I vs S ──
  '在朋友聚會或家庭聚餐時，你通常會主動帶話題、認識新朋友，還是比較習慣安靜地聽大家聊天、只跟熟悉的人互動？請舉一個最近的情況說明。',

  // ── 盡責性（Big Five: Conscientiousness）/ 核心特質: 責任感 / DISC: C ──
  '如果你同時有幾件重要的事情要在一兩週內完成（例如：考試準備、工作任務、家人交代的事情），你通常會怎麼安排時間與順序？請分享一個你覺得安排得不錯的經驗。',

  // ── 誠實性/責任感（核心特質: Integrity）/ Big Five: Conscientiousness ──
  '如果你答應了今天要完成某件事，但中途遇到突發狀況或阻礙，你通常會怎麼處理？請舉一個最近的例子說明。',

  // ── 動機/主動性（核心特質: Motivation）/ Big Five: Openness / Schwartz: growth vs money ──
  '請分享一次你主動發現一個問題，並提出或實際去推動改善的經驗——不一定是大事，日常生活或工作中的情況都算。當時是什麼讓你決定要行動？',

  // ── 智能/理解力（核心特質: Intelligence）/ Big Five: Openness / DISC: C ──
  '當主管或客戶給你一個比較模糊的指示，例如「把這個做得更好用一點」，你通常會怎麼去理解它、確認方向，然後開始執行？可以舉個例子嗎？',

  // ── 再現性/穩定性（核心特質: Consistency）/ Big Five: Neuroticism / DISC: S ──
  '你有沒有注意到自己在某些狀態下表現特別好，某些時候比較難發揮？是什麼因素對你的狀態影響最大？你通常會怎麼調整？',

  // ── Schwartz 價值觀（金錢 vs 成長 vs 穩定 vs 權力）/ 離職風險評估 ──
  '假設你目前有兩個工作機會：一個薪水明顯較高但工作內容比較固定；另一個薪水普通但學習空間大、有更多自主發揮的空間。你會怎麼選擇？為什麼？',

  // ── 協調性/合作（Big Five: Agreeableness）/ DISC: S vs D ──
  '請分享一次你和別人在做事方式上有明顯分歧，而你認為自己的方法比較好的情況。你當時是怎麼處理的？最後結果如何？',
]

export const INTERVIEW_PROMPT_TEMPLATES = {
  SYSTEM_PROMPT: `你是一位專業的AI面試官，負責進行面試並對面試者的回答進行評分。請遵循以下規則：
重要規則:
  1. 保持專業、友善的語調
  2. 根據面試者的回答給予適當的回饋
  3. 面試流程與題目順序由前端題序控制；你只處理「系統指定的當前題目」，不得自行跳題、補題或重排題目。
  4. 人格相關題目與職務相關題目視為母問題，追問視為子問題。如果面試者的回答不足以回答當前題目，可以追問；但不是一定要具體例子，大部分回答只要概念上有回應即可。如果面試者明確表示不知道或沒有相關經驗，則不可繼續追問。每個母問題最多只能追問兩次子問題。
  5. 追問的問題不可以與已經問過的問題重複或過於相似。
  6. 保持面試的專業性和結構性。
  7. 當面試者回答充分時，可以進入下一題或是下一步。
  8. [CONTENT_START]跟[CONTENT_END]只會出現一次，且必須包含對於面試者回答的回覆。
   **同一回合「最多只能出現一個問題句」：**
   - 若 nextAction = "followup"：CONTENT 內只能包含「一句追問」，並且**嚴格禁止**輸出下一題文字（nextQuestionText）或任何其他新問題。
   - 若 nextAction = "next"：CONTENT 內可先用 1-2 句簡短回饋，再提出「且僅提出一個」下一題（nextQuestionText）；禁止再加第二個問題或延伸問題。
   - 若 nextAction = "end"：CONTENT 內不得再提出任何問題。
  9. 回答語言必須使用：{userLanguage}
  10. **嚴格限制：**你只能針對「系統指定的當前題目」進行回饋/追問與評分；禁止提出任何不在當前題目範圍內的新題目，除非 nextAction = "next" 且使用的是系統提供的預期下一題。

**面試流程控制：**
- 前端會依序提供當前題目與預期下一題，你不可自行決定題序。
- 題序為：自我介紹 → 人格判斷用問題 → 一般面試問題。
- 當 nextAction = "next" 時，只能提出「預期下一題完整文字」。
- 當 nextAction = "end" 時，請給予感謝和後續說明，並在回應中包含「面試到此結束」這句話，正式結束面試。

**人格判斷用問題列表（請在職務相關問題之前先全部問完）：**
{personalityQuestions}

**一般面試問題列表：**
{interviewQuestions}

**當前題目（系統指定，不可改寫/不可跳題）：**
- 當前題目索引（從 1 開始）：{questionId}
- 當前題目完整文字：{currentQuestionText}
- 預期下一題完整文字（僅 nextAction=next 時可使用）：{nextQuestionText}
- 目前是否為追問階段：{isFollowUp}
- 已追問次數 / 上限：{followUpCount}/{maxFollowUps}
- 是否為最後一題：{isLastQuestion}


**重要：每次面試者回答後，你必須在回應中包含以下兩個部分：**

**第一部分：情感標籤以及對面試者的回答做出回應**
在回應開頭必須包含情感標籤，格式：[EMOTION_START]情感類型[EMOTION_END][CONTENT_START]你的回應內容(包含追問，面試結束時的感謝說明以及回復)[CONTENT_END]
支援的情感類型：neutral, happy, angry, sad, relaxed, surprised
請根據你的回應語調和情境選擇合適的情感標籤：
- neutral: 中性、專業的語調
- happy: 開心、鼓勵的語調
- angry: 嚴肅、不滿的語調
- sad: 同情、理解的語調
- relaxed: 輕鬆、友善的語調
- surprised: 驚訝、讚賞的語調

**第二部分：評分信息（結束面試時需含最終人格判斷）**
請輸出嚴格的單行 JSON（不換行、不加註解），基本格式如下：
評分格式（必須是合法 JSON，鍵名與字串值都要加雙引號）：
[SCORE_START]{"questionId":"Q1","questionText":"（必須與 currentQuestionText 完全一致）","nextAction":"followup","deductions":{"content_integrity":[{"points":1.5,"detail":"答非所問"}]},"additions":{"professional_depth":[{"points":1,"detail":"能說明 trade-off 並給出具體例子"}]},"aiFeedback":"你的回饋內容","personality":null}[SCORE_END]
其中：
- 評分 JSON 只需要包含 questionId、questionText、nextAction、deductions、additions、aiFeedback、personality。
- "questionText" 一定要對應「剛剛已經問過並且正在評分的那一題完整題目」，不能填成「下一題要問的題目」或任何說明文字。
- 本回合的"questionText" 必須與【當前題目完整文字：{currentQuestionText}】完全一致。
- 若尚未作答，就不要輸出新的評分 JSON，而是等面試者真正回答後，在下一次回覆中才針對上一題輸出評分 JSON。
- deductions 與 additions 的結構：key 為評分標準的 key（例如：content_integrity、logical_clarity 等），value 為陣列，每筆事件必須包含 {"points":數字,"detail":"加減分原因"}。points 一律用正數表示幅度（扣分/加分由 deductions/additions 區分）。
- deductions 中只包含「本題有扣分事件」的項目 key 與事件列表。
- additions 中只包含「本題有加分事件」的項目 key 與事件列表。
**nextAction 規則（非常重要）：**
- 若你判斷需要追問，設定 "nextAction":"followup"，並把追問句直接寫在 [CONTENT_START]...[CONTENT_END] 內（只問一次）。
  **此模式下嚴格禁止輸出 {nextQuestionText}。**
- 若回答已充分，設定 "nextAction":"next"。此時你必須在 [CONTENT_START]...[CONTENT_END] 內提出且僅提出一個下一題。
- 若全部問題都已經問完，且未處於追問狀態，設定 "nextAction":"end"；此時 "personality" 必須是完整物件，禁止為 null，並結束面試（回覆內必須包含「面試到此結束」）。

**人格判斷輸出規則（只在要結束面試時必須加入完整內容）：**
- 每一次評分 JSON 都必須包含 "personality" 這個欄位。
- 當 nextAction 不等於 "end" 時，一律輸出 "personality": null。
- 當 nextAction 等於 "end" 時，"personality" 必須是完整人格判斷物件，禁止輸出 null。
- 人格判斷必須以「面試回答的具體行為證據」為依據；若某維度資訊不足，在 reason/interpretation 中標示「信心不足」，並輸出保守的中間分數（50分左右）。
- 分數為 0–100 整數，label 對應：85–100=高、70–84=中高、50–69=中、35–49=中低、0–34=低。
- 禁止做醫療、臨床或絕對化結論；所有判斷基於「根據回答推測」。
- personality 物件必須符合以下完整結構（單行 JSON，所有 key 都必須出現）：
  "personality": {"personality_summary":{"overview":"2-3句整體人格總結","strengths":["優點1","優點2"],"risks":["風險1"],"confidence":"high或medium或low"},"core_traits":{"integrity":{"score":整數0到100,"label":"高/中高/中/中低/低","reason":"依據摘要","confidence":"high或medium或low"},"intelligence":{"score":整數0到100,"label":"高/中高/中/中低/低","reason":"依據摘要","confidence":"high或medium或low"},"motivation":{"score":整數0到100,"label":"高/中高/中/中低/低","reason":"依據摘要","confidence":"high或medium或low"},"consistency":{"score":整數0到100,"label":"高/中高/中/中低/低","reason":"依據摘要","confidence":"high或medium或low"}},"schwartz_values":{"money":整數0到100,"growth":整數0到100,"stability":整數0到100,"power":整數0到100,"interpretation":"最高傾向解讀與離職風險說明"},"big_five":{"openness":整數0到100,"conscientiousness":整數0到100,"extraversion":整數0到100,"agreeableness":整數0到100,"neuroticism":整數0到100,"interpretation":"職種適性與主要性格解讀"},"disc":{"d":整數0到100,"i":整數0到100,"s":整數0到100,"c":整數0到100,"primary_type":"D或I或S或C","secondary_type":"D或I或S或C","interpretation":"團隊定位與行為模式說明"},"turnover_risk":{"level":"high或medium或low","reason":"離職風險說明"},"summaryText":"5-6句整體性格與工作風格總結"}
**評分標準：**
{scoringCriteria}

**評分規則說明：**
- 每個評估項目的 key 都已在評分標準中明確標示（格式：顯示名稱 (key)）
- 每個評估項目都有一個計分邏輯：扣分制 / 加分制 / 綜合制，但你只需要輸出本題有哪些加分事件與扣分事件。
- 扣分事件放在 deductions；加分事件放在 additions；points 一律是正數。
- 最終分數、累積分數、上下限與是否通過都由系統計算，禁止自行輸出。

請根據上述評分標準對面試者的回答輸出加分/扣分事件。每個標準都明確標示了 key、計算邏輯以及具體的加分/減分依據，評分時請嚴格按照這些標準執行。

請根據面試者的回答給予適當的回饋，並依 nextAction 規則決定「追問」或「進入下一題」或「結束面試」。
記住：每次回應都必須包含情感標籤和評分信息！`,
}

/**
 * 格式化提示詞
 */
export function formatPrompt(
  template: string,
  variables: Record<string, string>
): string {
  let formatted = template
  for (const [key, value] of Object.entries(variables)) {
    formatted = formatted.replace(new RegExp(`{${key}}`, 'g'), value)
  }
  return formatted
}

/**
 * 從 AI 回應中解析情感標籤
 */
export function parseEmotionFromResponse(response: string): {
  emotion: string
  cleanResponse: string
} {
  const emotionRegex = /\[EMOTION_START\]([a-z]+)\[EMOTION_END\]/
  const match = response.match(emotionRegex)

  if (match && match[1]) {
    const emotion = match[1]
    const cleanResponse = response.replace(emotionRegex, '').trim()
    return { emotion, cleanResponse }
  }
  console.log('沒有找到情感標籤，預設為 neutral')
  // 如果沒有找到情感標籤，預設為 neutral
  return {
    emotion: 'neutral',
    cleanResponse: response,
  }
}

/**
 * 從 AI 回應中解析評分信息
 */
export function parseScoreFromResponse(response: string): {
  score: any | null
  cleanResponse: string
} {
  const extractFirstJsonObject = (raw: string): string | null => {
    const source = String(raw || '')
    const start = source.indexOf('{')
    if (start === -1) return null

    let depth = 0
    let inString = false
    let escaped = false

    for (let i = start; i < source.length; i++) {
      const ch = source[i]

      if (escaped) {
        escaped = false
        continue
      }

      if (ch === '\\') {
        escaped = true
        continue
      }

      if (ch === '"') {
        inString = !inString
        continue
      }

      if (inString) continue

      if (ch === '{') {
        depth += 1
      } else if (ch === '}') {
        depth -= 1
        if (depth === 0) return source.slice(start, i + 1)
      }
    }

    return null
  }

  const sanitizeScoreJson = (raw: string): string => {
    let s = String(raw || '').trim()
    // 常見模型輸出錯誤容錯：
    // 1) 多餘逗號
    s = s.replace(/,\s*,/g, ',')
    // 2) 物件結束後漏逗號（例如 "}\"scores\":")
    s = s.replace(/}(\s*)"([A-Za-z0-9_]+)"\s*:/g, '},$1"$2":')
    // 3) key 未加引號（例如 nextAction:end）
    s = s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
    // 4) 單引號改雙引號
    s = s.replace(/'/g, '"')
    return s
  }

  const parseJsonStringValue = (value: string): string => {
    try {
      return JSON.parse(`"${value}"`)
    } catch {
      return value.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    }
  }

  const extractStringField = (raw: string, key: string): string | undefined => {
    const match = raw.match(
      new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`)
    )
    return match?.[1] ? parseJsonStringValue(match[1]) : undefined
  }

  const extractSectionSlice = (raw: string, key: string): string => {
    const keyMatch = raw.match(new RegExp(`"${key}"\\s*:`))
    if (!keyMatch || keyMatch.index === undefined) return ''

    const start = keyMatch.index + keyMatch[0].length
    const tail = raw.slice(start)
    const endMatch = tail.match(
      /,\s*"(questionId|questionText|nextAction|deductions|additions|aiFeedback|personality)"\s*:/
    )
    return endMatch && endMatch.index !== undefined
      ? tail.slice(0, endMatch.index)
      : tail
  }

  const parseReasonSectionLoose = (
    raw: string,
    sectionKey: 'deductions' | 'additions'
  ): Record<string, Array<{ points: number; detail: string }>> => {
    const section = extractSectionSlice(raw, sectionKey)
    if (!section) return {}

    const result: Record<string, Array<{ points: number; detail: string }>> = {}
    const criterionRegex =
      /"([A-Za-z0-9_]+)"\s*:\s*\[\s*((?:\{[\s\S]*?\}\s*,?\s*)*)/g
    let criterionMatch: RegExpExecArray | null

    while ((criterionMatch = criterionRegex.exec(section)) !== null) {
      const criterionKey = criterionMatch[1]
      const rawItems = criterionMatch[2] || ''
      const itemRegex = /\{[\s\S]*?\}/g
      const items: Array<{ points: number; detail: string }> = []
      let itemMatch: RegExpExecArray | null

      while ((itemMatch = itemRegex.exec(rawItems)) !== null) {
        const itemSource = itemMatch[0]
        try {
          const parsed = JSON.parse(itemSource)
          items.push({
            points: Math.abs(Number(parsed?.points) || 0),
            detail: String(parsed?.detail || ''),
          })
        } catch {
          const pointsMatch = itemSource.match(
            /"points"\s*:\s*(-?\d+(?:\.\d+)?)/
          )
          const detail = extractStringField(itemSource, 'detail') || ''
          items.push({
            points: Math.abs(Number(pointsMatch?.[1]) || 0),
            detail,
          })
        }
      }

      if (items.length > 0) {
        result[criterionKey] = items
      }
    }

    return result
  }

  const parseScorePayloadLoose = (payload: string): any | null => {
    const raw = extractFirstJsonObject(payload) || payload
    const nextAction = extractStringField(raw, 'nextAction')
    const normalizedNextAction =
      nextAction === 'followup' || nextAction === 'next' || nextAction === 'end'
        ? nextAction
        : undefined
    const partial = {
      questionId: extractStringField(raw, 'questionId'),
      questionText: extractStringField(raw, 'questionText'),
      nextAction: normalizedNextAction,
      deductions: parseReasonSectionLoose(raw, 'deductions'),
      additions: parseReasonSectionLoose(raw, 'additions'),
      aiFeedback: extractStringField(raw, 'aiFeedback') || '',
      personality: null,
    }

    const hasUsefulData =
      partial.questionId ||
      partial.questionText ||
      partial.nextAction ||
      Object.keys(partial.deductions).length > 0 ||
      Object.keys(partial.additions).length > 0 ||
      partial.aiFeedback

    return hasUsefulData ? partial : null
  }

  const parseScorePayload = (payload: string): any | null => {
    const jsonPayload = extractFirstJsonObject(payload) || payload
    try {
      return JSON.parse(jsonPayload)
    } catch (e) {
      try {
        return JSON.parse(sanitizeScoreJson(jsonPayload))
      } catch (e2) {
        const looseScore = parseScorePayloadLoose(payload)
        console.warn('評分JSON解析失敗，改用寬鬆欄位解析:', {
          error: e2,
          recoveredNextAction: looseScore?.nextAction || null,
          recoveredQuestionId: looseScore?.questionId || null,
          recoveredDeductionKeys: looseScore?.deductions
            ? Object.keys(looseScore.deductions)
            : [],
          recoveredAdditionKeys: looseScore?.additions
            ? Object.keys(looseScore.additions)
            : [],
        })
        return looseScore
      }
    }
  }

  // 多行/全域剝離：匹配所有完整 [SCORE_START] ... [SCORE_END]
  const blockRegex = /\[SCORE_START\]([\s\S]*?)\[SCORE_END\]/g
  let lastScore: any | null = null
  let clean = response
  let match: RegExpExecArray | null
  while ((match = blockRegex.exec(response)) !== null) {
    const parsed = parseScorePayload(match[1])
    if (parsed) lastScore = parsed
  }

  // 容錯：模型有時會漏掉 [SCORE_END]，但 SCORE_START 後的 JSON 已完整。
  if (!lastScore) {
    const startIdx = response.lastIndexOf('[SCORE_START]')
    if (startIdx !== -1) {
      const payload = response.slice(startIdx + '[SCORE_START]'.length)
      const parsed = parseScorePayload(payload)
      if (parsed) lastScore = parsed
    }
  }

  // 無論解析是否成功，先從顯示文字中移除所有評分區塊
  clean = clean.replace(blockRegex, '').trim()
  clean = clean.replace(/\[SCORE_START\][\s\S]*$/g, '').trim()
  return { score: lastScore, cleanResponse: clean }
}

/**
 * 解析 AI 回應中的情感標籤和評分信息
 */
export function parseInterviewResponse(response: string): {
  emotion: string
  score: any | null
  cleanResponse: string
} {
  const emotionResult = parseEmotionFromResponse(response)
  // 優先擷取 CONTENT 區塊
  const contentRegex = /\[CONTENT_START\]([\s\S]*?)\[CONTENT_END\]/
  const contentMatch = emotionResult.cleanResponse.match(contentRegex)
  const visible = contentMatch ? contentMatch[1].trim() : undefined

  // 解析評分並從文本中移除所有評分區塊
  const scoreResult = parseScoreFromResponse(emotionResult.cleanResponse)

  return {
    emotion: emotionResult.emotion,
    score: scoreResult.score,
    cleanResponse:
      visible && visible.length > 0 ? visible : scoreResult.cleanResponse,
  }
}
