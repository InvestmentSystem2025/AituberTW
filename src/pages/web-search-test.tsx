import React, { useState } from 'react';
import { TextButton } from '@/components/textButton';

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

export default function WebSearchTest() {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<WebSearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) {
      setError('請輸入查詢內容');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResponse(null);

    try {
      // 使用 OpenAI Responses API 與 web search 工具
      const apiResponse = await fetch('/api/web-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query.trim(),
        }),
      });

      if (!apiResponse.ok) {
        throw new Error(`API 錯誤: ${apiResponse.status}`);
      }

      const data = await apiResponse.json();
      setResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜尋失敗');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading) {
      handleSearch();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            🌐 Web Search 測試頁面
          </h1>
          <p className="text-gray-600 text-lg">
            使用 OpenAI Responses API 與 Web Search 工具進行即時資訊查詢
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            🔍 查詢輸入
          </h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="請輸入您想查詢的內容，例如：今天的天氣、最新科技新聞、股票價格等..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading}
            />
            <TextButton 
              onClick={handleSearch} 
              disabled={isLoading || !query.trim()}
              className="px-6"
            >
              {isLoading ? '搜尋中...' : '搜尋'}
            </TextButton>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="text-red-600 flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              錯誤: {error}
            </div>
          </div>
        )}

        {response && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              🌐 搜尋結果
            </h2>
            <div className="prose max-w-none">
              <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                {response.output_text}
              </div>
              
              {response.sources && response.sources.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h3 className="text-sm font-medium text-gray-600 mb-2">📰 來源連結：</h3>
                  <div className="space-y-1">
                    {response.sources.map((source, index) => (
                      <div key={index} className="text-sm">
                        <a 
                          href={source.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 underline break-all"
                        >
                          {source.title || source.url}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {response.usage && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="text-sm text-gray-500">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <span className="font-medium">提示詞 Token:</span> {response.usage.prompt_tokens}
                      </div>
                      <div>
                        <span className="font-medium">完成 Token:</span> {response.usage.completion_tokens}
                      </div>
                      <div>
                        <span className="font-medium">總計 Token:</span> {response.usage.total_tokens}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-blue-800 mb-4">使用說明</h2>
          <div className="text-blue-700 space-y-2">
            <p>• 此測試頁面使用 OpenAI Responses API 與 web search 工具</p>
            <p>• 支援即時搜尋網路資訊並生成回覆</p>
            <p>• 建議查詢類型：天氣、新聞、股價、技術資訊等</p>
            <p>• 此頁面獨立運行，不會影響專案其他功能</p>
          </div>
        </div>
      </div>
    </div>
  );
}
