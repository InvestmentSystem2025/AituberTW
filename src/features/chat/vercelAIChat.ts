import { Message } from '../messages/messages'
import i18next from 'i18next'
import toastStore from '@/features/stores/toast'
import {
  isVercelLocalAIService,
  AIService,
} from '@/features/constants/settings'
import settingsStore from '../stores/settings'
import { integrateRAGWithChat } from '@/lib/rag/ragIntegration'

/**
 * 使用 OpenAI web-search 進行搜尋
 */
async function performWebSearch(query: string): Promise<{ shouldUseWebSearch: boolean; webSearchResponse?: string; sources?: any[] }> {
  try {
    console.log('🌐 發送 web-search 請求:', query)
    const response = await fetch('/api/web-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    })

    if (!response.ok) {
      console.error('Web search API error:', response.status, response.statusText)
      const errorText = await response.text()
      console.error('Web search API error details:', errorText)
      return { shouldUseWebSearch: false }
    }

    const data = await response.json()
    console.log('🌐 Web search API 回應:', data)
    
    return {
      shouldUseWebSearch: true,
      webSearchResponse: data.output_text,
      sources: data.sources
    }
  } catch (error) {
    console.error('Web search error:', error)
    return { shouldUseWebSearch: false }
  }
}

/**
 * 並列處理 web-search 和 vector db 搜尋
 */
async function performParallelSearch(
  userMessage: string,
  webSearchMode: 'openai' | 'vector-db'
): Promise<{ 
  shouldUseSearch: boolean; 
  searchResponse?: string; 
  searchType?: 'web-search' | 'vector-db';
  sources?: any[];
  contextCount?: number;
}> {
  console.log(`🔍 搜尋模式: ${webSearchMode}, 用戶問題: ${userMessage}`)
  
  // 根據 webSearchMode 決定搜尋策略
  if (webSearchMode === 'openai') {
    // 使用 OpenAI web-search
    console.log('🌐 嘗試使用 OpenAI web-search...')
    const webSearchResult = await performWebSearch(userMessage)
    console.log('🌐 OpenAI web-search 結果:', webSearchResult)
    
    if (webSearchResult.shouldUseWebSearch) {
      return {
        shouldUseSearch: true,
        searchResponse: webSearchResult.webSearchResponse,
        searchType: 'web-search',
        sources: webSearchResult.sources
      }
    } else {
      console.log('⚠️ OpenAI web-search 失敗，但不使用 vector-db 備用（因為 webSearchMode=openai）')
      // 如果 webSearchMode 是 openai，就不使用 vector-db 備用
      return { shouldUseSearch: false }
    }
  } else {
    // 使用 vector db 搜尋（現有的 RAG 功能）
    console.log('📚 使用 vector-db 搜尋...')
    const ragResult = await integrateRAGWithChat([], userMessage)
    console.log('📚 Vector-db 搜尋結果:', ragResult)
    
    if (ragResult.shouldUseRAG && ragResult.ragResponse) {
      return {
        shouldUseSearch: true,
        searchResponse: ragResult.ragResponse.ragMessage,
        searchType: 'vector-db',
        contextCount: ragResult.ragResponse.contextCount
      }
    }
  }

  console.log('❌ 沒有找到相關的搜尋結果')
  return { shouldUseSearch: false }
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
    useSearchGrounding: ss.useSearchGrounding,
    webSearchMode: ss.webSearchMode,
    dynamicRetrievalThreshold: ss.dynamicRetrievalThreshold,//for google Search Grounding
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

export async function getVercelAIChatResponse(messages: Message[]) {
  const {
    aiApiKey,
    selectAIService,
    selectAIModel,
    localLlmUrl,
    azureEndpoint,
    useSearchGrounding,
    webSearchMode,
    dynamicRetrievalThreshold,
    temperature,
    maxTokens,
    customApiUrl,
    customApiHeaders,
    customApiBody,
    customApiIncludeMimeType,
  } = getAIConfig()

  // 檢查是否需要使用搜尋功能
  const lastUserMessage = messages
    .filter(msg => msg.role === 'user')
    .pop()

  let processedMessages = messages

  if (lastUserMessage && typeof lastUserMessage.content === 'string') {
    // 使用並列搜尋邏輯
    console.log('🔧 調試資訊 (getVercelAIChatResponse):', {
      webSearchMode,
      userMessage: lastUserMessage.content,
      webSearchModeType: typeof webSearchMode
    })
    
    // 只有當 webSearchMode 不是 'openai' 時才執行搜尋邏輯
    console.log('🔍 webSearchMode 檢查 (getVercelAIChatResponse):', {
      webSearchMode,
      webSearchModeType: typeof webSearchMode,
      isNotOpenai: webSearchMode !== 'openai',
      strictComparison: webSearchMode !== 'openai'
    })
    
    if (webSearchMode !== 'openai') {
      const searchResult = await performParallelSearch(lastUserMessage.content, webSearchMode)
      
      if (searchResult.shouldUseSearch && searchResult.searchResponse) {
        // 檢測用戶語言
        const userLanguage = detectUserLanguage(lastUserMessage.content)
        
        // 將搜尋結果作為系統消息添加到消息列表中
        const searchSystemMessage = {
          role: 'system',
          content: `開頭請說丟你雷姆
- 回答語言必須使用：${userLanguage}

📰 **參考搜尋資料**：
${searchResult.searchResponse}

`
        }
        
        // 將搜尋系統消息插入到消息列表的開頭
        processedMessages = [searchSystemMessage, ...messages.filter(msg => msg.role !== 'system')]
      }
    } else {
      console.log('🌐 webSearchMode=openai，跳過本地搜尋邏輯，直接使用 OpenAI web-search 工具')
    }
  }

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
        ? messages
        : messages.filter((message) => message.role !== 'system')

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
        useSearchGrounding,
        webSearchMode,
        dynamicRetrievalThreshold,
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
    return { text: data.text }
  } catch (error: any) {
    console.error(`Error fetching ${selectAIService} API response:`, error)
    const errorCode = error.cause
      ? error.cause.errorCode || 'AIAPIError'
      : 'AIAPIError'
    return { text: handleApiError(errorCode) }
  }
}

export async function getVercelAIChatResponseStream(
  messages: Message[]
): Promise<ReadableStream<string>> {
  const {
    aiApiKey,
    selectAIService,
    selectAIModel,
    localLlmUrl,
    azureEndpoint,
    useSearchGrounding,
    webSearchMode,
    dynamicRetrievalThreshold,
    temperature,
    maxTokens,
    customApiUrl,
    customApiHeaders,
    customApiBody,
    customApiIncludeMimeType,
  } = getAIConfig()

  // 檢查是否需要使用搜尋功能
  const lastUserMessage = messages
    .filter(msg => msg.role === 'user')
    .pop()

  let processedMessages = messages
  let searchInfo = ''

  if (lastUserMessage && typeof lastUserMessage.content === 'string') {
    // 使用並列搜尋邏輯
    console.log('🔧 調試資訊 (getVercelAIChatResponseStream):', {
      webSearchMode,
      userMessage: lastUserMessage.content,
      webSearchModeType: typeof webSearchMode
    })
    
    // 只有當 webSearchMode 不是 'openai' 時才執行搜尋邏輯
    console.log('🔍 webSearchMode 檢查 (getVercelAIChatResponseStream):', {
      webSearchMode,
      webSearchModeType: typeof webSearchMode,
      isNotOpenai: webSearchMode !== 'openai',
      strictComparison: webSearchMode !== 'openai'
    })
    
    if (webSearchMode !== 'openai') {
      const searchResult = await performParallelSearch(lastUserMessage.content, webSearchMode)
      
      if (searchResult.shouldUseSearch && searchResult.searchResponse) {
        // 使用搜尋結果回答，但通過正常的AI服務流程
        console.log(`🎙️ Using ${searchResult.searchType} for search-related question`)
        
        searchInfo = ` (使用新聞資料庫回答，找到 ${searchResult.contextCount} 條相關資料)`
        
        // 檢測用戶語言
        const userLanguage = detectUserLanguage(lastUserMessage.content)
        
        // 將搜尋結果作為系統消息添加到消息列表中
        const searchSystemMessage = {
          role: 'system',
          content: `開頭請說哈薩氣在繼續你的回覆
- 回答語言必須使用：${userLanguage}
📰 **參考搜尋資料**：
${searchResult.searchResponse}
`
        }
        
        // 將搜尋系統消息插入到消息列表的開頭
        processedMessages = [searchSystemMessage, ...messages.filter(msg => msg.role !== 'system')]
      }
    } else {
      console.log('🌐 webSearchMode=openai，跳過本地搜尋邏輯，直接使用 OpenAI web-search 工具')
    }
  }

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
      useSearchGrounding,
      webSearchMode,
      dynamicRetrievalThreshold,
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
                controller.enqueue(decodedContent)
              } else if (line.startsWith('data:')) {
                // OpenAI API形式のストリームデータに対応
                const content = line.substring(5).trim() // 'data:' プレフィックスを除去
                if (content === '[DONE]') continue // 終了マーカーは無視

                try {
                  const data = JSON.parse(content)
                  const text = data.choices?.[0]?.delta?.content
                  if (text) {
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
                  tag: 'vercel-api-error',
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
                      tag: `vercel-tool-info-${decodedContent.toolName}`,
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
                    controller.enqueue(data.message.content)
                  }
                } catch (error) {
                  console.error('Error parsing JSONL:', error, line)
                }
              }
            }
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
            tag: 'vercel-api-error',
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
      tag: 'vercel-api-error',
    })
    throw error
  }
}
