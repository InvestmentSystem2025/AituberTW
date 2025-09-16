import type { NextApiRequest, NextApiResponse } from 'next'
import { ChromaClient } from '@/lib/vector/chromaClient'
import { Message } from '@/features/messages/messages'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { 
      messages, 
      collection = 'default',
      ragEnabled = true,
      searchLimit = 3,
      model = 'gpt-oss:20b',
      temperature = 0.7,
      maxTokens = 4096
    } = req.body

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: 'Messages array is required'
      })
    }

    // 獲取最新的用戶消息
    const lastUserMessage = messages
      .filter((msg: Message) => msg.role === 'user')
      .pop()

    if (!lastUserMessage) {
      return res.status(400).json({
        error: 'No user message found'
      })
    }

    let contextMessages = [...messages]
    let ragContext = ''
    let searchResults: any[] = []

    // 如果啟用 RAG，搜索相關文檔
    if (ragEnabled) {
      try {
        const chromaClient = new ChromaClient()
        searchResults = await chromaClient.searchSimilar(
          collection,
          lastUserMessage.content,
          searchLimit
        )

        if (searchResults.length > 0) {
          // 構建 RAG 上下文
          ragContext = searchResults
            .map((result, index) => 
              `[參考資料 ${index + 1}]\n${result.content}\n`
            )
            .join('\n')

          // 修改系統提示，包含 RAG 上下文和直播主風格
          const ragSystemMessage: Message = {
            role: 'system',
            content: `你是一個活潑有趣的AITuber直播主！請用直播主的風格來分享新聞，要有以下特色：

🎙️ **直播主風格要求**：
- 用親切、活潑的語氣，像在跟觀眾聊天
- 適當使用「大家好！」「各位觀眾」等稱呼
- 對新聞內容表達個人看法和情感反應
- 使用一些網路用語和表情符號
- 像在現場報導一樣生動有趣
- 不要使用表格格式，用自然的對話方式

📰 **參考新聞資料**：
${ragContext}

請根據這些新聞資料，用直播主的風格來回答觀眾的問題。如果沒有相關新聞，就誠實說明，但仍要保持直播主的活潑語氣！`
          }

          console.log('🎙️ RAG System Prompt Generated:')
          console.log(typeof ragSystemMessage.content === 'string' ? ragSystemMessage.content.substring(0, 200) + '...' : 'Complex content')
          console.log(`📊 RAG Context length: ${ragContext.length} chars`)

          // 將 RAG 系統消息插入到消息列表的開頭
          contextMessages = [ragSystemMessage, ...messages.filter(msg => msg.role !== 'system')]
        }
      } catch (ragError) {
        console.error('RAG search error:', ragError)
        // RAG 失敗時繼續正常聊天，不中斷服務
      }
    }

    // 調用 Ollama API 進行聊天
    const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://ollama:11434'
    
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: contextMessages,
        options: {
          temperature,
          num_predict: maxTokens,
        },
        stream: false,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Ollama chat error:', errorText)
      return res.status(500).json({
        error: 'Chat generation failed',
        details: errorText
      })
    }

    const data = await response.json()

    return res.status(200).json({
      message: data.message?.content || '',
      ragEnabled,
      ragContext: ragContext ? `找到 ${searchResults.length} 條相關參考資料` : 'No relevant materials found',
      contextCount: ragContext ? searchResults.length : 0,
      searchResults: ragEnabled ? searchLimit : 0,
      model,
    })
  } catch (error: any) {
    console.error('RAG chat error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    })
  }
}