import type { NextApiRequest, NextApiResponse } from 'next'
import { ChromaClient, Document } from '@/lib/vector/chromaClient'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const chromaClient = new ChromaClient()

  if (req.method === 'POST') {
    // 添加文檔
    try {
      const { collection, documents } = req.body

      if (!collection || !documents || !Array.isArray(documents)) {
        return res.status(400).json({
          error: 'Collection name and documents array are required'
        })
      }

      // 驗證文檔格式
      for (const doc of documents) {
        if (!doc.id || !doc.content) {
          return res.status(400).json({
            error: 'Each document must have id and content'
          })
        }
      }

      await chromaClient.addDocuments(collection, documents)

      return res.status(200).json({
        message: 'Documents added successfully',
        count: documents.length,
      })
    } catch (error: any) {
      console.error('Error adding documents:', error)
      return res.status(500).json({
        error: 'Failed to add documents',
        details: error.message
      })
    }
  }

  if (req.method === 'GET') {
    // 列出集合或獲取文檔數量
    try {
      const { collection } = req.query

      if (collection && typeof collection === 'string') {
        // 獲取指定集合的文檔數量
        const count = await chromaClient.getDocumentCount(collection)
        return res.status(200).json({ collection, count })
      } else {
        // 列出所有集合
        const collections = await chromaClient.listCollections()
        return res.status(200).json({ collections })
      }
    } catch (error: any) {
      console.error('Error getting collections/documents:', error)
      return res.status(500).json({
        error: 'Failed to get information',
        details: error.message
      })
    }
  }

  if (req.method === 'DELETE') {
    // 刪除文檔
    try {
      const { collection, ids } = req.body

      if (!collection || !ids || !Array.isArray(ids)) {
        return res.status(400).json({
          error: 'Collection name and ids array are required'
        })
      }

      await chromaClient.deleteDocuments(collection, ids)

      return res.status(200).json({
        message: 'Documents deleted successfully',
        count: ids.length,
      })
    } catch (error: any) {
      console.error('Error deleting documents:', error)
      return res.status(500).json({
        error: 'Failed to delete documents',
        details: error.message
      })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}