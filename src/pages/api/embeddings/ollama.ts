import { NextRequest, NextResponse } from 'next/server'

export const config = {
  runtime: 'edge',
}

export default async function handler(req: NextRequest) {
  if (req.method !== 'POST') {
    return NextResponse.json(
      { error: 'Method Not Allowed' },
      { status: 405 }
    )
  }

  try {
    const { text, model } = await req.json()

    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      )
    }

    // 使用預設的 embedding 模型或指定的模型
    const embeddingModel = model || 'jeffh/intfloat-multilingual-e5-large-instruct:f16'
    
    // 在 Docker 容器內使用服務名稱，在本地使用 localhost
    const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://ollama:11434'

    const response = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: embeddingModel,
        prompt: text,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Ollama embedding error:', errorText)
      return NextResponse.json(
        { error: 'Embedding generation failed', details: errorText },
        { status: 500 }
      )
    }

    const data = await response.json()

    if (!data.embedding || !Array.isArray(data.embedding)) {
      return NextResponse.json(
        { error: 'Invalid embedding response' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      embedding: data.embedding,
      model: embeddingModel,
      dimensions: data.embedding.length,
    })
  } catch (error: any) {
    console.error('Embedding API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
