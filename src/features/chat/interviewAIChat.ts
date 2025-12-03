import { Message, Talk } from '../messages/messages'
import i18next from 'i18next'
import toastStore from '@/features/stores/toast'
import {
  isVercelLocalAIService,
  AIService,
} from '@/features/constants/settings'
import settingsStore from '../stores/settings'
import { 
  INTERVIEW_PROMPT_TEMPLATES, 
  INTERVIEW_STAGES, 
  formatPrompt,
  parseInterviewResponse,
  PERSONALITY_QUESTION_LIST,
} from './interviewPromptTemplates'
import { InterviewScoringEngine } from '@/features/interview/interviewScoring'
import { AnswerScore } from '@/types/interviewScoring'
import { speakCharacter } from '../messages/speakCharacter'
import { generateMessageId } from '@/utils/messageUtils'
import { responseTimeTracker } from '@/utils/responseTimeTracker'

/**
 * 檢測當前面試階段
 */
function detectInterviewStage(messages: Message[]): string {
  const lastAIMessage = messages.filter(msg => msg.role === 'assistant').pop()
  if (!lastAIMessage) return INTERVIEW_STAGES.GREETING
  
  const content = typeof lastAIMessage.content === 'string' 
    ? lastAIMessage.content.toLowerCase()
    : ''
  
  if (content.includes('自我介紹') || content.includes('介紹一下')) {
    return INTERVIEW_STAGES.SELF_INTRO
  } else if (content.includes('為什麼') || content.includes('動機') || content.includes('加入')) {
    return INTERVIEW_STAGES.MOTIVATION
  } else if (content.includes('公司') || content.includes('產品') || content.includes('服務')) {
    return INTERVIEW_STAGES.COMPANY_KNOWLEDGE
  } else if (content.includes('挑戰') || content.includes('經驗') || content.includes('解決')) {
    return INTERVIEW_STAGES.EXPERIENCE
  } else if (content.includes('優勢') || content.includes('技能') || content.includes('專長')) {
    return INTERVIEW_STAGES.SKILLS
  } else if (content.includes('團隊') || content.includes('合作') || content.includes('衝突')) {
    return INTERVIEW_STAGES.TEAMWORK
  } else if (content.includes('規劃') || content.includes('目標') || content.includes('未來')) {
    return INTERVIEW_STAGES.CAREER_GOALS
  } else if (content.includes('問題') || content.includes('疑問') || content.includes('了解')) {
    return INTERVIEW_STAGES.CANDIDATE_QUESTIONS
  } else if (content.includes('結束') || content.includes('謝謝') || content.includes('結果')) {
    return INTERVIEW_STAGES.CLOSING
  }
  
  return INTERVIEW_STAGES.GREETING
}

/**
 * 檢測用戶語言
 */
function detectUserLanguage(text: string): string {
  // 檢測中文字符
  const chineseRegex = /[\u4e00-\u9fff]/
  // 檢測日文字符
  const japaneseRegex = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/
  // 檢測韓文字符
  const koreanRegex = /[\uac00-\ud7af]/
  // 檢測阿拉伯文字符
  const arabicRegex = /[\u0600-\u06ff]/
  // 檢測俄文字符
  const russianRegex = /[\u0400-\u04ff]/

  if (chineseRegex.test(text)) {
    return '繁體中文'
  } else if (japaneseRegex.test(text)) {
    return '日本語'
  } else if (koreanRegex.test(text)) {
    return '한국어'
  } else if (arabicRegex.test(text)) {
    return 'العربية'
  } else if (russianRegex.test(text)) {
    return 'Русский'
  } else {
    return 'English'
  }
}

const getAIConfig = () => {
  const ss = settingsStore.getState()
  // AIServiceとして扱う（より広い型）
  const aiService = ss.selectAIService as AIService

  // APIキー名は条件分岐で取得
  const apiKey =
    typeof aiService === 'string' &&
    aiService !== 'dify' &&
    aiService !== 'custom-api'
      ? (ss[`${aiService}Key` as keyof typeof ss] as string)
      : ''

  return {
    aiApiKey: apiKey,
    selectAIService: aiService,
    selectAIModel: ss.selectAIModel,
    localLlmUrl: ss.localLlmUrl,
    azureEndpoint: ss.azureEndpoint,
    temperature: ss.temperature,
    maxTokens: ss.maxTokens,
    customApiUrl: ss.customApiUrl,
    customApiHeaders: ss.customApiHeaders,
    customApiBody: ss.customApiBody,
    customApiStream: ss.customApiStream,
    includeSystemMessagesInCustomApi: ss.includeSystemMessagesInCustomApi,
    customApiIncludeMimeType: ss.customApiIncludeMimeType,
  }
}

function handleApiError(errorCode: string): string {
  const languageCode = settingsStore.getState().selectLanguage
  i18next.changeLanguage(languageCode)
  return i18next.t(`Errors.${errorCode || 'AIAPIError'}`)
}

// APIエンドポイントを決定する関数
function getApiEndpoint(aiService: string): string {
  // isVercelLocalAIServiceを使用してapiサービスかどうかを判定
  if (isVercelLocalAIService(aiService) && aiService === 'custom-api') {
    return '/api/ai/custom'
  }
  return '/api/ai/vercel'
}

/**
 * 格式化對話歷史為字串
 */
function formatConversationHistory(messages: Message[]): string {
  return messages
    .map((msg) => {
      const role = msg.role === 'user' ? '面試者' : 'AI面試官'
      return `${role}: ${msg.content}`
    })
    .join('\n')
}

/**
 * 創建AnswerScore對象
 */
