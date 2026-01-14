import { Message } from '@/features/messages/messages'
import {
  VercelAIService,
  isVercelCloudAIService,
  isVercelLocalAIService,
} from '@/features/constants/settings'
import { modifyMessages } from '../services/utils'
import { aiServiceConfig, streamAiText, generateAiText } from '../services/vercelAi'
import { googleSearchGroundingModels } from '@/features/constants/aiModels'

export type VercelAiRequestBody = {
  messages: Message[]
  apiKey?: string
  aiService: VercelAIService | string
  model?: string
  localLlmUrl?: string
  azureEndpoint?: string
  stream?: boolean
  useSearchGrounding?: boolean
  webSearchMode?: string
  dynamicRetrievalThreshold?: number
  temperature?: number
  maxTokens?: number
}

export async function handleVercelAiJson(body: any): Promise<Response> {
  const {
    messages,
    apiKey,
    aiService,
    model,
    localLlmUrl,
    azureEndpoint,
    stream,
    useSearchGrounding,
    webSearchMode,
    dynamicRetrievalThreshold,
    temperature = 1.0,
    maxTokens = 4096,
  } = (body || {}) as VercelAiRequestBody

  // APIキーの取得と検証
  let aiApiKey = apiKey
  if (isVercelCloudAIService(aiService as any)) {
    if (!aiApiKey) {
      const servicePrefix = String(aiService).toUpperCase()
      aiApiKey = process.env[`${servicePrefix}_KEY`] || process.env[`${servicePrefix}_API_KEY`] || ''
    }
    if (!aiApiKey) {
      return new Response(JSON.stringify({ error: 'Empty API Key', errorCode: 'EmptyAPIKey' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // ローカルLLMのURL検証
  if (isVercelLocalAIService(aiService as any) && aiService !== 'custom-api') {
    if (!localLlmUrl) {
      return new Response(
        JSON.stringify({ error: 'Empty Local LLM URL', errorCode: 'EmptyLocalLLMURL' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }

  // Azureのエンドポイントとデプロイメント名の処理
  const modifiedAzureEndpoint = (azureEndpoint || process.env.AZURE_ENDPOINT || '').replace(
    /^https:\/\/|\.openai\.azure\.com.*$/g,
    ''
  )
  const modifiedAzureDeployment =
    (azureEndpoint || process.env.AZURE_ENDPOINT || '').match(/\/deployments\/([^\/]+)/)?.[1] || ''
  const modifiedModel = aiService === 'azure' ? modifiedAzureDeployment : model

  // モデル名のバリデーション
  if (isVercelCloudAIService(aiService as any) && !modifiedModel) {
    return new Response(
      JSON.stringify({ error: 'Invalid AI service or model', errorCode: 'AIInvalidProperty' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // AIサービスのインスタンス作成
  const getServiceInstance = aiServiceConfig[aiService as VercelAIService]
  if (!getServiceInstance) {
    return new Response(JSON.stringify({ error: 'Invalid AI service', errorCode: 'InvalidAIService' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // AIサービスに適したパラメータを生成
    const serviceParams =
      aiService === 'azure'
        ? { resourceName: modifiedAzureEndpoint, apiKey: aiApiKey }
        : isVercelLocalAIService(aiService as any)
          ? { baseURL: localLlmUrl }
          : { apiKey: aiApiKey }

    // モデルインスタンスの作成
    const modelInstance = getServiceInstance(serviceParams as any)

    // メッセージの修正
    const modifiedMessages = modifyMessages(aiService as any, model as any, messages)

    // Google検索接地オプションの設定
    const isUseSearchGrounding =
      aiService === 'google' &&
      useSearchGrounding &&
      modifiedMessages.every((msg) => typeof msg.content === 'string')

    // OpenAI web-search オプションの設定
    const isUseOpenAIWebSearch =
      aiService === 'openai' &&
      webSearchMode === 'openai' &&
      modifiedMessages.every((msg) => typeof msg.content === 'string')

    let options: any = {}
    if (isUseSearchGrounding) {
      options = {
        useSearchGrounding: true,
        ...(dynamicRetrievalThreshold !== undefined &&
          modifiedModel &&
          googleSearchGroundingModels.includes(modifiedModel as any) && {
            dynamicRetrievalConfig: {
              dynamicThreshold: dynamicRetrievalThreshold,
            },
          }),
      }
    } else if (isUseOpenAIWebSearch) {
      options = {
        tools: [
          {
            type: 'web_search' as any,
            user_location: {
              type: 'approximate',
              country: 'TW',
              city: 'Taipei',
              region: 'Taipei',
            },
          },
        ],
        include: ['web_search_call.action.sources'] as any,
      }
    }

    // OpenAI Chat Completions streaming：要拿到 token usage，必須顯式開啟 include_usage
    // 不同 SDK/版本可能使用 camelCase 或 snake_case，這裡兩種都帶上（無副作用）
    if (aiService === 'openai') {
      options = {
        ...(options || {}),
        stream_options: { include_usage: true },
        streamOptions: { includeUsage: true },
      }
    }

    console.log('options', options)

    // ========== Ollama 用特別処理 ==========
    if (aiService === 'ollama') {
      // 在 Docker 容器內使用服務名稱，在本地使用 localhost
      const defaultUrl = process.env.OLLAMA_BASE_URL || 'http://ollama:11434'
      const baseUrl = localLlmUrl || defaultUrl
      const ollamaModel = modifiedModel || process.env.OLLAMA_MODEL || 'gpt-oss:20b'

      if (stream) {
        // 串流模式: Ollama 的串流響應
        const resp = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ollamaModel,
            messages: modifiedMessages,
            options: {
              temperature,
              num_predict: maxTokens,
            },
            stream: true,
          }),
        })

        if (!resp.ok) {
          console.error('Ollama stream fetch error', await resp.text())
          return new Response(
            JSON.stringify({
              error: 'Ollama API Error',
              errorCode: 'OllamaAPIError',
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }

        if (!resp.body) {
          return new Response(
            JSON.stringify({ error: 'Empty Ollama response body', errorCode: 'AIAPIError' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }

        // Ollama 返回 JSONL 格式，需要轉換
        const streamBody = new ReadableStream({
          async start(controller) {
            const reader = resp.body!.getReader()
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
                  if (line.trim()) {
                    try {
                      const data = JSON.parse(line)
                      if (data.message?.content) {
                        // 轉換為前端期待的格式
                        controller.enqueue(`0:${JSON.stringify(data.message.content)}\n`)
                      }
                    } catch (e) {
                      console.error('Error parsing Ollama response:', e)
                    }
                  }
                }
              }
            } catch (e) {
              console.error('Ollama stream error:', e)
              controller.error(e)
            } finally {
              reader.releaseLock()
              controller.close()
            }
          },
        })

        return new Response(streamBody, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        })
      }

      // 非串流模式
      const resp = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          messages: modifiedMessages,
          options: {
            temperature,
            num_predict: maxTokens,
          },
          stream: false,
        }),
      })

      if (!resp.ok) {
        console.error('Ollama fetch error', await resp.text())
        return new Response(
          JSON.stringify({
            error: 'Ollama API Error',
            errorCode: 'OllamaAPIError',
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }

      const data = await resp.json()
      return new Response(JSON.stringify({ text: data.message?.content || '' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ========== LMStudio 用特別処理 ==========
    if (aiService === 'lmstudio') {
      const baseUrl = process.env.LOCAL_LLM_URL || 'http://host.docker.internal:1234'

      if (stream) {
        // 串流モード: LM Studio の SSE をそのまま前段へ転送
        //ここはいずれ並列処理に変える
        const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modifiedModel,
            messages: modifiedMessages,
            temperature,
            max_tokens: maxTokens,
            stream: true,
          }),
        })

        if (!resp.ok) {
          console.error('LMStudio stream fetch error', await resp.text())
          return new Response(
            JSON.stringify({
              error: 'LMStudio API Error',
              errorCode: 'LMStudioAPIError',
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }

        if (!resp.body) {
          return new Response(
            JSON.stringify({ error: 'Empty LMStudio response body', errorCode: 'AIAPIError' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }

        const streamBody = new ReadableStream({
          async start(controller) {
            const reader = resp.body!.getReader()
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
                  // LM Studio は OpenAI 互換の SSE: 'data: {json}'
                  // フロントは 'data:' を解析できるため、そのまま転送
                  if (line.startsWith('data:')) {
                    controller.enqueue(line + '\n')
                  }
                }
              }
            } catch (e) {
              console.error('LMStudio stream error:', e)
              controller.error(e)
            } finally {
              reader.releaseLock()
              controller.close()
            }
          },
        })

        return new Response(streamBody, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        })
      }

      // 非串流モード: 通常の JSON 応答を OpenAI 互換に整形
      const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modifiedModel,
          messages: modifiedMessages,
          temperature,
          max_tokens: maxTokens,
          stream: false,
        }),
      })

      if (!resp.ok) {
        console.error('LMStudio fetch error', await resp.text())
        return new Response(
          JSON.stringify({
            error: 'LMStudio API Error',
            errorCode: 'LMStudioAPIError',
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }

      const data = await resp.json()
      const formatted = {
        id: data.id || 'lmstudio-response',
        object: 'chat.completion',
        created: Date.now(),
        model: modifiedModel,
        choices: [
          {
            index: 0,
            message: data.choices?.[0]?.message || {
              role: 'assistant',
              content: data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '',
            },
            finish_reason: data.choices?.[0]?.finish_reason || 'stop',
          },
        ],
      }

      return new Response(JSON.stringify(formatted), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ========== 通常の處理 ==========
    if (stream) {
      return await streamAiText({
        aiService,
        model: modifiedModel,
        modelInstance,
        messages: modifiedMessages,
        temperature,
        maxTokens,
        options,
        // 額外傳入 openaiApiKey 供 web-search 分支使用官方 SDK
        aiApiKey,
      } as any)
    } else {
      return await generateAiText({
        model: modifiedModel,
        modelInstance,
        messages: modifiedMessages,
        temperature,
        maxTokens,
        options,
        // 額外傳入 openaiApiKey 供 web-search 分支使用官方 SDK
        aiApiKey,
      } as any)
    }
  } catch (error) {
    console.error('Error in AI API call:', error)
    return new Response(JSON.stringify({ error: 'Unexpected Error', errorCode: 'AIAPIError' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}


