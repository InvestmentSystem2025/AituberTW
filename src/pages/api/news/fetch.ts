import type { NextApiRequest, NextApiResponse } from 'next'
import { v4 as uuidv4 } from 'uuid'

// 模擬的新聞數據（實際應用中這些會從 RSS 源獲取）
const sampleNewsData = {
  taiwan: [
    {
      title: "台灣半導體產業再創新高",
      content: "台灣半導體產業在2024年第三季度表現亮眼，出口額較去年同期成長15%。主要受惠於AI晶片需求持續增長，以及5G基礎設施建設的推動。",
      url: "https://example.tw/tech-news-1",
      source: "台灣科技日報"
    },
    {
      title: "台北捷運新線路規劃公布",
      content: "台北市政府今日公布捷運新線路規劃，預計2026年開工建設。新線路將連接信義區與內湖科技園區，預估每日載客量可達20萬人次。",
      url: "https://example.tw/transport-news-1",
      source: "台北交通新聞"
    },
    {
      title: "台灣觀光業復甦強勁",
      content: "根據觀光局最新統計，9月份來台旅客人數突破100萬人次，較去年同期成長30%。日本和韓國遊客佔比最高，其次是東南亞國家。",
      url: "https://example.tw/tourism-news-1",
      source: "台灣觀光週刊"
    }
  ],
  japan: [
    {
      title: "日本推出新一代磁浮列車",
      content: "JR東海公司宣布，新一代磁浮列車L0系將在2025年開始商業運營。最高時速可達505公里，東京到名古屋的行程時間將縮短至40分鐘。",
      url: "https://example.jp/transport-news-1",
      source: "日本交通新聞"
    },
    {
      title: "東京奧運場館轉型成功",
      content: "東京奧運結束三年後，多個場館成功轉型為市民運動中心和文化設施。國立競技場每月舉辦超過20場活動，成為東京新地標。",
      url: "https://example.jp/sports-news-1", 
      source: "日本體育報"
    },
    {
      title: "日本AI研究獲重大突破",
      content: "東京大學研究團隊在自然語言處理領域取得重大突破，開發出新的多語言AI模型。該模型在日文理解準確率上比現有模型提升25%。",
      url: "https://example.jp/tech-news-1",
      source: "日本科技週刊"
    }
  ]
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { source = 'all', limit = 10 } = req.query

    let newsItems: any[] = []
    const currentDate = new Date().toISOString()

    // 根據來源參數選擇新聞
    if (source === 'taiwan' || source === 'all') {
      const taiwanNews = sampleNewsData.taiwan.map(item => ({
        id: uuidv4(),
        ...item,
        publishedAt: currentDate,
        language: 'zh-TW'
      }))
      newsItems.push(...taiwanNews)
    }

    if (source === 'japan' || source === 'all') {
      const japanNews = sampleNewsData.japan.map(item => ({
        id: uuidv4(),
        ...item,
        publishedAt: currentDate,
        language: 'zh-TW' // 已翻譯為繁體中文
      }))
      newsItems.push(...japanNews)
    }

    // 限制返回數量
    const limitNum = parseInt(limit as string, 10)
    if (limitNum > 0) {
      newsItems = newsItems.slice(0, limitNum)
    }

    console.log(`📰 Fetched ${newsItems.length} news items (source: ${source})`)

    return res.status(200).json({
      message: 'News fetched successfully',
      count: newsItems.length,
      source,
      newsItems
    })

  } catch (error: any) {
    console.error('❌ Error fetching news:', error)
    return res.status(500).json({
      error: 'Failed to fetch news',
      details: error.message
    })
  }
}
