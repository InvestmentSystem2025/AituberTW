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
  parseInterviewResponse
} from './interviewPromptTemplates'
import { InterviewScoringEngine } from '@/features/interview/interviewScoring'
import { AnswerScore } from '@/types/interviewScoring'
import { speakCharacter } from '../messages/speakCharacter'
import { generateMessageId } from '@/utils/messageUtils'

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
  const logicMap: Record<string, 'addition' | 'deduction'> = {}
  if (evaluationCriteria && evaluationCriteria.length > 0) {
    evaluationCriteria.forEach((criteria: any) => {
      const criteriaKey = criteria.key
      criteriaMap[criteriaKey] = criteria.max_score || 10
      logicMap[criteriaKey] = (criteria.scoring_logic === 'addition' ? 'addition' : 'deduction')
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
  const rawScores: Record<string, number> = {}
  const scores: Record<string, number> = {}
  const numericProvidedKeys = new Set<string>()
  // 預先根據 scoring_logic 設定初始值（addition=0，deduction=max_score）
  if (evaluationCriteria && evaluationCriteria.length > 0) {
    evaluationCriteria.forEach((c: any) => {
      const key = c.key
      const max = criteriaMap[key] || 10
      const init = (logicMap[key] === 'addition') ? 0 : max
      scores[key] = init
    })
  }
  
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
      rawScores[dbKey] = Number(found) || 0
      const maxScore = criteriaMap[dbKey] || 10
      // 若未在 evaluationCriteria 中（沒有 logicMap），預設扣分制視為滿分起始
      if (typeof scores[dbKey] !== 'number') {
        scores[dbKey] = (logicMap[dbKey] === 'addition') ? 0 : maxScore
      }
      scores[dbKey] = Math.max(0, Math.min(maxScore, rawScores[dbKey]))
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
        
        // 如果找到了分數，加入 scores
        if (scoreValue !== undefined) {
          rawScores[criteriaKey] = scoreValue
          const maxScore = criteria.max_score || 10
          // 先確保有初始化（addition=0，deduction=max）
          if (typeof scores[criteriaKey] !== 'number') {
            scores[criteriaKey] = (logicMap[criteriaKey] === 'addition') ? 0 : maxScore
          }
          scores[criteriaKey] = Math.max(0, Math.min(maxScore, scoreValue))
          if (rawScores[criteriaKey] !== scores[criteriaKey]) {
            console.warn(`⚠️ 分數超過限制：${criteriaKey} 原始分數 ${rawScores[criteriaKey]} 已調整為 ${scores[criteriaKey]}`)
          }
          numericProvidedKeys.add(criteriaKey)
        }
      }
    })
  }

  // 規範化：確保所有 evaluation_criteria 的 key 都存在於 scores（使用 scoring_logic 初始值）
  if (evaluationCriteria && evaluationCriteria.length > 0) {
    evaluationCriteria.forEach((criteria: any) => {
      const k = criteria.key
      if (typeof scores[k] !== 'number') {
        const max = criteriaMap[k] || 10
        scores[k] = (logicMap[k] === 'addition') ? 0 : max
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
      if (numericProvidedKeys.has(key)) return // 已有數值，跳過
      const max = criteriaMap[key] || 10
      let value = (logicMap[key] === 'addition') ? 0 : max
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
      // 限幅
      scores[key] = Math.max(0, Math.min(max, value))
    })
  }
  
  // 如果原始分數超過限制，輸出警告（僅對預設項目）
  defaultKeys.forEach(key => {
    if (rawScores[key] !== undefined && scores[key] !== undefined && rawScores[key] !== scores[key]) {
      console.warn(`⚠️ 分數超過限制：${key} 原始分數 ${rawScores[key]} 已調整為 ${scores[key]}`)
    }
  })
  
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
    deductionsDetail: typeof scoreData.deductions_detail === 'string' ? scoreData.deductions_detail : undefined
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

  // 格式化問題列表
  // 注意：這些問題需要在自我介紹完成後才開始提問
  const questionsText = interviewQuestions && interviewQuestions.length > 0
    ? `以下問題請在面試者完成自我介紹後，按照順序逐一提問：\n${interviewQuestions.map((q, idx) => `問題 ${idx + 1}：${q}`).join('\n')}\n\n提醒：這些問題不能在第一句話就問，必須先完成打招呼和請自我介紹的步驟。`
    : '無特定問題列表，請根據對話內容自然提問。'

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
        rules = additionRules.filter((r: any) => r && r.trim()).join('，')
      } else {
        const deductionRules = Array.isArray(criteria.deduction_rules) 
          ? criteria.deduction_rules 
          : (criteria.deduction_rules ? [criteria.deduction_rules] : [])
        rules = deductionRules.filter((r: any) => r && r.trim()).join('，')
      }
      
      const initialValue = logic === 'addition' ? '0分' : `${maxScore}分（滿分）`
      return `${criteria.display_name} (${criteria.key}) - 滿分${maxScore}分，${logic === 'addition' ? '加分制（初始值0分）' : '扣分制（初始值滿分）'}，初始值：${initialValue}，${logic === 'addition' ? '加分' : '扣分'}規則：${rules || '無特定規則'}`
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
  interviewQuestions?: string[],
  evaluationCriteria?: any[]
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

  // 格式化問題列表
  // 注意：這些問題需要在自我介紹完成後才開始提問
  const questionsText = interviewQuestions && interviewQuestions.length > 0
    ? `以下問題請在面試者完成自我介紹後，按照順序逐一提問：\n${interviewQuestions.map((q, idx) => `問題 ${idx + 1}：${q}`).join('\n')}\n\n提醒：這些問題不能在第一句話就問，必須先完成打招呼和請自我介紹的步驟。`
    : '無特定問題列表，請根據對話內容自然提問。'

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
        rules = additionRules.filter((r: any) => r && r.trim()).join('，')
      } else {
        const deductionRules = Array.isArray(criteria.deduction_rules) 
          ? criteria.deduction_rules 
          : (criteria.deduction_rules ? [criteria.deduction_rules] : [])
        rules = deductionRules.filter((r: any) => r && r.trim()).join('，')
      }
      
      const initialValue = logic === 'addition' ? '0分' : `${maxScore}分（滿分）`
      return `${criteria.display_name} (${criteria.key}) - 滿分${maxScore}分，${logic === 'addition' ? '加分制（初始值0分）' : '扣分制（初始值滿分）'}，初始值：${initialValue}，${logic === 'addition' ? '加分' : '扣分'}規則：${rules || '無特定規則'}`
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
        let fullResponse = '' // 收集完整的回應用於TTS
        // 緩衝評分區塊，避免在 [SCORE_START] 與 [SCORE_END] 之間的內容被直接輸出到UI
        let inScoreBlock = false
        let scoreBlockBuffer = ''

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
                const decodedContent = JSON.parse(content)
                const textChunk = String(decodedContent)
                if (textChunk.includes('[SCORE_START]')) inScoreBlock = true
                if (inScoreBlock) {
                  scoreBlockBuffer += textChunk
                  if (textChunk.includes('[SCORE_END]')) {
                    inScoreBlock = false
                    scoreBlockBuffer = ''
                  }
                } else {
                  fullResponse += textChunk
                  controller.enqueue(textChunk)
                }
              } else if (line.startsWith('data:')) {
                // OpenAI API形式のストリームデータに対応
                const content = line.substring(5).trim() // 'data:' プレフィックスを除去
                if (content === '[DONE]') continue // 終了マーカーは無視

                try {
                  const data = JSON.parse(content)
                  const text = data.choices?.[0]?.delta?.content
                  if (text) {
                    if (text.includes('[SCORE_START]')) inScoreBlock = true
                    if (inScoreBlock) {
                      scoreBlockBuffer += text
                      if (text.includes('[SCORE_END]')) {
                        inScoreBlock = false
                        scoreBlockBuffer = ''
                      }
                    } else {
                      fullResponse += text
                      controller.enqueue(text)
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
                    fullResponse += data.message.content
                    controller.enqueue(data.message.content)
                  }
                } catch (error) {
                  console.error('Error parsing JSONL:', error, line)
                }
              }
            }
          }
          // 解析情感標籤和評分信息
          if (fullResponse.trim()) {
            const parsedResponse = parseInterviewResponse(fullResponse)
            const { emotion, score, cleanResponse } = parsedResponse
            
            // 處理評分結果
            if (score) {
              const scoreResult = createAnswerScore(score)
              if (scoreResult) {
                logScoreResult(scoreResult)
              }
            }
            
            //一時停止暫停TTS
            // 串流結束後觸發TTS（包含情感標籤）
            // triggerInterviewTTS(cleanResponse, emotion)
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