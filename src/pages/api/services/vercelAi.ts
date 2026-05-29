import { Message } from '@/features/messages/messages'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createXai } from '@ai-sdk/xai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createCohere } from '@ai-sdk/cohere'
import { createMistral } from '@ai-sdk/mistral'
import { createAzure } from '@ai-sdk/azure'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createOllama } from 'ollama-ai-provider'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { streamText, generateText, CoreMessage, StreamData } from 'ai'
import { VercelAIService } from '@/features/constants/settings'

type AIServiceConfig = Record<VercelAIService, (params: any) => any>

/**
 * Vercel AI SDKを使用したAIサービス設定
 */
export const aiServiceConfig: AIServiceConfig = {
  // 注意：@ai-sdk/openai 預設 compatibility='compatible'，會刻意不送 stream_options（因此串流拿不到 usage/token）
  // 使用真正的 OpenAI API 時必須設為 strict，才會送出 stream_options.include_usage
  openai: ({ apiKey }) => createOpenAI({ apiKey, compatibility: 'strict' }),
  //openai: ({ apiKey }) => createOpenAI({ apiKey }).responses,
  anthropic: ({ apiKey }) => createAnthropic({ apiKey }),
  google: ({ apiKey }) => createGoogleGenerativeAI({ apiKey }),
  azure: ({ resourceName, apiKey }) =>
    createAzure({
      resourceName,
      apiKey,
    }),
  xai: ({ apiKey }) => createXai({ apiKey }),
  groq: ({ apiKey }) =>
    createOpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey,
    }),
  cohere: ({ apiKey }) => createCohere({ apiKey }),
  mistralai: ({ apiKey }) => createMistral({ apiKey }),
  perplexity: ({ apiKey }) =>
    createOpenAI({ baseURL: 'https://api.perplexity.ai/', apiKey }),
  fireworks: ({ apiKey }) =>
    createOpenAI({
      baseURL: 'https://api.fireworks.ai/inference/v1',
      apiKey,
    }),
  deepseek: ({ apiKey }) => createDeepSeek({ apiKey }),
  openrouter: ({ apiKey }) => createOpenRouter({ apiKey }),
  lmstudio: ({ baseURL }) =>
    createOpenAICompatible({ name: 'lmstudio', baseURL }),
  ollama: ({ baseURL }) => createOllama({ baseURL }),
  'custom-api': () => null, // 特別な処理はせず、カスタムAPI用
}

/**
 * ストリーミングでテキスト生成を行う
 */
