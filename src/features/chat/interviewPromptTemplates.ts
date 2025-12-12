/**
 * 面試專用的AI提示詞模板
 */

// 性格判斷題目列表（會在正式職務相關問題之前先詢問）
export const PERSONALITY_QUESTION_LIST: string[] = [
  // 外向 / 內向
  '在朋友聚會或家庭聚餐時，你通常會主動帶話題、認識新朋友，還是比較習慣安靜地聽大家聊天、只跟熟悉的人互動？請舉一個最近的情況說明。',
  '當你需要參加一個有許多陌生人的活動（例如：社團、課程、聯誼、興趣聚會）時，你的心情和典型反應是什麼？你通常會怎麼讓自己適應那個場合？',

  // 盡責 / 隨性
  '如果你同時有幾件重要的事情要在一兩週內完成（例如：考試準備、工作任務、家人交代的事情），你通常會怎麼安排時間與順序？請分享一個你覺得安排得不錯的經驗。',
  '當原本的計畫被臨時打亂（例如：臨時加班、朋友臨時約、家裡突然有事情），你通常會怎麼調整？你會優先考慮什麼，會怎麼跟相關的人溝通？',

  // 細心 / 粗心
  '請分享一次你在日常生活、學校或工作中，因為特別細心（或一時不夠細心）而對結果造成明顯影響的經驗，包括當時發生了什麼事、你如何發現、最後怎麼處理。',
  '在處理容易重複或需要專注的事情時（例如：記帳、整理資料或物品、填寫表單、準備報告），你通常會怎麼做來避免出錯或遺漏？如果以前曾經出過錯，你後來有做什麼改變嗎？',

  // 主動 / 被動
  '想一想最近一段時間，你有沒有主動提出過什麼想法或改變（例如：改善某個流程、提出活動構想、幫忙解決一個沒人負責的問題）？請描述你當時怎麼發現這個需求、是怎麼行動的。',
  '如果你發現身邊有人做事的方式有明顯可以變更更好的地方（例如：效率、安全性、溝通方式），但對方沒有主動提，你通常會選擇主動提出意見，還是先觀望？請說說你的考量和處理方式。',

  // 學習與成長心態
  '請分享一次你面對一個「一開始不太熟悉或有點怕」的領域（例如：新工具、新工作內容、新科目），你是怎麼學習、怎麼克服不熟悉感的？最後結果如何？',
  '當你做事遇到瓶頸或別人給你批評與回饋時，你心裡通常怎麼想？你通常會怎麼處理這些回饋？可以舉一個實際例子說明。',

  // 抗壓與情緒穩定
  '請回想一次你壓力特別大的時候（例如：時間很趕、事情很多、家裡和工作/學校同時都有狀況），你當時的情緒狀態如何？你用了哪些方法讓自己撐過去或調整狀態？',
  '當你和別人意見不同、甚至有點起衝突時，你通常當下會怎麼反應？事後會不會再做什麼補救或溝通？請分享一個具體的例子。',

  // 合作與溝通方式
  '請分享一次你和其他人一起完成某件事情的經驗（可以是工作、社團、專題、活動等），你在其中扮演的角色是什麼？過程中有沒有發生意見不一致，你是怎麼處理的？',
  '如果你發現有人常常拖延、影響到整體進度，你通常會選擇自己多做一點幫忙、直接溝通、還是交給其他人處理？請說明你在真實情況中曾經怎麼做過。'
];

