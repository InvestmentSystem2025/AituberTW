import type { NextApiRequest, NextApiResponse } from 'next'
import { ChromaClient } from '@/lib/vector/chromaClient'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { query, collection, limit = 5 } = req.body

    if (!query || !collection) {
      return res.status(400).json({
        error: 'Query and collection are required'
      })
    }

    const chromaClient = new ChromaClient()
    const results = await chromaClient.searchSimilar(collection, query, limit)

    return res.status(200).json({
      query,
      collection,
      results,
      count: results.length,
    })
  } catch (error: any) {
    console.error('Error searching documents:', error)
    return res.status(500).json({
      error: 'Search failed',
      details: error.message
    })
  }
}