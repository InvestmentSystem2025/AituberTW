import { Message } from '@/features/messages/messages'
import { NextRequest } from 'next/server'
import {
  VercelAIService,
  isVercelCloudAIService,
  isVercelLocalAIService,
} from '@/features/constants/settings'
import { modifyMessages } from '../services/utils'
import {
  aiServiceConfig,
  streamAiText,
  generateAiText,
} from '../services/vercelAi'
import { googleSearchGroundingModels } from '@/features/constants/aiModels'

export const config = {
  runtime: 'edge',
}

function getCandidateInternalOrigins(req: NextRequest): string[] {
  const configuredInternalOrigin = (process.env.INTERNAL_API_ORIGIN || '').trim()
  const requestOrigin = req.url ? new URL(req.url).origin : ''
  const configuredBaseUrl = (process.env.BASE_URL || '').trim()
  const dockerInternalOrigin = 'http://app:3000'

  // Priority:
  // 1) INTERNAL_API_ORIGIN (explicitly set for server-to-server calls)
  // 2) request origin
  // 3) BASE_URL (legacy fallback)
  // 4) Docker internal service URL fallback
  const ordered = [
    configuredInternalOrigin,
    requestOrigin,
    configuredBaseUrl,
    dockerInternalOrigin,
  ].filter(Boolean)

  return Array.from(new Set(ordered))
}

function estimateTokensFromMessages(messages: Message[], maxTokens: number): number {
  const inputChars = messages.reduce((sum, msg) => {
    if (typeof msg.content === 'string') return sum + msg.content.length
    return sum + JSON.stringify(msg.content || '').length
  }, 0)
  const estimatedInputTokens = Math.ceil(inputChars / 4)
  return Math.max(1, estimatedInputTokens + Math.max(1, Math.floor(maxTokens || 0)))
}