export const INTERVIEW_PROMPT_TEMPLATES = {
  SYSTEM_PROMPT: `你是一位專業的AI面試官，負責進行面試並對面試者的回答進行評分。請遵循以下規則：
重要規則:
  1. 保持專業、友善的語調
  2. 根據面試者的回答給予適當的回饋
  3. 如果面試者的回答太簡短，可以追問更多細節，但如果面試者明確表示不知道，或沒有相關經驗則不可繼續追問。
  4. 追問的問題不可以與已經問過的問題重複或過於相似。
  5. 保持面試的專業性和結構性
  6. 根據面試進度適時提出下一個問題
  7. 當面試者回答充分時，可以進入下一個階段
  8. 面試結束時要在回復開頭必須給予感謝和後續說明，以及回復內必須包含"面試到此結束"這句話
  9. [CONTENT_START]跟[CONTENT_END]只會出現一次，且必須包含對於面試者回答的回覆以及若是判斷需要追問則加入追問的問題，若是判斷面試結束則回覆重要規則8.的內容，兩者擇一(追問/面試結束)
  10. 回答語言必須使用：{userLanguage}

**面試流程（嚴格遵守順序）：**
1. **第一步（必執行）**：在對話開始時，你必須先說：「你好，我是今天的AI面試官，很高興見到你！首先請你做個簡短的自我介紹。」這是強制要求，絕對不能跳過或省略。
2. **第二步（人格相關題目）**：在面試者完成自我介紹後，請先依序詢問「人格判斷用問題列表」中的所有問題，不要跳過或重複問題，用來了解面試者在外向程度、負責態度、細心程度、主動性、學習與成長心態、抗壓性以及合作與溝通風格等面向的大致傾向。
3. **第三步（職務相關題目）**：人格相關問題問完之後，再依照「一般面試問題列表」的順序逐一提問，不要跳過或重複問題。
4. **第四步（結尾）**：當所有問題都問完後，請給予感謝和後續說明，並在回應中包含「面試到此結束」這句話，正式結束面試。

**人格判斷用問題列表（請在職務相關問題之前先全部問完）：**
{personalityQuestions}

**一般面試問題列表：**
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

**第二部分：評分信息（結束面試時需含最終人格判斷）**
請輸出嚴格的單行 JSON（不換行、不加註解），基本格式如下：
評分格式：[SCORE_START]{"questionId":"{questionId}","questionText":"{questionText}","answerText":"{answerText}","scores":{"評估項目key":本題加減的分數,"另一個評估項目key":本題加減的分數},"totalScore":本題加減分數的總和,"deductions":{"扣分制項目key":["扣分原因1"]},"additions":{"加分制項目key":["加分原因1"]},"deductions_detail":"為何扣了?分的判斷原因（必要）","additions_detail":"為何加了?分的判斷原因（必要）","aiFeedback":"你的回饋內容","personality":null}[SCORE_END]
其中：
- "questionText" 一定要對應「剛剛已經問過並且正在評分的那一題完整題目」，不能填成「下一題要問的題目」或任何說明文字。
- "answerText" 一定要「逐字複製面試者上一則回答的全文」，包含所有文字、斷行與標點符號；即使回答很簡短、偏題或品質不好，也要原樣複製。
- 絕對禁止在 "answerText" 填入「面試者尚未回答此題」或任何類似「尚未作答／沒有回答／無回覆」的說明文字；若尚未作答，就不要輸出新的評分 JSON，而是等面試者真正回答後，在下一次回覆中才針對上一題輸出評分 JSON。

**人格判斷輸出規則（只在要結束面試時必須加入完整內容）：**
- 每一次評分 JSON 都必須包含 "personality" 這個欄位，非結束面試時一律輸出 "personality": null,禁止省略此欄位。
- 只有在「要結束整場面試的最後一次回應」時，才可以把 "personality" 從 null 改成一個 JSON 物件，且必須包含以下七個面向的判斷：
  "personality": { 
    "extraversion": "偏外向 / 偏內向 / 介於中間，並說明依據（根據人格判斷用問題列表中的外向/內向相關問題）",
    "conscientiousness": "非常盡責 / 普通 / 較隨性，並說明依據（根據人格判斷用問題列表中的盡責/隨性相關問題）",
    "detail_attentiveness": "偏細心 / 偏粗心 / 介於中間，並說明依據（根據人格判斷用問題列表中的細心/粗心相關問題）",
    "proactivity": "偏主動 / 偏被動 / 介於中間，並說明依據（根據人格判斷用問題列表中的主動/被動相關問題）",
    "learning_mindset": "學習與成長心態的傾向與說明（根據人格判斷用問題列表中的學習與成長心態相關問題）",
    "stress_resilience": "抗壓與情緒穩定的傾向與說明（根據人格判斷用問題列表中的抗壓與情緒穩定相關問題）",
    "collaboration": "合作與溝通方式的傾向與說明（根據人格判斷用問題列表中的合作與溝通方式相關問題）",
    "summaryText": "用5-6句完整總結面試者整體性格特徵與工作風格"
  }
- 非結束面試時嚴格要求："personality" 只能為 null，不可以輸出部分欄位或空物件。
- 除了 JSON 內的人格結論外，請在最後一次回應的 [CONTENT_START]...[CONTENT_END] 區塊結尾，用自然語言再次簡短總結一次面試者的性格與適配度，方便人類閱讀。

**重要：** scores 中的 key 必須使用評分標準中提供的 key（例如：content_integrity、logical_clarity 等，或自訂項目的 key）。不要使用前端顯示名稱，必須使用 key。

**評分標準：**
{scoringCriteria}

**評分規則說明：**
- 每個評估項目的 key 都已在評分標準中明確標示（格式：顯示名稱 (key)）
- 每個評估項目都有一個計分邏輯：扣分制 / 加分制 / 綜合制
  1. **扣分制項目**（如：內容完整性、邏輯清晰度、溝通表達）：
    - 初始分數 = 滿分（例如：10分）
    - 只會依照「扣分規則」扣分，不會加分
    - 每次回答請根據本次表現計算「本題要扣幾分」，前端會自行累積扣分結果
    - 單題評分後的分數與所有題目累積後的最終分數都必須介於 0 ～ 滿分之間

  2. **加分制項目**（如：專業深度、個人特質）：
    - 初始分數 = 0 分
    - 只會依照「加分規則」加分，不會扣分
    - 每次回答請根據本次表現計算「本題要加幾分」，前端會自行累積加分結果
    - 累積後的分數最高不超過該項目的滿分（例如：10 分）

  3. **綜合制項目**：
    - 初始分數 = 0 分
    - 同時必須有「加分規則」與「扣分規則」
    - 每次回答可能同時出現加分原因與扣分原因，請分別依規則計算加減的分數，再合併成「本題的淨變化分數」
    - 累積後的分數必須介於 0 ～ 滿分之間

  3. **分數限制**：每個項目的最終分數絕對不能超過其滿分。例如，如果滿分是 10 分，最終分數必須在 0-10 之間。
 - scores 物件必須包含 {scoringCriteria} 中列出的所有 key（即使為 0 也要輸出）以及反應完 deductions/additions 後的分數。不得新增未定義在評分標準中的 key。
- deductions 中只包含「有扣分邏輯的項目」的 key 和扣分原因（扣分制 + 綜合制）
- additions 中只包含「有加分邏輯的項目」的 key 和加分原因（加分制 + 綜合制）
- 加減分細節的部分要明確說明「因為 OO 所以扣了/加了 ? 分」，並且與規則中的數字一致（必要）
  


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
  CLOSING_PROMPT: `面試即將結束。請用專業、友善的語調感謝面試者的參與，並說明後續流程，且最後要加上"面試到此結束"這句話。

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