function createAnswerScore(scoreData: any, questionIndex?: number, evaluationCriteria?: any[]): AnswerScore | null {
  // 驗證必要的字段
  if (!scoreData.scores || typeof scoreData.scores !== 'object') {
    console.warn('評分數據缺少scores字段或格式不正確')
    return null
  }
  
  // 如果有 questionIndex，生成正確的 ID (Q1, Q2, Q3...)
  const questionId = questionIndex ? `Q${questionIndex}` : (scoreData.questionId || generateMessageId())
  
  // 建立評分標準映射：max_score 與 scoring_logic
  const criteriaMap: Record<string, number> = {}
  const logicMap: Record<string, 'addition' | 'deduction' | 'composite'> = {}
  if (evaluationCriteria && evaluationCriteria.length > 0) {
    evaluationCriteria.forEach((criteria: any) => {
      const criteriaKey = criteria.key
      criteriaMap[criteriaKey] = criteria.max_score || 10
      if (criteria.scoring_logic === 'addition') {
        logicMap[criteriaKey] = 'addition'
      } else if (criteria.scoring_logic === 'composite') {
        // 綜合制：同時支援加分與扣分，基準為 0 分
        logicMap[criteriaKey] = 'composite'
      } else {
        logicMap[criteriaKey] = 'deduction'
      }
    })
  }
  
  // 映射評分 key 對應關係（用於向後兼容預設的5個項目）
  const scoreKeyMap: Record<string, string> = {
    'contentCompleteness': 'content_integrity',
    'logicalClarity': 'logical_clarity',
    'professionalDepth': 'professional_depth',
    'communicationSkills': 'communication',
    'personalTraits': 'personal_attributes',
  }
  
  // 處理分數 - 支持動態評估項目
  // ⚠️ 重要：scores 代表「本題各項目的加減分數（delta）」，而不是最終分數
  const rawScores: Record<string, number> = {}
  const scores: Record<string, number> = {}
  const numericProvidedKeys = new Set<string>()
  // 預設將所有分數視為 0（本題沒有加減分）
  
  // 處理預設的5個項目（同時支援前端 key 與 DB key）
  const defaultKeys = ['contentCompleteness', 'logicalClarity', 'professionalDepth', 'communicationSkills', 'personalTraits']
  defaultKeys.forEach(key => {
    if (!scoreData.scores) return
    const dbKey = scoreKeyMap[key]
    const candidateValues = [
      scoreData.scores[key],            // 前端 key（camelCase）
      scoreData.scores[dbKey]           // DB key（snake_case）
    ]
    const found = candidateValues.find(v => typeof v === 'number')
    if (typeof found === 'number') {
      const delta = Number(found) || 0
      rawScores[dbKey] = delta
      scores[dbKey] = delta
      numericProvidedKeys.add(dbKey)
    }
  })
  
  // 處理自訂評估項目（從 evaluationCriteria 中獲取）
  if (evaluationCriteria && evaluationCriteria.length > 0) {
    evaluationCriteria.forEach((criteria: any) => {
      const criteriaKey = criteria.key
      // 嘗試從 scoreData.scores 中獲取分數（可能使用 criteriaKey 或顯示名稱）
      const displayName = criteria.display_name
      
      // 檢查是否已經在 scores 中（預設項目）
      const isDefaultKey = defaultKeys.some(k => scoreKeyMap[k] === criteriaKey)
      if (!isDefaultKey && scoreData.scores) {
        // 嘗試用不同的 key 來匹配
        let scoreValue: number | undefined
        
        // 1. 直接用 criteriaKey
        if (scoreData.scores[criteriaKey] !== undefined) {
          scoreValue = Number(scoreData.scores[criteriaKey]) || 0
        }
        // 2. 用顯示名稱
        else if (scoreData.scores[displayName] !== undefined) {
          scoreValue = Number(scoreData.scores[displayName]) || 0
        }
        // 3. 遍歷所有 scores 的 key，看是否有匹配的
        else {
          const matchedKey = Object.keys(scoreData.scores).find(k => 
            k.toLowerCase() === criteriaKey.toLowerCase() || 
            k.includes(displayName) || 
            displayName.includes(k)
          )
          if (matchedKey) {
            scoreValue = Number(scoreData.scores[matchedKey]) || 0
          }
        }
        
        // 如果找到了分數，視為「本題的加減分數（delta）」
        if (scoreValue !== undefined) {
          const delta = Number(scoreValue) || 0
          rawScores[criteriaKey] = delta
          scores[criteriaKey] = delta
          numericProvidedKeys.add(criteriaKey)
        }
      }
    })
  }

  // 規範化：確保所有 evaluation_criteria 的 key 都存在於 scores（預設本題加減分為 0）
  if (evaluationCriteria && evaluationCriteria.length > 0) {
    evaluationCriteria.forEach((criteria: any) => {
      const k = criteria.key
      if (typeof scores[k] !== 'number') {
        scores[k] = 0
      }
    })
  }

  // 若 AI 未提供數值分數，根據 additions/deductions 與 DB 規則自動推導分數
  const getReasons = (container: any, key: string, displayName: string): string[] => {
    if (!container) return []
    if (Array.isArray(container[key])) return container[key]
    if (Array.isArray(container[displayName])) return container[displayName]
    // 嘗試鬆散匹配（名稱包含）
    const matchedKey = Object.keys(container).find(k =>
      k.toLowerCase() === key.toLowerCase() || k.includes(displayName) || displayName.includes(k)
    )
    if (matchedKey && Array.isArray(container[matchedKey])) return container[matchedKey]
    return []
  }
  const parseDeltaFromRule = (rule: string): number => {
    // 解析類似："搬得動磚頭+10分"、"展現深度理解+1分"、"表達不清晰-1分"
    const m = rule.match(/[+\-]?\d+(?:\.\d+)?(?=\s*分)/)
    return m ? Number(m[0]) : 0
  }
  if (evaluationCriteria && evaluationCriteria.length > 0) {
    evaluationCriteria.forEach((c: any) => {
      const key = c.key
      if (numericProvidedKeys.has(key)) return // 已有 AI 顯式數值，跳過
      const max = criteriaMap[key] || 10
      const logic = logicMap[key] || 'deduction'
      // 以 0 為基準，根據加分/扣分規則累加，作為「本題的加減分數」
      let value = 0
      const displayName = c.display_name || key
      const adds = getReasons(scoreData.additions, key, displayName)
      const deds = getReasons(scoreData.deductions, key, displayName)
      if (Array.isArray(adds) && c.addition_rules) {
        // addition_rules 可能是字串或陣列，統一成陣列
        const rules: string[] = Array.isArray(c.addition_rules) ? c.addition_rules : [c.addition_rules]
        adds.forEach((reason: string) => {
          const rule = rules.find(r => typeof r === 'string' && r.includes(reason))
          if (rule) value += parseDeltaFromRule(rule)
        })
      }
      if (Array.isArray(deds) && c.deduction_rules) {
        const rules: string[] = Array.isArray(c.deduction_rules) ? c.deduction_rules : [c.deduction_rules]
        deds.forEach((reason: string) => {
          const rule = rules.find(r => typeof r === 'string' && r.includes(reason))
          if (rule) value += parseDeltaFromRule(rule) // 規則內含負號
        })
      }
      // 限幅到可接受的變化範圍（-max ~ +max）
      scores[key] = Math.max(-max, Math.min(max, value))
    })
  }

  // 擷取人格判斷結果（如果模型在 SCORE JSON 中輸出了 personality 欄位）
  let personality: any | undefined = undefined
  if (scoreData && typeof scoreData === 'object' && scoreData.personality && typeof scoreData.personality === 'object') {
    personality = scoreData.personality
  }

  return {
    answerId: questionId,
    questionId: questionId,
    questionText: scoreData.questionText || '',
    answerText: scoreData.answerText || '',
    timestamp: new Date(),
    scores,
    totalScore: Number(scoreData.totalScore) || 0,
    deductions: (() => {
      const deductions: Record<string, string[]> = {}
      // 處理預設項目的扣分原因（支援 DB key 與前端 key）
      if (scoreData.deductions) {
        const map: Record<string, string> = {
          contentCompleteness: 'content_integrity',
          logicalClarity: 'logical_clarity',
          communicationSkills: 'communication'
        }
        Object.entries(map).forEach(([frontendKey, dbKey]) => {
          const list = scoreData.deductions[frontendKey] || scoreData.deductions[dbKey]
          if (Array.isArray(list)) {
            deductions[dbKey] = list
          }
        })
      }
      // 處理自訂項目的扣分原因
      if (evaluationCriteria) {
        evaluationCriteria.forEach((criteria: any) => {
          if (criteria.scoring_logic === 'deduction' && scoreData.deductions) {
            const key = criteria.key
            if (scoreData.deductions[key] && Array.isArray(scoreData.deductions[key])) {
              deductions[key] = scoreData.deductions[key]
            }
            // 也嘗試用顯示名稱
            if (scoreData.deductions[criteria.display_name] && Array.isArray(scoreData.deductions[criteria.display_name])) {
              deductions[key] = scoreData.deductions[criteria.display_name]
            }
          }
        })
      }
      // 去重每個項目的原因
      Object.keys(deductions).forEach((k) => {
        if (Array.isArray(deductions[k])) {
          deductions[k] = Array.from(new Set(deductions[k]))
        }
      })
      return deductions
    })(),
    additions: (() => {
      const additions: Record<string, string[]> = {}
      // 處理預設項目的加分原因（支援 DB key 與前端 key）
      if (scoreData.additions) {
        const map: Record<string, string> = {
          professionalDepth: 'professional_depth',
          personalTraits: 'personal_attributes'
        }
        Object.entries(map).forEach(([frontendKey, dbKey]) => {
          const list = scoreData.additions[frontendKey] || scoreData.additions[dbKey]
          if (Array.isArray(list)) {
            additions[dbKey] = list
          }
        })
      }
      // 處理自訂項目的加分原因
      if (evaluationCriteria) {
        evaluationCriteria.forEach((criteria: any) => {
          if (criteria.scoring_logic === 'addition' && scoreData.additions) {
            const key = criteria.key
            if (scoreData.additions[key] && Array.isArray(scoreData.additions[key])) {
              additions[key] = scoreData.additions[key]
            }
            // 也嘗試用顯示名稱
            if (scoreData.additions[criteria.display_name] && Array.isArray(scoreData.additions[criteria.display_name])) {
              additions[key] = scoreData.additions[criteria.display_name]
            }
          }
        })
      }
      // 去重每個項目的原因
      Object.keys(additions).forEach((k) => {
        if (Array.isArray(additions[k])) {
          additions[k] = Array.from(new Set(additions[k]))
        }
      })
      return additions
    })(),
    aiFeedback: String(scoreData.aiFeedback || ''),
    additionsDetail: typeof scoreData.additions_detail === 'string' ? scoreData.additions_detail : undefined,
    deductionsDetail: typeof scoreData.deductions_detail === 'string' ? scoreData.deductions_detail : undefined,
    personality,
  }
}

