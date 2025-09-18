import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

// 初始化 OpenAI 客戶端
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface WebSearchRequest {
  query: string;
}

interface WebSearchResponse {
  output_text: string;
  sources?: Array<{
    url: string;
    title?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WebSearchResponse | { error: string }>
) {
  // 只允許 POST 請求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只允許 POST 請求' });
  }

  try {
    const { query }: WebSearchRequest = req.body;

    // 驗證輸入
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: '請提供有效的查詢內容' });
    }

    // 檢查 API 金鑰
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API 金鑰未設定' });
    }

    console.log(`[Web Search API] 處理查詢: ${query}`);
    console.log(`[Web Search API] API 金鑰狀態: ${process.env.OPENAI_API_KEY ? '已設定' : '未設定'}`);

    // 使用 OpenAI Responses API 與 web search 工具
    const response = await openai.responses.create({
      model: "gpt-4.1-mini", // 使用支援 web search 的模型
      tools: [{ 
        type: "web_search" as any,
        user_location: {
            type: "approximate",
            country: "TW",
            city: "Taipei",
            region: "Taipei"
        }
      }], // 啟用 web search 工具
      temperature: 0.1, // 降低創造性，確保基於搜尋結果
      store: true,// 啟用對話記錄、OPENAI側会話ログ起動
      include: ["web_search_call.action.sources"]as any,
      input: `${query.trim()}\n\n`,
      max_output_tokens: 1000, // 大幅減少輸出長度
    });

    console.log(`[Web Search API] 回應成功，Token 使用量:`, response.usage);

    // 提取來源 URL
    const sources: Array<{ url: string; title?: string }> = [];
    if ((response as any).annotations) {
      (response as any).annotations.forEach((annotation: any) => {
        if (annotation.type === 'url_citation' && annotation.url) {
          sources.push({
            url: annotation.url,
            title: annotation.title || '來源連結'
          });
        }
      });
    }

    // 回傳結果
    const result: WebSearchResponse = {
      output_text: response.output_text,
      sources: sources.length > 0 ? sources : undefined,
      usage: response.usage ? {
        prompt_tokens: (response.usage as any).prompt_tokens || 0,
        completion_tokens: (response.usage as any).completion_tokens || 0,
        total_tokens: (response.usage as any).total_tokens || 0,
      } : undefined,
    };

    res.status(200).json(result);

  } catch (error) {
    console.error('[Web Search API] 錯誤:', error);

    // 處理不同的錯誤類型
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        return res.status(401).json({ error: 'OpenAI API 金鑰無效' });
      }
      if (error.message.includes('rate limit')) {
        return res.status(429).json({ error: 'API 請求頻率過高，請稍後再試' });
      }
      if (error.message.includes('quota')) {
        return res.status(402).json({ error: 'API 配額已用完' });
      }
      return res.status(500).json({ error: `伺服器錯誤: ${error.message}` });
    }

    return res.status(500).json({ error: '未知錯誤' });
  }
}
