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
function createAnswerScore(scoreData: any, questionIndex?: number): AnswerScore | null {
  // 驗證必要的字段
  if (!scoreData.scores || typeof scoreData.scores !== 'object') {
    console.warn('評分數據缺少scores字段或格式不正確')
    return null
  }
  
  // 如果有 questionIndex，生成正確的 ID (Q1, Q2, Q3...)
  const questionId = questionIndex ? `Q${questionIndex}` : (scoreData.questionId || generateMessageId())
  
  return {
    answerId: questionId,
    questionId: questionId,
    questionText: scoreData.questionText || '',
    answerText: scoreData.answerText || '',
    timestamp: new Date(),
    scores: {
      contentCompleteness: Number(scoreData.scores.contentCompleteness) || 0,
      logicalClarity: Number(scoreData.scores.logicalClarity) || 0,
      professionalDepth: Number(scoreData.scores.professionalDepth) || 0,
      communicationSkills: Number(scoreData.scores.communicationSkills) || 0,
      personalTraits: Number(scoreData.scores.personalTraits) || 0
    },
    totalScore: Number(scoreData.totalScore) || 0,
    deductions: {
      contentCompleteness: Array.isArray(scoreData.deductions?.contentCompleteness) ? scoreData.deductions.contentCompleteness : [],
      logicalClarity: Array.isArray(scoreData.deductions?.logicalClarity) ? scoreData.deductions.logicalClarity : [],
      communicationSkills: Array.isArray(scoreData.deductions?.communicationSkills) ? scoreData.deductions.communicationSkills : []
    },
    additions: {
      professionalDepth: Array.isArray(scoreData.additions?.professionalDepth) ? scoreData.additions.professionalDepth : [],
      personalTraits: Array.isArray(scoreData.additions?.personalTraits) ? scoreData.additions.personalTraits : []
    },
    aiFeedback: String(scoreData.aiFeedback || '')
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
  console.log(`內容完整性: ${answerScore.scores.contentCompleteness}/10`)
  console.log(`邏輯清晰度: ${answerScore.scores.logicalClarity}/10`)
  console.log(`專業深度: ${answerScore.scores.professionalDepth}/10`)
  console.log(`溝通表達: ${answerScore.scores.communicationSkills}/10`)
  console.log(`個人特質: ${answerScore.scores.personalTraits}/10`)
  console.log(`總分: ${answerScore.totalScore.toFixed(1)}/10`)
  
  // 扣分原因
  if (answerScore.deductions.contentCompleteness.length > 0) {
    console.log('扣分原因 (內容完整性):', answerScore.deductions.contentCompleteness)
  }
  if (answerScore.deductions.logicalClarity.length > 0) {
    console.log('扣分原因 (邏輯清晰度):', answerScore.deductions.logicalClarity)
  }
  if (answerScore.deductions.communicationSkills.length > 0) {
    console.log('扣分原因 (溝通表達):', answerScore.deductions.communicationSkills)
  }
  
  // 加分原因
  if (answerScore.additions.professionalDepth.length > 0) {
    console.log('加分原因 (專業深度):', answerScore.additions.professionalDepth)
  }
  if (answerScore.additions.personalTraits.length > 0) {
    console.log('加分原因 (個人特質):', answerScore.additions.personalTraits)
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
export async function getInterviewAIResponse(messages: Message[], questionIndex?: number) {
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

  // 創建面試專用的系統消息
  const interviewSystemMessage: Message = {
    role: 'system',
    content: formatPrompt(INTERVIEW_PROMPT_TEMPLATES.SYSTEM_PROMPT, {
      userLanguage,
      conversationHistory,
      currentStage
    }),
  }

  // 將系統消息添加到消息列表開頭
  const processedMessages = [interviewSystemMessage, ...messages]

  // APIエンドポイントを決定
  const apiEndpoint = getApiEndpoint(selectAIService)

  try {
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
        scoreResult = createAnswerScore(score, questionIndex)
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
  messages: Message[]
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

  // 創建面試專用的系統消息
  const interviewSystemMessage: Message = {
    role: 'system',
    content: formatPrompt(INTERVIEW_PROMPT_TEMPLATES.SYSTEM_PROMPT, {
      userLanguage,
      conversationHistory,
      currentStage
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
                fullResponse += decodedContent
                controller.enqueue(decodedContent)
              } else if (line.startsWith('data:')) {
                // OpenAI API形式のストリームデータに対応
                const content = line.substring(5).trim() // 'data:' プレフィックスを除去
                if (content === '[DONE]') continue // 終了マーカーは無視

                try {
                  const data = JSON.parse(content)
                  const text = data.choices?.[0]?.delta?.content
                  if (text) {
                    fullResponse += text
                    controller.enqueue(text)
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