/**
 * 解析AI回應中的評分信息
 */
function parseScoreFromResponse(response: string, questionIndex?: number): AnswerScore | null {
  const scoreStartPattern = /\[SCORE_START\]([\s\S]*?)\[SCORE_END\]/
  const match = response.match(scoreStartPattern)
  
  if (!match) return null
  
  try {
    // 清理JSON字符串，移除可能的額外字符
    let jsonString = match[1].trim()
    
    // 檢查是否包含多個JSON對象（用逗號分隔）
    const jsonObjects = []
    let braceCount = 0
    let currentObject = ''
    let inString = false
    let escapeNext = false
    
    for (let i = 0; i < jsonString.length; i++) {
      const char = jsonString[i]
      
      if (escapeNext) {
        currentObject += char
        escapeNext = false
        continue
      }
      
      if (char === '\\') {
        escapeNext = true
        currentObject += char
        continue
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString
      }
      
      if (!inString) {
        if (char === '{') {
          braceCount++
        } else if (char === '}') {
          braceCount--
        }
      }
      
      currentObject += char
      
      // 當大括號平衡且不在字符串中時，表示一個完整的JSON對象
      if (braceCount === 0 && currentObject.trim().startsWith('{')) {
        jsonObjects.push(currentObject.trim())
        currentObject = ''
      }
    }
    
    // 如果沒有找到多個對象，嘗試解析單個對象
    if (jsonObjects.length === 0) {
      // 嘗試修復常見的JSON格式問題
      const jsonEndIndex = jsonString.lastIndexOf('}')
      if (jsonEndIndex !== -1) {
        jsonString = jsonString.substring(0, jsonEndIndex + 1)
      }
      
      const jsonStartIndex = jsonString.indexOf('{')
      if (jsonStartIndex !== -1) {
        jsonString = jsonString.substring(jsonStartIndex)
      }
      
      jsonString = jsonString.replace(/\n/g, ' ').replace(/\s+/g, ' ')
      jsonString = jsonString.replace(/'/g, '"')
      
      const scoreData = JSON.parse(jsonString)
      return createAnswerScore(scoreData, questionIndex)
    }
    
    // 解析多個JSON對象，返回最後一個（最新的評分）
    const lastJsonString = jsonObjects[jsonObjects.length - 1]
    
      const scoreData = JSON.parse(lastJsonString)
      // 注意：parseScoreFromResponse 中無法取得 evaluationCriteria，所以先不傳入
      // 會在 getInterviewAIResponse 中再次調用 createAnswerScore 並傳入 evaluationCriteria
      return createAnswerScore(scoreData, questionIndex)
  } catch (error) {
    console.error('解析評分信息失敗:', error)
    console.error('原始JSON字符串:', match[1])
    
    // 嘗試備用解析方法
    try {
      return parseScoreFromResponseFallback(match[1], questionIndex)
    } catch (fallbackError) {
      console.error('備用解析方法也失敗:', fallbackError)
      return null
    }
  }
}

/**
 * 備用評分解析方法 - 使用正則表達式提取分數
 */
function parseScoreFromResponseFallback(jsonString: string, questionIndex?: number): AnswerScore | null {
  try {
    // 使用正則表達式提取各個分數
    const extractNumber = (pattern: string): number => {
      const match = jsonString.match(new RegExp(pattern + '":\\s*(\\d+(?:\\.\\d+)?)'))
      return match ? parseFloat(match[1]) : 0
    }
    
    const extractArray = (pattern: string): string[] => {
      const match = jsonString.match(new RegExp(pattern + '":\\s*\\[([^\\]]*)\\]'))
      if (!match) return []
      
      // 提取數組中的字符串
      const arrayContent = match[1]
      const items = arrayContent.match(/"([^"]*)"/g)
      return items ? items.map(item => item.replace(/"/g, '')) : []
    }
    
    const scores = {
      contentCompleteness: extractNumber('"contentCompleteness"'),
      logicalClarity: extractNumber('"logicalClarity"'),
      professionalDepth: extractNumber('"professionalDepth"'),
      communicationSkills: extractNumber('"communicationSkills"'),
      personalTraits: extractNumber('"personalTraits"')
    }
    
    const totalScore = extractNumber('"totalScore"')
    
    // 提取問題和回答文本
    const questionTextMatch = jsonString.match(/"questionText":\\s*"([^"]*)"/)
    const answerTextMatch = jsonString.match(/"answerText":\\s*"([^"]*)"/)
    const questionIdMatch = jsonString.match(/"questionId":\\s*"([^"]*)"/)
    
    // 如果有 questionIndex，生成正確的 ID (Q1, Q2, Q3...)
    const questionId = questionIndex ? `Q${questionIndex}` : (questionIdMatch ? questionIdMatch[1] : generateMessageId())
    
    return {
      answerId: questionId,
      questionId: questionId,
      questionText: questionTextMatch ? questionTextMatch[1] : '',
      answerText: answerTextMatch ? answerTextMatch[1] : '',
      timestamp: new Date(),
      scores,
      totalScore,
      deductions: {
        contentCompleteness: extractArray('"contentCompleteness"'),
        logicalClarity: extractArray('"logicalClarity"'),
        communicationSkills: extractArray('"communicationSkills"')
      },
      additions: {
        professionalDepth: extractArray('"professionalDepth"'),
        personalTraits: extractArray('"personalTraits"')
      },
      aiFeedback: ''
    }
  } catch (error) {
    console.error('備用解析方法失敗:', error)
    return null
  }
}

