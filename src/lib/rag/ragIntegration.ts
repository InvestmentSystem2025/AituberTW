import { Message } from '@/features/messages/messages'

export interface RAGResponse {
  shouldUseRAG: boolean
  ragMessage?: string
  contextCount?: number
  searchResults?: any[]
}

/**
 * 檢測用戶問題是否與新聞相關
 */
export function isNewsRelatedQuestion(userMessage: string): boolean {
  const newsKeywords = [
    // 中文關鍵詞
    '新聞', '最新', '最近', '今天', '昨天', '明天', '發生', '事件', '消息', '報導',
    '頭條', '熱門', '重要', '突發', '快訊', '即時', '更新', '發展', '進展',
    '台灣', '日本', '國際', '科技', '政治', '經濟', '社會', '文化', '體育',
    '天氣', '地震', '颱風', '疫情', '疫苗', '選舉', '政策', '法律', '法院',
    '公司', '企業', '股票', '市場', '投資', '金融', '銀行', '央行',
    '學校', '教育', '學生', '老師', '大學', '研究所', '考試', '升學',
    '醫療', '醫院', '醫生', '病人', '健康', '疾病', '治療', '手術',
    '交通', '捷運', '公車', '火車', '高鐵', '飛機', '機場', '道路', '塞車',
    '娛樂', '電影', '音樂', '明星', '藝人', '節目', '電視', '網路', '遊戲',
    '運動', '比賽', '選手', '球隊', '奧運', '世界盃', '冠軍', '獎牌',
    
    // 英文關鍵詞
    'news', 'latest', 'recent', 'today', 'yesterday', 'tomorrow', 'happened', 'event', 'update',
    'breaking', 'urgent', 'important', 'headline', 'report', 'story', 'incident',
    'taiwan', 'japan', 'international', 'technology', 'tech', 'politics', 'economy',
    'social', 'culture', 'sports', 'weather', 'earthquake', 'typhoon', 'pandemic',
    'vaccine', 'election', 'policy', 'law', 'court', 'company', 'business', 'stock',
    'market', 'investment', 'finance', 'bank', 'education', 'school', 'student',
    'teacher', 'university', 'medical', 'hospital', 'doctor', 'patient', 'health',
    'transportation', 'entertainment', 'movie', 'music', 'celebrity', 'game'
  ]

  const lowerMessage = userMessage.toLowerCase()
  
  // 檢查是否包含新聞相關關鍵詞
  const hasNewsKeywords = newsKeywords.some(keyword => 
    lowerMessage.includes(keyword.toLowerCase())
  )

  // 檢查是否為新聞相關的問句模式
  const newsQuestionPatterns = [
    /最近.*(?:有什麼|發生|新聞|消息)/,
    /今天.*(?:有什麼|發生|新聞|消息)/,
    /最新.*(?:新聞|消息|發展|進展)/,
    /.*(?:新聞|消息|事件).*(?:如何|怎樣|什麼|為什麼)/,
    /.*(?:台灣|日本|國際).*(?:新聞|消息|事件)/,
    /.*(?:科技|政治|經濟|社會).*(?:新聞|消息|發展)/,
    /.*(?:天氣|地震|颱風).*(?:如何|怎樣|什麼)/,
    /.*(?:公司|企業|股票).*(?:如何|怎樣|什麼)/,
    /.*(?:學校|教育|學生).*(?:如何|怎樣|什麼)/,
    /.*(?:醫療|醫院|健康).*(?:如何|怎樣|什麼)/,
    /.*(?:交通|捷運|公車).*(?:如何|怎樣|什麼)/,
    /.*(?:娛樂|電影|音樂).*(?:如何|怎樣|什麼)/,
    /.*(?:運動|比賽|選手).*(?:如何|怎樣|什麼)/
  ]

  const matchesPattern = newsQuestionPatterns.some(pattern => 
    pattern.test(userMessage)
  )

  return hasNewsKeywords || matchesPattern
}

/**
 * 調用RAG API獲取新聞相關回答
 */
export async function getRAGResponse(
  messages: Message[],
  collection: string = 'news_knowledge'
): Promise<RAGResponse> {
  try {
    const response = await fetch('/api/rag/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        collection,
        ragEnabled: true,
        searchLimit: 3,
        model: 'gpt-oss:20b',
        temperature: 0.7,
        maxTokens: 4096
      }),
    })

    if (!response.ok) {
      console.error('RAG API error:', response.status, response.statusText)
      return { shouldUseRAG: false }
    }

    const data = await response.json()
    
    return {
      shouldUseRAG: true,
      ragMessage: data.message,
      contextCount: data.contextCount,
      searchResults: data.searchResults
    }
  } catch (error) {
    console.error('RAG integration error:', error)
    return { shouldUseRAG: false }
  }
}

/**
 * 直接從向量資料庫搜尋新聞資料
 */
export async function searchNewsData(
  query: string,
  collection: string = 'news_knowledge',
  limit: number = 3
): Promise<RAGResponse> {
  try {
    const response = await fetch('/api/rag/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        collection,
        limit
      }),
    })

    if (!response.ok) {
      console.error('RAG search error:', response.status, response.statusText)
      return { shouldUseRAG: false }
    }

    const data = await response.json()
    
    if (data.results && data.results.length > 0) {
      // 構建新聞資料上下文
      const newsContext = data.results
        .map((result: any, index: number) => 
          `[參考資料 ${index + 1}]\n${result.content}\n`
        )
        .join('\n')
      
      return {
        shouldUseRAG: true,
        ragMessage: newsContext,
        contextCount: data.count,
        searchResults: data.results
      }
    }
    
    return { shouldUseRAG: false }
  } catch (error) {
    console.error('RAG search error:', error)
    return { shouldUseRAG: false }
  }
}

/**
 * 整合RAG功能到聊天流程
 */
export async function integrateRAGWithChat(
  messages: Message[],
  userMessage: string
): Promise<{ shouldUseRAG: boolean; ragResponse?: RAGResponse }> {
  // 檢查是否為新聞相關問題
  if (!isNewsRelatedQuestion(userMessage)) {
    return { shouldUseRAG: false }
  }

  // 直接搜尋新聞資料，而不是調用完整的RAG聊天API
  const ragResponse = await searchNewsData(userMessage, 'news_knowledge', 3)
  
  return {
    shouldUseRAG: ragResponse.shouldUseRAG,
    ragResponse: ragResponse.shouldUseRAG ? ragResponse : undefined
  }
}
