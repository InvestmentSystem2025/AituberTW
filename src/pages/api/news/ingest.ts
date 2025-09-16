import type { NextApiRequest, NextApiResponse } from 'next'
import { ChromaClient } from '@/lib/vector/chromaClient'
import fs from 'fs/promises'
import path from 'path'

interface NewsItem {
  id: string
  title: string
  content: string
  url: string
  publishedAt: string
  source: string
  language: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { newsItems, collection = 'news_knowledge' } = req.body

    if (!newsItems || !Array.isArray(newsItems)) {
      return res.status(400).json({
        error: 'newsItems array is required'
      })
    }

    console.log(`📰 Processing ${newsItems.length} news items for collection '${collection}'`)

    // 1. 保存為 JSON 檔案（用於測試和備份）
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `news-${timestamp}.json`
    const newsDataPath = path.join(process.cwd(), 'news-data', filename)
    
    await fs.writeFile(newsDataPath, JSON.stringify(newsItems, null, 2), 'utf8')
    console.log(`💾 Saved news data to: ${filename}`)

    // 2. 轉換為 ChromaDB 文檔格式
    const documents = newsItems.map((item: NewsItem) => ({
      id: item.id,
      content: `標題: ${item.title}\n\n內容: ${item.content}`,
      metadata: {
        source: item.source || 'unknown',
        type: 'news',
        language: item.language || 'zh-TW',
        publishedAt: item.publishedAt,
        url: item.url,
        title: item.title
      }
    }))

    // 3. 添加到向量資料庫
    const chromaClient = new ChromaClient()
    await chromaClient.addDocuments(collection, documents)

    console.log(`✅ Successfully added ${documents.length} news items to ChromaDB`)

    return res.status(200).json({
      message: 'News items processed successfully',
      count: documents.length,
      collection,
      savedFile: filename
    })

  } catch (error: any) {
    console.error('❌ Error processing news:', error)
    return res.status(500).json({
      error: 'Failed to process news items',
      details: error.message
    })
  }
}