/**
 * 記錄評分結果到控制台
 */
function logScoreResult(answerScore: AnswerScore): void {
  console.log('=== 面試評分結果 ===')
  console.log(`問題: ${answerScore.questionText}`)
  console.log(`回答: ${answerScore.answerText}`)
  console.log('--- 各項評分 ---')
  
  // 動態顯示所有評估項目的分數
  Object.entries(answerScore.scores).forEach(([key, score]) => {
    const criteriaNames: Record<string, string> = {
      contentCompleteness: '內容完整性',
      logicalClarity: '邏輯清晰度',
      professionalDepth: '專業深度',
      communicationSkills: '溝通表達',
      personalTraits: '個人特質'
    }
    const displayName = criteriaNames[key] || key
    console.log(`${displayName}: ${score}/10`)
  })
  
  console.log(`總分: ${answerScore.totalScore.toFixed(1)}/10`)
  
  // 扣分原因（動態顯示）
  Object.entries(answerScore.deductions).forEach(([key, reasons]) => {
    if (Array.isArray(reasons) && reasons.length > 0) {
      const criteriaNames: Record<string, string> = {
        contentCompleteness: '內容完整性',
        logicalClarity: '邏輯清晰度',
        communicationSkills: '溝通表達'
      }
      const displayName = criteriaNames[key] || key
      console.log(`扣分原因 (${displayName}):`, reasons)
    }
  })
  if (answerScore.deductionsDetail) {
    console.log('扣分細節:', answerScore.deductionsDetail)
  }
  
  // 加分原因（動態顯示）
  Object.entries(answerScore.additions).forEach(([key, reasons]) => {
    if (Array.isArray(reasons) && reasons.length > 0) {
      const criteriaNames: Record<string, string> = {
        professionalDepth: '專業深度',
        personalTraits: '個人特質'
      }
      const displayName = criteriaNames[key] || key
      console.log(`加分原因 (${displayName}):`, reasons)
    }
  })
  if (answerScore.additionsDetail) {
    console.log('加分細節:', answerScore.additionsDetail)
  }
  
  console.log('==================')
}

/**
 * 觸發面試AI的TTS播放（包含情感標籤）
 * 注意：情感標籤會在 TTS 實際開始播放時（即 model.speak() 調用時）應用到 VRM 表情
 */
function triggerInterviewTTS(text: string, emotion: string = 'neutral') {
  if (!text || text.trim() === '') return
  
  const sessionId = generateMessageId()
  const talk: Talk = {
    message: text,
    emotion: emotion as any // 確保情感標籤符合 EmotionType
  }
  
  // 異步觸發TTS，不等待完成
  // 情感表情會在 VRM model.speak() 方法中實際應用
  speakCharacter(sessionId, talk)
}

/**
 * 獲取面試AI的回覆（包含TTS）
 */
