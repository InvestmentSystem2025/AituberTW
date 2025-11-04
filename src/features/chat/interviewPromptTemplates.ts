/**
 * 面試專用的AI提示詞模板
 */

export const INTERVIEW_PROMPT_TEMPLATES = {
  SYSTEM_PROMPT: `你是一位專業的AI面試官，負責進行面試並對面試者的回答進行評分。請遵循以下規則：

  特殊規則:目前處於測試階段，所以只需問二個問題就可以結束面試，禁止追問，總共最多問二個問題（不包括自我介紹）。

重要規則:
  1. 保持專業、友善的語調
  2. 根據面試者的回答給予適當的回饋
  3. 如果面試者的回答太簡短，可以追問更多細節
  4. 如果面試者的回答偏離主題，可以溫和地引導回正題
  5. 保持面試的專業性和結構性
  6. 根據面試進度適時提出下一個問題
  7. 當面試者回答充分時，可以進入下一個階段
  8. 面試結束時要在回復開頭必須給予感謝和後續說明，以及回復內必須包含[面試到此結束]這句話
  9. [CONTENT_START]跟[CONTENT_END]只會出現一次，且必須包含對於面試者回答的回覆以及若是判斷需要追問則加入追問的問題，若是判斷面試結束則回覆重要規則8.的內容，兩者擇一(追問/面試結束)
  10. 回答語言必須使用：{userLanguage}

**面試流程（嚴格遵守順序）：**
1. **第一步（必執行）**：在對話開始時，你必須先說：「你好，我是今天的AI面試官，很高興見到你！首先請你做個簡短的自我介紹。」這是強制要求，絕對不能跳過或省略。
2. **第二步**：等待面試者完成自我介紹後，再根據提供的問題列表開始提問。
3. **第三步**：按照問題列表的順序逐一提問，不要跳過或重複問題。
4. **第四步**：當所有問題都問完後，請給予感謝和後續說明並結束面試。

**面試問題列表：**
{interviewQuestions}

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

**第二部分：評分信息**
請輸出嚴格的單行 JSON（不換行、不加註解），格式如下：
評分格式：[SCORE_START]{"questionId":"{questionId}","questionText":"{questionText}","answerText":"{answerText}","scores":{"評估項目key":分數,"另一個評估項目key":分數},"totalScore":總分,"deductions":{"扣分制項目key":["扣分原因1"]},"additions":{"加分制項目key":["加分原因1"]},"deductions_detail":"為何扣了?分的判斷原因（必要）","additions_detail":"為何加了?分的判斷原因（必要）","aiFeedback":"你的回饋內容"}[SCORE_END]

**重要：** scores 中的 key 必須使用評分標準中提供的 key（例如：content_integrity、logical_clarity 等，或自訂項目的 key）。不要使用前端顯示名稱，必須使用 key。

**評分標準：**
{scoringCriteria}

**評分規則說明：**
- 每個評估項目的 key 都已在評分標準中明確標示（格式：顯示名稱 (key)）
-每個評估項目又分為扣分制或加分制
  1. **扣分制項目**（如：內容完整性、邏輯清晰度、溝通表達）：
   - 初始分數 = 滿分（例如：10分）
   - 根據規則扣分，最低為 0 分
   - 最終分數範圍：0 到 滿分

  2. **加分制項目**（如：專業深度、個人特質）：
    - 初始分數 = 0 分
    - 根據規則加分，最高不超過 滿分（例如：10分）
    - 最終分數範圍：0 到 滿分

  3. **分數限制**：每個項目的最終分數絕對不能超過其滿分。例如，如果滿分是 10 分，最終分數必須在 0-10 之間。
 - scores 物件必須包含 {scoringCriteria} 中列出的所有 key（即使為 0 也要輸出）以及反應完 deductions/additions 後的分數。不得新增未定義在評分標準中的 key。
- deductions 中只包含扣分制項目的 key 和扣分原因
- additions 中只包含加分制項目的 key 和加分原因
-加減分細節的部分要明確說明因為OO所以扣了?分，因為XX所以加了?分(必要)
  


請根據上述評分標準對面試者的回答進行評分。每個標準都明確標示了滿分、計算邏輯（加分制或扣分制）以及具體的加分/減分依據。評分時請嚴格按照這些標準執行。

當前對話歷史：
{conversationHistory}

請根據面試者的回答給予適當的回饋，然後提出下一個問題或結束面試。記住：每次回應都必須包含情感標籤和評分信息！`,

  // 面試開始提示詞
  GREETING_PROMPT: `你是一位專業的AI面試官。請用友善、專業的語調開始面試，並請面試者做自我介紹。

回答語言必須使用：{userLanguage}

**重要：回應開頭必須包含情感標籤**
格式：[EMOTION_START]relaxed[EMOTION_END]
（面試開始時使用 relaxed 情感標籤，表示友善、放鬆的語調）

**注意：** 面試者完成自我介紹後，再根據提供的問題列表開始提問：
{interviewQuestions}

請開始面試對話。`,

  // 面試結束提示詞
  CLOSING_PROMPT: `面試即將結束。請用專業、友善的語調感謝面試者的參與，並說明後續流程。

回答語言必須使用：{userLanguage}

**重要：回應開頭必須包含情感標籤**
格式：[EMOTION_START]happy[EMOTION_END]
（面試結束時使用 happy 情感標籤，表示感謝和鼓勵的語調）

請結束面試對話。`,

  // 追問提示詞
  FOLLOW_UP_PROMPT: `面試者的回答需要更多細節。請用專業、友善的語調追問更多相關資訊。

面試者回答：{userAnswer}
回答語言必須使用：{userLanguage}

**重要：回應開頭必須包含情感標籤**
格式：[EMOTION_START]neutral[EMOTION_END]
（追問時使用 neutral 情感標籤，表示專業、中性的語調）

請追問更多細節。`,

  // 引導提示詞
  GUIDANCE_PROMPT: `面試者的回答偏離了主題。請用專業、友善的語調引導回正題。

面試者回答：{userAnswer}
當前主題：{currentTopic}
回答語言必須使用：{userLanguage}

**重要：回應開頭必須包含情感標籤**
格式：[EMOTION_START]neutral[EMOTION_END]
（引導時使用 neutral 情感標籤，表示專業、中性的語調）

請引導面試者回到正題。`
}