async function postInternalInterviewTokenBudget(params: {
  origins: string[]
  internalSecret: string
  accessToken?: string | null
  body: Record<string, any>
}) {
  let lastError: unknown = null
  for (const origin of params.origins) {
    const url = `${origin}/api/internal/interview-token-budget`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': params.internalSecret,
          ...(params.accessToken ? { 'x-supabase-token': params.accessToken } : {}),
        },
        body: JSON.stringify(params.body),
      })
      if (res.ok) return await res.json().catch(() => ({}))
      const text = await res.text().catch(() => '')
      lastError = new Error(`HTTP ${res.status}: ${text}`)
      if (res.status >= 400 && res.status < 500) throw lastError
    } catch (err) {
      lastError = err
      if (err instanceof Error && /^HTTP 4\d\d:/.test(err.message)) throw err
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export default async function handler(req: NextRequest) {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({
        error: 'Method Not Allowed',
        errorCode: 'METHOD_NOT_ALLOWED',
      }),
      {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

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
    interviewContext,
  } = await req.json()

  // APIキーの取得と検証
  let aiApiKey = apiKey
  if (isVercelCloudAIService(aiService)) {
    if (!aiApiKey) {
      // 環境変数から[サービス名]_KEY または [サービス名]_API_KEY の形式でAPIキーを取得
      const servicePrefix = aiService.toUpperCase()
      aiApiKey =
        process.env[`${servicePrefix}_KEY`] ||
        process.env[`${servicePrefix}_API_KEY`] ||
        ''
    }
    if (!aiApiKey) {
      return new Response(
        JSON.stringify({ error: 'Empty API Key', errorCode: 'EmptyAPIKey' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  }

  // ローカルLLMのURL検証
  if (isVercelLocalAIService(aiService) && aiService !== 'custom-api') {
    if (!localLlmUrl) {
      return new Response(
        JSON.stringify({
          error: 'Empty Local LLM URL',
          errorCode: 'EmptyLocalLLMURL',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  }

  // Azureのエンドポイントとデプロイメント名の処理
  let modifiedAzureEndpoint = (
    azureEndpoint ||
    process.env.AZURE_ENDPOINT ||
    ''
  ).replace(/^https:\/\/|\.openai\.azure\.com.*$/g, '')
  let modifiedAzureDeployment =
    (azureEndpoint || process.env.AZURE_ENDPOINT || '').match(
      /\/deployments\/([^\/]+)/
    )?.[1] || ''
  let modifiedModel = aiService === 'azure' ? modifiedAzureDeployment : model

  // モデル名のバリデーション
  if (isVercelCloudAIService(aiService) && !modifiedModel) {
    return new Response(
      JSON.stringify({
        error: 'Invalid AI service or model',
        errorCode: 'AIInvalidProperty',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  // AIサービスのインスタンス作成
  const getServiceInstance = aiServiceConfig[aiService as VercelAIService]
  if (!getServiceInstance) {
    return new Response(
      JSON.stringify({
        error: 'Invalid AI service',
        errorCode: 'InvalidAIService',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  try {
    // AIサービスに適したパラメータを生成
    const serviceParams =
      aiService === 'azure'
        ? { resourceName: modifiedAzureEndpoint, apiKey: aiApiKey }
        : isVercelLocalAIService(aiService)
          ? { baseURL: localLlmUrl }
          : { apiKey: aiApiKey }

    // モデルインスタンスの作成
    const modelInstance = getServiceInstance(serviceParams)

    // メッセージの修正
    const modifiedMessages = modifyMessages(aiService, model, messages)

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
          googleSearchGroundingModels.includes(
            modifiedModel as (typeof googleSearchGroundingModels)[number]
          ) && {
            dynamicRetrievalConfig: {
              dynamicThreshold: dynamicRetrievalThreshold,
            },
          }),
      }
    } else if (isUseOpenAIWebSearch) {
      // OpenAI web-search ツールの設定
      options = {
        tools: [{ 
          type: "web_search" as any,
          user_location: {
            type: "approximate",
            country: "TW",
            city: "Taipei",
            region: "Taipei"
          }
        }],
        include: ["web_search_call.action.sources"] as any,
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
      return new Response(
        JSON.stringify({ text: data.message?.content || '' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
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
              content:
                data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '',
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

    // ========== 通常の処理 ==========
    if (stream) {
      // Generate requestId server-side BEFORE the AI call (spec requirement).
      // crypto.randomUUID() is available in Edge runtime via Web Crypto API.
      const requestId = crypto.randomUUID()
      const internalSecret = process.env.CRON_SECRET ?? ''
      const candidateOrigins = getCandidateInternalOrigins(req)
      const interviewId =
        typeof interviewContext?.interviewId === 'string'
          ? interviewContext.interviewId
          : null
      const companyId =
        typeof interviewContext?.companyId === 'string'
          ? interviewContext.companyId
          : null
      const accessToken = req.headers.get('x-supabase-token')
      const hasInterviewBudgetContext = !!(interviewId && companyId)
      let tokenBudgetReserve: any = null
      const canUseDevInternalSecret =
        !internalSecret && process.env.NODE_ENV === 'development'
      const shouldEnforceInterviewBudget = !!(
        hasInterviewBudgetContext &&
        (internalSecret || canUseDevInternalSecret) &&
        accessToken
      )

      if (hasInterviewBudgetContext && !accessToken) {
        return new Response(
          JSON.stringify({
            error: 'UNAUTHORIZED',
            errorCode: 'UNAUTHORIZED',
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      if (
        hasInterviewBudgetContext &&
        !internalSecret &&
        process.env.NODE_ENV !== 'development'
      ) {
        return new Response(
          JSON.stringify({
            error: 'INTERVIEW_TOKEN_BUDGET_NOT_CONFIGURED',
            errorCode: 'INTERVIEW_TOKEN_BUDGET_NOT_CONFIGURED',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      if (shouldEnforceInterviewBudget) {
        try {
          tokenBudgetReserve = await postInternalInterviewTokenBudget({
            origins: candidateOrigins,
            internalSecret: internalSecret || 'development',
            accessToken,
            body: {
              action: 'reserve',
              companyId,
              interviewId,
              requestId,
              requestType: 'interview_ai',
              model: modifiedModel,
              estimatedTokens: estimateTokensFromMessages(
                modifiedMessages,
                Number(maxTokens) || 4096
              ),
            },
          })
        } catch (err: any) {
          const msg = String(err?.message || '')
          if (msg.includes('TOKEN_LIMIT_EXCEEDED')) {
            return new Response(
              JSON.stringify({
                error: 'TOKEN_LIMIT_EXCEEDED',
                errorCode: 'TOKEN_LIMIT_EXCEEDED',
              }),
              {
                status: 402,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }
          console.error('[vercel.ts] interview token reserve failed', {
            error: msg,
          })
          return new Response(
            JSON.stringify({
              error: 'INTERVIEW_TOKEN_BUDGET_FAILED',
              errorCode: 'INTERVIEW_TOKEN_BUDGET_FAILED',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Edge runtime cannot import ioredis → delegate to internal Node.js API via HTTP.
      const tokenRecord = internalSecret
        ? {
            requestId,
            userId: null as null,  // Edge has no auth context; userId = null → global pool
            onRecord: (data: {
              requestId: string; userId: string | null
              inputTokens: number; outputTokens: number
            }) => {
              Promise.resolve()
                .then(async () => {
                  if (shouldEnforceInterviewBudget) {
                    await postInternalInterviewTokenBudget({
                      origins: candidateOrigins,
                      internalSecret: internalSecret || 'development',
                      body: {
                        action: 'finalize',
                        requestId: data.requestId,
                        inputTokens: data.inputTokens,
                        outputTokens: data.outputTokens,
                      },
                    })
                  }
                  let lastError: unknown = null
                  for (const origin of candidateOrigins) {
                    const url = `${origin}/api/internal/record-token-usage`
                    try {
                      const res = await fetch(url, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'x-internal-secret': internalSecret,
                        },
                        body: JSON.stringify(data),
                      })
                      if (res.ok) return
                      lastError = new Error(`HTTP ${res.status}`)
                      console.error('[vercel.ts] record-token-usage non-200', {
                        url,
                        status: res.status,
                      })
                    } catch (err) {
                      lastError = err
                      console.error('[vercel.ts] record-token-usage fetch failed', {
                        url,
                        error: err instanceof Error ? err.message : String(err),
                      })
                    }
                  }
                  console.error('[vercel.ts] record-token-usage all origins failed', {
                    origins: candidateOrigins,
                    error: lastError instanceof Error ? lastError.message : String(lastError),
                  })
                })
                .catch((err) => {
                  console.error('[vercel.ts] record-token-usage unexpected error', {
                    error: err instanceof Error ? err.message : String(err),
                  })
                })
            },
            onNoUsage: (data: { requestId: string; userId: string | null }) => {
              if (!shouldEnforceInterviewBudget) return
              Promise.resolve()
                .then(() =>
                  postInternalInterviewTokenBudget({
                    origins: candidateOrigins,
                    internalSecret: internalSecret || 'development',
                    body: {
                      action: 'release',
                      requestId: data.requestId,
                      reason: 'provider_usage_missing',
                    },
                  })
                )
                .catch((err) => {
                  console.error('[vercel.ts] interview token release failed', {
                    error: err instanceof Error ? err.message : String(err),
                  })
                })
            },
          }
        : undefined

      const response = await streamAiText({
        aiService,
        model: modifiedModel,
        modelInstance,
        messages: modifiedMessages,
        temperature,
        maxTokens,
        options,
        aiApiKey,
        tokenRecord,
      } as any)
      if (shouldEnforceInterviewBudget && response.status >= 500) {
        postInternalInterviewTokenBudget({
          origins: candidateOrigins,
          internalSecret: internalSecret || 'development',
          body: {
            action: 'release',
            requestId,
            reason: `ai_response_status_${response.status}`,
          },
        }).catch((err) => {
          console.error('[vercel.ts] interview token release failed', {
            error: err instanceof Error ? err.message : String(err),
          })
        })
      }
      if (tokenBudgetReserve?.allocation?.token_cap != null) {
        const headers = new Headers(response.headers)
        headers.set(
          'x-interview-token-cap',
          String(tokenBudgetReserve.allocation.token_cap)
        )
        headers.set(
          'x-interview-token-used',
          String(tokenBudgetReserve.allocation.token_used ?? 0)
        )
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        })
      }
      return response
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

    return new Response(
      JSON.stringify({
        error: 'Unexpected Error',
        errorCode: 'AIAPIError',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
