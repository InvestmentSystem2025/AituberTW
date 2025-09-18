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
import { streamText, generateText, CoreMessage } from 'ai'
import { VercelAIService } from '@/features/constants/settings'

type AIServiceConfig = Record<VercelAIService, (params: any) => any>

/**
 * Vercel AI SDKを使用したAIサービス設定
 */
export const aiServiceConfig: AIServiceConfig = {
  openai: ({ apiKey }) => createOpenAI({ apiKey }),
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
      const result = await streamText({
        model: modelInstance(model, options),
        messages: messages as CoreMessage[],
        temperature,
        maxTokens,
      })

      return result.toDataStreamResponse()
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