export async function streamAiText({
  aiService,
  model,
  modelInstance,
  messages,
  temperature,
  maxTokens,
  options = {},
  aiApiKey,
  tokenRecord,
}: {
  aiService?: VercelAIService | string
  model: string
  modelInstance: any
  messages: Message[]
  temperature: number
  maxTokens: number
  options?: any
  aiApiKey?: string
  /**
   * Optional token usage recording.
   * Called server-side in onFinish (fires even if client disconnects).
   * The caller decides HOW to record:
   *   - Edge routes: fire fetch to /api/internal/record-token-usage
   *   - Node.js routes: call recordTokenUsage() directly (no HTTP round-trip)
   */
  tokenRecord?: {
    requestId: string
    userId: string | null
    /** Fire-and-forget. Must not throw (wrap errors internally). */
    onRecord: (data: {
      requestId: string
      userId: string | null
      inputTokens: number
      outputTokens: number
    }) => void
    onNoUsage?: (data: { requestId: string; userId: string | null }) => void
  }
}) {
  try {
    // 檢查是否為 OpenAI web-search 模式
    const isOpenAIWebSearch = options.tools && options.tools.some((tool: any) => tool.type === 'web_search')
    
    let streamOptions: any = {
      temperature,
      maxTokens,
    }

    // 如果是 OpenAI web-search 模式，使用 responses API
    if (isOpenAIWebSearch) {
      // 使用官方 OpenAI SDK 的 Responses API（支援 Edge）
      const { OpenAI } = await import('openai')
      const openaiClient = new OpenAI({ apiKey: aiApiKey || process.env.OPENAI_API_KEY })
      // 僅取最後一則使用者訊息作為查詢輸入（貼近 /api/web-search 測試行為）
      const lastUserMessage = messages
        .filter((m) => m.role === 'user' && typeof m.content === 'string')
        .pop()
      const userInput = lastUserMessage
        ? String(lastUserMessage.content)
        : messages.map((msg) => `${msg.role}: ${msg.content}`).join('\n')

      const result = await openaiClient.responses.create({
        model: model,
        tools: options.tools,
        include: options.include,
        temperature,
        max_output_tokens: maxTokens,
        input: userInput,
        stream: true,
      })

      // 轉換 Responses 流為前端可解析的 SSE (data:) 格式
      const sourceStream: ReadableStream =
        (result as any).toReadableStream?.() || (result as any).body

      const transformed = new ReadableStream({
        async start(controller) {
          const reader = (sourceStream as any).getReader()
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
                const trimmed = line.trim()
                if (!trimmed) continue
                try {
                  const event = JSON.parse(trimmed)
                  // 只轉出文字增量，符合前端對 OpenAI Chat SSE 的解析
                  if (
                    event.type === 'response.output_text.delta' &&
                    typeof event.delta === 'string' &&
                    event.delta.length > 0
                  ) {
                    const ssePayload = {
                      choices: [
                        { delta: { content: event.delta } },
                      ],
                    }
                    controller.enqueue(
                      `data: ${JSON.stringify(ssePayload)}\n`
                    )
                  } else if (event.type === 'response.completed') {
                    // 盡可能把 usage/tokens 透過 data stream metadata 傳到前端（interviewAIChat 會解析 d:）
                    const u = (event as any)?.response?.usage || (event as any)?.usage || null
                    if (u && typeof u === 'object') {
                      controller.enqueue(`d:${JSON.stringify({ usage: u })}\n`)
                    }
                    controller.enqueue('data: [DONE]\n')
                  }
                } catch (e) {
                  // 忽略非 JSON 行
                  continue
                }
              }
            }
          } catch (err) {
            controller.error(err)
          } finally {
            controller.close()
          }
        },
      })

      return new Response(transformed, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    } else {
      // 一般模式使用 streamText
      const streamData = new StreamData()
      // provider 專用參數（例如 OpenAI 的 stream_options）要放在 providerOptions 才會真的送到上游
      const providerOptions: any = {}
      const rawStreamOptions = options?.stream_options || options?.streamOptions
      if (aiService === 'openai') {
        // OpenAI Chat Completions: 要拿到 usage，必須 include_usage
        const includeUsage =
          (rawStreamOptions && (rawStreamOptions.include_usage ?? rawStreamOptions.includeUsage)) ?? true
        providerOptions.openai = {
          stream_options: {
            ...(rawStreamOptions && typeof rawStreamOptions === 'object' ? rawStreamOptions : {}),
            include_usage: Boolean(includeUsage),
          },
        }
        // 部分 SDK 版本可能吃 camelCase，保險起見一併提供（無副作用）
        providerOptions.openai.streamOptions = {
          ...(rawStreamOptions && typeof rawStreamOptions === 'object' ? rawStreamOptions : {}),
          includeUsage: Boolean(includeUsage),
        }
      }

      // model 設定不應包含 stream_options（避免被誤當成 model settings 或被忽略造成困惑）
      const { stream_options: _so, streamOptions: _sO, ...modelOptions } = options || {}
      const toNum = (v: any) => {
        const n = typeof v === 'string' ? Number(v) : v
        return Number.isFinite(n) ? Number(n) : null
      }
      const normalizeUsageToTokens = (usage: any) => {
        if (!usage || typeof usage !== 'object') return null
        const input =
          toNum((usage as any).promptTokens) ??
          toNum((usage as any).prompt_tokens) ??
          toNum((usage as any).inputTokens) ??
          toNum((usage as any).input_tokens) ??
          null
        const output =
          toNum((usage as any).completionTokens) ??
          toNum((usage as any).completion_tokens) ??
          toNum((usage as any).outputTokens) ??
          toNum((usage as any).output_tokens) ??
          null
        const total =
          toNum((usage as any).totalTokens) ??
          toNum((usage as any).total_tokens) ??
          (input != null && output != null ? input + output : null)
        if (input == null && output == null && total == null) return null
        return {
          tokens_input: Math.max(0, Math.floor(input ?? 0)),
          tokens_output: Math.max(0, Math.floor(output ?? 0)),
          tokens_total: Math.max(0, Math.floor(total ?? ((input ?? 0) + (output ?? 0)))),
        }
      }

      const result = await streamText({
        model: modelInstance(model, modelOptions),
        messages: messages as CoreMessage[],
        temperature,
        maxTokens,
        ...(Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
        onFinish: ({ usage }) => {
          // Vercel AI SDK usage 會在串流結束後才知道；這裡轉成 tokens 欄位（前端更好解析）
          const tokens = normalizeUsageToTokens(usage)
          if (tokens) {
            streamData.append({ tokens })
          } else if (usage && typeof usage === 'object') {
            // fallback：仍送 usage，讓前端遞迴嘗試抽取
            streamData.append({ usage })
          }
          streamData.close()

          // Fire-and-forget: record token usage via caller-provided onRecord().
          // Runs server-side in onFinish → client disconnect does NOT prevent
          // recording (spec: "server completion = record it").
          if (tokenRecord) {
            if (tokens) {
              tokenRecord.onRecord({
                requestId: tokenRecord.requestId,
                userId: tokenRecord.userId,
                inputTokens: tokens.tokens_input,
                outputTokens: tokens.tokens_output,
              })
            } else {
              tokenRecord.onNoUsage?.({
                requestId: tokenRecord.requestId,
                userId: tokenRecord.userId,
              })
            }
          }
        },
      })

      return result.toDataStreamResponse({ data: streamData })
    }
  } catch (error: any) {
    console.error(`Vercel AI Stream Error: ${error.message || 'Unknown error'}`)
    console.error(`Model: ${model}, Temperature: ${temperature}`)

    return new Response(
      JSON.stringify({
        error: `AI Service Error: ${error.message || 'Unknown error'}`,
        errorCode: 'AIServiceError',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}

/**
 * 一括でテキスト生成を行う
 */
export async function generateAiText({
  model,
  modelInstance,
  messages,
  temperature,
  maxTokens,
  options = {},
  aiApiKey,
}: {
  model: string
  modelInstance: any
  messages: Message[]
  temperature: number
  maxTokens: number
  options?: any
  aiApiKey?: string
}) {
  try {
    // 檢查是否為 OpenAI web-search 模式
    const isOpenAIWebSearch = options.tools && options.tools.some((tool: any) => tool.type === 'web_search')
    
    if (isOpenAIWebSearch) {
      // 使用官方 OpenAI SDK Responses API
      const { OpenAI } = await import('openai')
      const openaiClient = new OpenAI({ apiKey: aiApiKey || process.env.OPENAI_API_KEY })
      // 僅取最後一則使用者訊息作為查詢輸入（貼近 /api/web-search 測試行為）
      const lastUserMessage = messages
        .filter((m) => m.role === 'user' && typeof m.content === 'string')
        .pop()
      const userInput = lastUserMessage
        ? String(lastUserMessage.content)
        : messages.map((msg) => `${msg.role}: ${msg.content}`).join('\n')

      const result = await openaiClient.responses.create({
        model: model,
        tools: options.tools,
        include: options.include,
        temperature,
        max_output_tokens: maxTokens,
        input: userInput,
        stream: false,
      })

      return new Response(JSON.stringify({ text: (result as any).output_text }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } else {
      // 一般模式使用 generateText
      const result = await generateText({
        model: modelInstance(model),
        messages: messages as CoreMessage[],
        temperature,
        maxTokens,
      })

      return new Response(JSON.stringify({ text: result.text }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  } catch (error: any) {
    console.error(
      `Vercel AI Generate Error: ${error.message || 'Unknown error'}`
    )
    console.error(`Model: ${model}, Temperature: ${temperature}`)

    return new Response(
      JSON.stringify({
        error: `AI Service Error: ${error.message || 'Unknown error'}`,
        errorCode: 'AIServiceError',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
