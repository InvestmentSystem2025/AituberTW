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
  formatPrompt 
} from './interviewPromptTemplates'
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
 * 觸發面試AI的TTS播放
 */
function triggerInterviewTTS(text: string) {
  if (!text || text.trim() === '') return
  
  const sessionId = generateMessageId()
  const talk: Talk = {
    message: text,
    emotion: 'neutral'
  }
  
  // 異步觸發TTS，不等待完成
  speakCharacter(
    sessionId,
    talk,
    () => {
      console.log('面試AI TTS開始播放')
    },
    () => {
      console.log('面試AI TTS播放完成')
    }
  )
}

/**
 * 獲取面試AI的回覆（包含TTS）
 */
export async function getInterviewAIResponse(messages: Message[]) {
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
    
    // 如果AI回應成功，觸發TTS
    // if (data.text) {
    //   triggerInterviewTTS(data.text)
    // }
    
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
          
          // 串流結束後觸發TTS
          // if (fullResponse.trim()) {
          //   triggerInterviewTTS(fullResponse)
          // }
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