export async function getInterviewAIResponse(
  messages: Message[], 
  questionIndex?: number,
  interviewQuestions?: string[],
  evaluationCriteria?: any[],
  trackingId?: string
) {
  const {
    aiApiKey,
    selectAIService,
    selectAIModel,
    localLlmUrl,
    azureEndpoint,
    temperature,
    maxTokens,
    customApiUrl,
    customApiHeaders,
    customApiBody,
    customApiIncludeMimeType,
  } = getAIConfig()

  // 檢測用戶語言
  const lastUserMessage = messages.filter((msg) => msg.role === 'user').pop()
  const userLanguage = lastUserMessage && typeof lastUserMessage.content === 'string' 
    ? detectUserLanguage(lastUserMessage.content) 
    : '繁體中文'

  // 檢測當前面試階段
  const currentStage = detectInterviewStage(messages)

  // 格式化對話歷史
  const conversationHistory = formatConversationHistory(messages)

  // 格式化人格判斷問題列表（固定題目，優先於一般職務相關問題）
  const personalityQuestionsText =
    PERSONALITY_QUESTION_LIST && PERSONALITY_QUESTION_LIST.length > 0
      ? PERSONALITY_QUESTION_LIST.map((q, idx) => `性格問題 ${idx + 1}：${q}`).join('\n')
      : '（目前未設定人格判斷用問題，可直接依一般面試問題與對話內容自行判斷性格傾向。）'

  // 格式化一般問題列表
  // 注意：這些問題需要在自我介紹完成、且人格相關問題問完後才開始提問
  const questionsText = interviewQuestions && interviewQuestions.length > 0
    ? `以下一般面試問題請在完成自我介紹與人格相關問題之後，按照順序逐一提問：\n${interviewQuestions.map((q, idx) => `問題 ${idx + 1}：${q}`).join('\n')}\n\n提醒：這些問題不能在第一句話就問，必須先完成打招呼、自我介紹與人格相關問題的步驟。`
    : '無特定一般面試問題列表，可在完成人格相關問題後，根據對話內容自然提問。'

  // 格式化評分標準
  let scoringCriteriaText = ''
  if (evaluationCriteria && evaluationCriteria.length > 0) {
    scoringCriteriaText = evaluationCriteria.map((criteria: any) => {
      const logic = criteria.scoring_logic || 'deduction'
      const maxScore = criteria.max_score || 10
      // 處理 JSONB 數組格式的規則
      let rules = ''
      if (logic === 'addition') {
        const additionRules = Array.isArray(criteria.addition_rules) 
          ? criteria.addition_rules 
          : (criteria.addition_rules ? [criteria.addition_rules] : [])
        rules = `加分規則：${additionRules.filter((r: any) => r && r.trim()).join('，') || '無特定規則'}`
      } else if (logic === 'deduction') {
        const deductionRules = Array.isArray(criteria.deduction_rules) 
          ? criteria.deduction_rules 
          : (criteria.deduction_rules ? [criteria.deduction_rules] : [])
        rules = `扣分規則：${deductionRules.filter((r: any) => r && r.trim()).join('，') || '無特定規則'}`
      } else {
        // 綜合制：同時支援加分與扣分規則
        const additionRules = Array.isArray(criteria.addition_rules) 
          ? criteria.addition_rules 
          : (criteria.addition_rules ? [criteria.addition_rules] : [])
        const deductionRules = Array.isArray(criteria.deduction_rules) 
          ? criteria.deduction_rules 
          : (criteria.deduction_rules ? [criteria.deduction_rules] : [])
        const additionText = additionRules.filter((r: any) => r && r.trim()).join('，') || '無特定加分規則'
        const deductionText = deductionRules.filter((r: any) => r && r.trim()).join('，') || '無特定扣分規則'
        rules = `加分規則：${additionText}；扣分規則：${deductionText}`
      }
      
      let logicDesc = ''
      let initialValue = ''
      if (logic === 'addition') {
        logicDesc = '加分制（初始值0分，只會加分）'
        initialValue = '0分'
      } else if (logic === 'deduction') {
        logicDesc = '扣分制（初始值滿分，只會扣分）'
        initialValue = `${maxScore}分（滿分）`
      } else {
        logicDesc = '綜合制（初始值0分，可以同時加分與扣分）'
        initialValue = '0分'
      }

      return `${criteria.display_name} (${criteria.key}) - 滿分${maxScore}分，${logicDesc}，初始值：${initialValue}，${rules}`
    }).join('\n')
  } else {
    // 理論上不會執行（資料庫 trigger 會自動插入預設值），僅作為備用
    scoringCriteriaText = '請使用預設評分標準進行評分'
  }

  // 創建面試專用的系統消息
  const interviewSystemMessage: Message = {
    role: 'system',
    content: formatPrompt(INTERVIEW_PROMPT_TEMPLATES.SYSTEM_PROMPT, {
      userLanguage,
      conversationHistory,
      currentStage,
      interviewQuestions: questionsText,
      personalityQuestions: personalityQuestionsText,
      scoringCriteria: scoringCriteriaText
    }),
  }

  // 將系統消息添加到消息列表開頭
  const processedMessages = [interviewSystemMessage, ...messages]

  // 🔍 DEBUG: 在發送前輸出完整的 prompt 到 console
  console.log('='.repeat(80))
  console.log('📤 Interview System Prompt:')
  console.log('='.repeat(80))
  console.log(interviewSystemMessage.content)
  console.log('='.repeat(80))

  // APIエンドポイントを決定
  const apiEndpoint = getApiEndpoint(selectAIService)

  try {
    // 記錄 API 調用開始時間（如果傳入了 trackingId）
    if (trackingId && typeof window !== 'undefined') {
      // 這個時間點已經在 InterviewInterface 中記錄了，這裡可以記錄額外的處理時間
      const apiCallStartTime = performance.now()
      // 可以記錄到 sessionStorage 以便追蹤
    }
    
    // 共通リクエストデータ
    const requestData: any = {
      messages: processedMessages,
      stream: false,
    }

    // サービスタイプに応じてリクエストデータを追加
    if (selectAIService === 'custom-api') {
      // カスタムAPI用データ
      const filteredMessages = getAIConfig().includeSystemMessagesInCustomApi
        ? processedMessages
        : processedMessages.filter((message) => message.role !== 'system')

      Object.assign(requestData, {
        customApiUrl,
        customApiHeaders,
        customApiBody,
        temperature,
        maxTokens,
        customApiIncludeMimeType,
        messages: filteredMessages, // フィルタリングされたメッセージを使用
      })
    } else {
      // Vercel AI SDK用データ
      Object.assign(requestData, {
        apiKey: aiApiKey,
        aiService: selectAIService,
        model: selectAIModel,
        localLlmUrl,
        azureEndpoint,
        temperature,
        maxTokens,
      })
    }

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    })

    if (!response.ok) {
      const responseBody = await response.json()
      throw new Error(
        `API request to ${selectAIService} failed with status ${response.status} and body ${responseBody.error}`,
        { cause: { errorCode: responseBody.errorCode } }
      )
    }

    const data = await response.json()
    
    // 解析情感標籤和評分信息
    if (data.text) {
      const parsedResponse = parseInterviewResponse(data.text)
      const { emotion, score, cleanResponse } = parsedResponse
      
      // 處理評分結果
      let scoreResult = null
      if (score) {
        scoreResult = createAnswerScore(score, questionIndex, evaluationCriteria)
        if (scoreResult) {
          logScoreResult(scoreResult)
        }
      }
      
      // 如果AI回應成功，觸發TTS（包含情感標籤）
      triggerInterviewTTS(cleanResponse, emotion)
      
      return { 
        text: cleanResponse,
        emotion: emotion,
        scoreResult: scoreResult || undefined
      }
    }
    
    return { text: data.text }
  } catch (error: any) {
    console.error(`Error fetching ${selectAIService} API response:`, error)
    const errorCode = error.cause
      ? error.cause.errorCode || 'AIAPIError'
      : 'AIAPIError'
    return { text: handleApiError(errorCode) }
  }
}