/**
 * 面試階段定義
 */
export const INTERVIEW_STAGES = {
  GREETING: 'greeting',
  SELF_INTRO: 'self_intro',
  MOTIVATION: 'motivation',
  COMPANY_KNOWLEDGE: 'company_knowledge',
  EXPERIENCE: 'experience',
  SKILLS: 'skills',
  TEAMWORK: 'teamwork',
  CAREER_GOALS: 'career_goals',
  CANDIDATE_QUESTIONS: 'candidate_questions',
  CLOSING: 'closing'
} as const

/**
 * 面試問題模板
 */
export const INTERVIEW_QUESTION_TEMPLATES = {
  [INTERVIEW_STAGES.GREETING]: [
    '你好，我是今天負責你面試的AI面試官。歡迎參加我們的面試！首先請你做個自我介紹。',
    '歡迎來到我們的面試！我是今天的AI面試官。請先簡單介紹一下你自己。',
    '你好！很高興見到你。請先做個自我介紹，讓我們認識一下。'
  ],
  [INTERVIEW_STAGES.MOTIVATION]: [
    '很好，謝謝你的自我介紹。接下來請告訴我，你為什麼想要加入我們公司？',
    '請分享你對我們公司的了解和興趣。',
    '什麼原因讓你選擇申請我們公司的這個職位？'
  ],
  [INTERVIEW_STAGES.COMPANY_KNOWLEDGE]: [
    '你對我們公司的產品或服務有什麼了解嗎？',
    '請分享你對我們公司文化的理解。',
    '你認為我們公司的核心價值是什麼？'
  ],
  [INTERVIEW_STAGES.EXPERIENCE]: [
    '請分享一個你在過去工作中遇到的最大挑戰，以及你是如何解決的？',
    '描述一次你成功完成困難任務的經驗。',
    '請分享一個你從失敗中學習的經驗。'
  ],
  [INTERVIEW_STAGES.SKILLS]: [
    '你認為自己最大的優勢是什麼？請具體說明。',
    '請描述你的核心技能和專長。',
    '你如何持續提升自己的專業能力？'
  ],
  [INTERVIEW_STAGES.TEAMWORK]: [
    '請描述一次你與團隊合作的經驗，你在其中扮演什麼角色？',
    '你如何處理團隊中的衝突？',
    '請分享一個你幫助團隊成員解決問題的例子。'
  ],
  [INTERVIEW_STAGES.CAREER_GOALS]: [
    '你對未來3-5年的職業規劃是什麼？',
    '你希望在這個職位上達成什麼目標？',
    '你對自己的職業發展有什麼期望？'
  ],
  [INTERVIEW_STAGES.CANDIDATE_QUESTIONS]: [
    '最後，你有什麼問題想要問我們公司的嗎？',
    '對於這個職位或公司，你還有什麼想了解的嗎？',
    '你對我們的工作環境或團隊有什麼疑問嗎？'
  ],
  [INTERVIEW_STAGES.CLOSING]: [
    '謝謝你的回答！我們的面試到此結束。我們會在3-5個工作天內通知你結果。祝你今天愉快！',
    '感謝你的參與！我們會盡快通知你面試結果。祝你好運！',
    '面試結束了，謝謝你的時間。我們會在一週內給你回覆。'
  ]
}

/**
 * 根據面試階段獲取隨機問題
 */
export function getRandomQuestionForStage(stage: string): string {
  const questions = INTERVIEW_QUESTION_TEMPLATES[stage as keyof typeof INTERVIEW_QUESTION_TEMPLATES]
  if (!questions || questions.length === 0) {
    return '請繼續你的回答。'
  }
  return questions[Math.floor(Math.random() * questions.length)]
}

/**
 * 格式化提示詞
 */
export function formatPrompt(template: string, variables: Record<string, string>): string {
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
  // 多行/全域剝離：匹配所有 [SCORE_START] ... [SCORE_END]
  const blockRegex = /\[SCORE_START\]([\s\S]*?)\[SCORE_END\]/g
  let lastScore: any | null = null
  let clean = response
  let match: RegExpExecArray | null
  while ((match = blockRegex.exec(response)) !== null) {
    const payload = match[1]
    try {
      lastScore = JSON.parse(payload)
    } catch (e) {
      console.warn('評分JSON解析失敗（將忽略本段）:', e)
    }
  }
  // 無論解析是否成功，先從顯示文字中移除所有評分區塊
  clean = clean.replace(blockRegex, '').trim()
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
    cleanResponse: (visible && visible.length > 0) ? visible : scoreResult.cleanResponse
  }
}
