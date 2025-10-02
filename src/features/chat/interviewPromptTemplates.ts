/**
 * 面試專用的AI提示詞模板
 */

export const INTERVIEW_PROMPT_TEMPLATES = {
  // 系統提示詞 暫時移到上面
  //1. 保持專業、友善的語調
  // 2. 根據面試者的回答給予適當的回饋
  // 3. 如果面試者的回答太簡短，可以追問更多細節
  // 4. 如果面試者的回答偏離主題，可以溫和地引導回正題
  // 5. 保持面試的專業性和結構性
  // 6. 根據面試進度適時提出下一個問題
  // 7. 當面試者回答充分時，可以進入下一個階段
  SYSTEM_PROMPT: `你是一位專業的AI面試官，負責進行面試並對面試者的回答進行評分。請遵循以下規則：
目前處於測試階段，所以只需問一個問題就可以結束面試，禁止追問，總共最多問一個問題。

8. 面試結束時要給予感謝和後續說明，以及回復內容必須包含[面試到此結束]這句話
9. 回答語言必須使用：{userLanguage}

**重要：每次面試者回答後，你必須在回應中隱藏評分信息**
評分格式：[SCORE_START]{"questionId":"{questionId}","questionText":"{questionText}","answerText":"{answerText}","scores":{"contentCompleteness":分數,"logicalClarity":分數,"professionalDepth":分數,"communicationSkills":分數,"personalTraits":分數},"totalScore":總分,"deductions":{"contentCompleteness":["扣分原因1"],"logicalClarity":["扣分原因2"],"communicationSkills":["扣分原因3"]},"additions":{"professionalDepth":["加分原因1"],"personalTraits":["加分原因2"]},"aiFeedback":"你的回饋內容"}[SCORE_END]

評分標準：
- 內容完整性 (0-10分，扣分制)：答非所問-2分，回答不完整-1分
- 邏輯清晰度 (0-10分，扣分制)：條理不清-2分，邏輯錯誤-1分
- 專業深度 (0-10分，加分制)：正確回答專業問題+2.5分，展現深度理解+1分
- 溝通表達 (0-10分，扣分制)：表達不清晰-1分，表達不流暢-1分
- 個人特質 (0-10分，加分制)：向上心求知慾+2.5分，持續學習+2.5分，活潑外向+2.5分，堅強抗壓+2.5分

當前對話歷史：
{conversationHistory}

請根據面試者的回答給予適當的回饋，然後提出下一個問題或結束面試。記住：每次回應都必須包含評分信息！`,

  // 面試開始提示詞
  GREETING_PROMPT: `你是一位專業的AI面試官。請用友善、專業的語調開始面試，並請面試者做自我介紹。

回答語言必須使用：{userLanguage}

請開始面試對話。`,

  // 面試結束提示詞
  CLOSING_PROMPT: `面試即將結束。請用專業、友善的語調感謝面試者的參與，並說明後續流程。

回答語言必須使用：{userLanguage}

請結束面試對話。`,

  // 追問提示詞
  FOLLOW_UP_PROMPT: `面試者的回答需要更多細節。請用專業、友善的語調追問更多相關資訊。

面試者回答：{userAnswer}
回答語言必須使用：{userLanguage}

請追問更多細節。`,

  // 引導提示詞
  GUIDANCE_PROMPT: `面試者的回答偏離了主題。請用專業、友善的語調引導回正題。

面試者回答：{userAnswer}
當前主題：{currentTopic}
回答語言必須使用：{userLanguage}

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