/**
 * 獲取面試AI的串流回覆（包含TTS）
 */
export async function getInterviewAIResponseStream(
  messages: Message[],
  questionIndex?: number,
  interviewQuestions?: string[],
  evaluationCriteria?: any[],
  trackingId?: string
): Promise<ReadableStream<string>> {
  const {
    aiApiKey,
    selectAIService,
    selectAIModel,
    localLlmUrl,
    azureEndpoint,
    temperature,
    maxTokens,
    customApiUrl,
    customApiHeaders,
    customApiBody,
    customApiIncludeMimeType,
  } = getAIConfig()

  // 檢測用戶語言
  const lastUserMessage = messages.filter((msg) => msg.role === 'user').pop()
  const userLanguage = lastUserMessage && typeof lastUserMessage.content === 'string' 
    ? detectUserLanguage(lastUserMessage.content) 
    : '繁體中文'

  // 檢測當前面試階段
  const currentStage = detectInterviewStage(messages)

  // 格式化對話歷史
  const conversationHistory = formatConversationHistory(messages)

  // 格式化人格判斷問題列表（固定題目，優先於一般職務相關問題）
  const personalityQuestionsText =
    PERSONALITY_QUESTION_LIST && PERSONALITY_QUESTION_LIST.length > 0
      ? PERSONALITY_QUESTION_LIST.map((q, idx) => `性格問題 ${idx + 1}：${q}`).join('\n')
      : '（目前未設定人格判斷用問題，可直接依一般面試問題與對話內容自行判斷性格傾向。）'

  // 格式化一般問題列表
  // 注意：這些問題需要在自我介紹完成、且人格相關問題問完後才開始提問
  const questionsText = interviewQuestions && interviewQuestions.length > 0
    ? `以下一般面試問題請在完成自我介紹與人格相關問題之後，按照順序逐一提問：\n${interviewQuestions.map((q, idx) => `問題 ${idx + 1}：${q}`).join('\n')}\n\n提醒：這些問題不能在第一句話就問，必須先完成打招呼、自我介紹與人格相關問題的步驟。`
    : '無特定一般面試問題列表，可在完成人格相關問題後，根據對話內容自然提問。'

  // 格式化評分標準
  let scoringCriteriaText = ''
  if (evaluationCriteria && evaluationCriteria.length > 0) {
    scoringCriteriaText = evaluationCriteria.map((criteria: any) => {
      const logic = criteria.scoring_logic || 'deduction'
      const maxScore = criteria.max_score || 10
      // 處理 JSONB 數組格式的規則
      let rules = ''
      if (logic === 'addition') {
        const additionRules = Array.isArray(criteria.addition_rules) 
          ? criteria.addition_rules 
          : (criteria.addition_rules ? [criteria.addition_rules] : [])
        rules = `加分規則：${additionRules.filter((r: any) => r && r.trim()).join('，') || '無特定規則'}`
      } else if (logic === 'deduction') {
        const deductionRules = Array.isArray(criteria.deduction_rules) 
          ? criteria.deduction_rules 
          : (criteria.deduction_rules ? [criteria.deduction_rules] : [])
        rules = `扣分規則：${deductionRules.filter((r: any) => r && r.trim()).join('，') || '無特定規則'}`
      } else {
        // 綜合制：同時支援加分與扣分規則
        const additionRules = Array.isArray(criteria.addition_rules) 
          ? criteria.addition_rules 
          : (criteria.addition_rules ? [criteria.addition_rules] : [])
        const deductionRules = Array.isArray(criteria.deduction_rules) 
          ? criteria.deduction_rules 
          : (criteria.deduction_rules ? [criteria.deduction_rules] : [])
        const additionText = additionRules.filter((r: any) => r && r.trim()).join('，') || '無特定加分規則'
        const deductionText = deductionRules.filter((r: any) => r && r.trim()).join('，') || '無特定扣分規則'
        rules = `加分規則：${additionText}；扣分規則：${deductionText}`
      }
      
      let logicDesc = ''
      let initialValue = ''
      if (logic === 'addition') {
        logicDesc = '加分制（初始值0分，只會加分）'
        initialValue = '0分'
      } else if (logic === 'deduction') {
        logicDesc = '扣分制（初始值滿分，只會扣分）'
        initialValue = `${maxScore}分（滿分）`
      } else {
        logicDesc = '綜合制（初始值0分，可以同時加分與扣分）'
        initialValue = '0分'
      }

      return `${criteria.display_name} (${criteria.key}) - 滿分${maxScore}分，${logicDesc}，初始值：${initialValue}，${rules}`
    }).join('\n')
  } else {
    // 理論上不會執行（資料庫 trigger 會自動插入預設值），僅作為備用
    scoringCriteriaText = '請使用預設評分標準進行評分'
  }

  // 創建面試專用的系統消息
  const interviewSystemMessage: Message = {
    role: 'system',
    content: formatPrompt(INTERVIEW_PROMPT_TEMPLATES.SYSTEM_PROMPT, {
      userLanguage,
      conversationHistory,
      currentStage,
      interviewQuestions: questionsText,
      personalityQuestions: personalityQuestionsText,
      scoringCriteria: scoringCriteriaText
    }),
  }

  // 將系統消息添加到消息列表開頭
  const processedMessages = [interviewSystemMessage, ...messages]

  // APIエンドポイントを決定
  const apiEndpoint = getApiEndpoint(selectAIService)

  // 共通リクエストデータ
  const requestData: any = {
    messages: processedMessages,
    stream: true,
  }

  // サービスタイプに応じてリクエストデータを追加
  if (selectAIService === 'custom-api') {
    // カスタムAPI用データ
    const filteredMessages = getAIConfig().includeSystemMessagesInCustomApi
      ? processedMessages
      : processedMessages.filter((message) => message.role !== 'system')

    Object.assign(requestData, {
      customApiUrl,
      customApiHeaders,
      customApiBody,
      temperature,
      maxTokens,
      customApiIncludeMimeType,
      messages: filteredMessages, // フィルタリングされたメッセージを使用
    })
  } else {
    // Vercel AI SDK用データ
    Object.assign(requestData, {
      apiKey: aiApiKey,
      aiService: selectAIService,
      model: selectAIModel,
      localLlmUrl,
      azureEndpoint,
      temperature,
      maxTokens,
    })
  }

  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestData),
  })

  try {
    if (!response.ok) {
      const responseBody = await response.json()
      throw new Error(
        `API request to ${selectAIService} failed with status ${response.status} and body ${responseBody.error}`,
        { cause: { errorCode: responseBody.errorCode } }
      )
    }

    return new ReadableStream({
      async start(controller) {
        if (!response.body) {
          throw new Error(
            `API response from ${selectAIService} is empty, status ${response.status}`,
            { cause: { errorCode: 'AIAPIError' } }
          )
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let buffer = ''
        let fullResponse = '' // 收集完整的回應用於最終解析
        let displayBuffer = '' // 用於顯示的緩衝區（已清理標籤）
        
        // 標籤解析狀態
        let emotionExtracted = false
        let currentEmotion = 'neutral'
        
        // 狀態機：用於解析標籤
        type TagType = 'CONTENT' | 'SCORE' | 'EMOTION' | null
        let currentTag: TagType = null
        let tagBuffer = '' // 用於累積標籤名稱（從 [ 到 ]）
        let contentBuffer = '' // 用於累積標籤內容（從 ] 到下一個 [）
        let inTagName = false // 是否正在解析標籤名稱（在 [ 和 ] 之間）
        let bracketDepth = 0 // 用於追蹤嵌套的 [ ]
        let contentBufferReturnedLength = 0 // 記錄已經返回的 contentBuffer 長度，避免重複
        
        // 記錄 API 調用開始時間（如果傳入了 trackingId）
        if (trackingId && typeof window !== 'undefined') {
          responseTimeTracker.recordApiCallStart(trackingId)
        }

        /**
         * 處理文字塊，解析標籤並返回可顯示的內容
         * 使用狀態機方式處理跨 chunk 的標籤
         * 邏輯：第一次收到 [ 到 ] 為止的內容先判斷是什麼標籤
         * 直到下一次收到 [ 之前的內容為該標籤的 value
         * 收到 ] 則代表該標籤以及內容的結束
         */
        const processTextChunk = (textChunk: string): string => {
          fullResponse += textChunk
          let newContent = '' // 本次新增的內容
          
          for (let i = 0; i < textChunk.length; i++) {
            const char = textChunk[i]
            
            if (char === '[' && !inTagName) {
              // 開始新的標籤
              // 如果之前在 CONTENT 標籤中，先輸出剩餘的內容
              if (currentTag === 'CONTENT' && contentBuffer.length > contentBufferReturnedLength) {
                newContent += contentBuffer.substring(contentBufferReturnedLength)
                contentBuffer = ''
                contentBufferReturnedLength = 0
              }
              
              // 如果之前在 SCORE 或 EMOTION 標籤中，清空緩衝區
              if (currentTag === 'SCORE' || currentTag === 'EMOTION') {
                contentBuffer = ''
              }
              
              inTagName = true
              bracketDepth = 1
              tagBuffer = ''
              currentTag = null
            } else if (char === ']' && inTagName) {
              // 標籤名稱結束
              bracketDepth--
              if (bracketDepth === 0) {
                // 判斷標籤類型
                const tagName = tagBuffer.trim()
                if (tagName === 'CONTENT_START') {
                  currentTag = 'CONTENT'
                  contentBuffer = ''
                  contentBufferReturnedLength = 0
                } else if (tagName === 'CONTENT_END') {
                  // CONTENT 標籤結束，輸出剩餘內容
                  if (currentTag === 'CONTENT') {
                    if (contentBuffer.length > contentBufferReturnedLength) {
                      newContent += contentBuffer.substring(contentBufferReturnedLength)
                    }
                    contentBuffer = ''
                    contentBufferReturnedLength = 0
                  }
                  currentTag = null
                } else if (tagName === 'SCORE_START') {
                  currentTag = 'SCORE'
                  contentBuffer = ''
                  // 確保不會有內容被返回
                  contentBufferReturnedLength = 0
                } else if (tagName === 'SCORE_END') {
                  // SCORE 標籤結束，不輸出但保存內容到 fullResponse（用於後續解析）
                  if (currentTag === 'SCORE') {
                    // 內容已經在 fullResponse 中，這裡只需要清空緩衝區
                    contentBuffer = ''
                    contentBufferReturnedLength = 0
                  }
                  currentTag = null
                } else if (tagName === 'EMOTION_START') {
                  currentTag = 'EMOTION'
                  contentBuffer = ''
                } else if (tagName === 'EMOTION_END') {
                  // EMOTION 標籤結束，提取情感但不輸出
                  if (currentTag === 'EMOTION') {
                    const emotion = contentBuffer.trim()
                    if (emotion && ['neutral', 'happy', 'angry', 'sad', 'relaxed', 'surprised'].includes(emotion)) {
                      currentEmotion = emotion
                      emotionExtracted = true
                    }
                    contentBuffer = ''
                  }
                  currentTag = null
                }
                
                inTagName = false
                tagBuffer = ''
              } else {
                tagBuffer += char
              }
            } else if (inTagName) {
              // 在標籤名稱中
              if (char === '[') {
                bracketDepth++
              }
              tagBuffer += char
            } else {
              // 在標籤內容中或標籤外
              if (currentTag === 'CONTENT') {
                // CONTENT 標籤的內容需要顯示
                contentBuffer += char
              } else if (currentTag === 'SCORE' || currentTag === 'EMOTION') {
                // SCORE 和 EMOTION 標籤的內容不顯示，但需要累積
                contentBuffer += char
              } else {
                // 不在任何標籤中，不應該輸出（因為所有內容都應該在 CONTENT 標籤中）
                // 如果遇到這種情況，可能是標籤解析出現問題，忽略該字符
                // 不添加到 newContent，避免輸出不應該顯示的內容
              }
            }
          }
          
          // 如果當前在 CONTENT 標籤中，返回新增的內容（相對於上次返回的內容）
          if (currentTag === 'CONTENT' && contentBuffer.length > contentBufferReturnedLength) {
            const newContentFromBuffer = contentBuffer.substring(contentBufferReturnedLength)
            newContent += newContentFromBuffer
            contentBufferReturnedLength = contentBuffer.length
          }
          
          // 返回新增的內容
          return newContent
        }

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (line.startsWith('0:')) {
                const content = line.substring(2).trim()
                try {
                  const decodedContent = JSON.parse(content)
                  const textChunk = String(decodedContent)
                  const displayChunk = processTextChunk(textChunk)
                  if (displayChunk) {
                    displayBuffer += displayChunk
                    controller.enqueue(displayChunk)
                  }
                } catch (error) {
                  console.error('Error parsing 0: content:', error)
                }
              } else if (line.startsWith('data:')) {
                // OpenAI API形式的串流數據
                const content = line.substring(5).trim()
                if (content === '[DONE]') continue

                try {
                  const data = JSON.parse(content)
                  const text = data.choices?.[0]?.delta?.content
                  if (text) {
                    const displayChunk = processTextChunk(text)
                    if (displayChunk) {
                      displayBuffer += displayChunk
                      controller.enqueue(displayChunk)
                    }
                  }
                } catch (error) {
                  console.error('Error parsing JSON:', error)
                }
              } else if (line.startsWith('3:')) {
                const content = line.substring(2).trim()
                const decodedContent = JSON.parse(content)

                console.error(
                  `Error fetching ${selectAIService} API response:`,
                  decodedContent
                )
                toastStore.getState().addToast({
                  message: decodedContent,
                  type: 'error',
                  tag: 'interview-api-error',
                })
              } else if (line.startsWith('9:')) {
                // Anthropicのツール呼び出し情報を処理
                const content = line.substring(2).trim()
                try {
                  const decodedContent = JSON.parse(content)
                  if (decodedContent.toolName) {
                    console.log(`Tool called: ${decodedContent.toolName}`)
                    const message = i18next.t('Toasts.UsingTool', {
                      toolName: decodedContent.toolName,
                    })
                    toastStore.getState().addToast({
                      message,
                      type: 'tool',
                      tag: `interview-tool-info-${decodedContent.toolName}`,
                      duration: 3000,
                    })
                  }
                } catch (error) {
                  console.error('Error parsing tool call JSON:', error)
                }
              } else if (line.startsWith('e:') || line.startsWith('d:')) {
                continue
              } else if (line.match(/^([a-z]|\d):/)) {
                // これらは通常、ストリームの終了やメタデータを示すものであり、コンテンツではない
                continue
              } else if (line.trim() !== '') {
                // Ollamaなど、JSONLフォーマットのストリーミングデータに対応
                try {
                  const data = JSON.parse(line)
                  // Ollama形式: {"message":{"role":"assistant","content":"テキスト"}}
                  if (data.message?.content) {
                    const displayChunk = processTextChunk(data.message.content)
                    if (displayChunk) {
                      displayBuffer += displayChunk
                      controller.enqueue(displayChunk)
                    }
                  }
                } catch (error) {
                  console.error('Error parsing JSONL:', error, line)
                }
              }
            }
          }
          
          // 記錄 API 調用結束時間
          if (trackingId && typeof window !== 'undefined') {
            responseTimeTracker.recordApiCallEnd(trackingId)
          }
          
          // 串流結束後，解析完整回應中的評分信息
          if (fullResponse.trim()) {
            const parsedResponse = parseInterviewResponse(fullResponse)
            const { emotion: finalEmotion, score, cleanResponse } = parsedResponse
            
            // 使用解析出的情感（如果已提取則使用已提取的，否則使用解析出的）
            const emotion = emotionExtracted ? currentEmotion : finalEmotion
            
            // 處理評分結果
            let scoreResult = null
            if (score) {
              scoreResult = createAnswerScore(score, questionIndex, evaluationCriteria)
              if (scoreResult) {
                logScoreResult(scoreResult)
              }
            }
            
            // 將最終結果（情感、評分）附加到流中，使用特殊格式傳遞
            // 使用特殊標記來傳遞元數據
            const metadata = JSON.stringify({
              type: 'metadata',
              emotion,
              scoreResult,
              cleanResponse: displayBuffer.trim() || cleanResponse
            })
            controller.enqueue(`\n[INTERVIEW_METADATA_START]${metadata}[INTERVIEW_METADATA_END]`)
          }
        } catch (error) {
          console.error(
            `Error fetching ${selectAIService} API response:`,
            error
          )

          const errorMessage = handleApiError('AIAPIError')
          toastStore.getState().addToast({
            message: errorMessage,
            type: 'error',
            tag: 'interview-api-error',
          })
        } finally {
          controller.close()
          reader.releaseLock()
        }
      },
    })
  } catch (error: any) {
    const errorMessage = handleApiError(
      error.cause ? error.cause.errorCode : 'AIAPIError'
    )
    toastStore.getState().addToast({
      message: errorMessage,
      type: 'error',
      tag: 'interview-api-error',
    })
    throw error
  }
}