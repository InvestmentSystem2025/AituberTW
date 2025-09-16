import { v4 as uuidv4 } from 'uuid'

export interface Document {
  id?: string
  content: string
  metadata?: Record<string, any>
}

export interface SearchResult {
  id: string
  content: string
  metadata: Record<string, any>
  distance: number
}

export class ChromaClient {
  private baseUrl: string

  constructor(chromaUrl?: string) {
    this.baseUrl = chromaUrl || process.env.CHROMA_URL || 'http://chromadb:8000'
  }

  /**
   * 使用 Ollama 產生 embedding（若失敗回傳 fallback 向量）
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://ollama:11434'
      const embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || 'jeffh/intfloat-multilingual-e5-large-instruct:f16'

      const resp = await fetch(`${ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: embeddingModel,
          prompt: text,
        }),
      })

      if (!resp.ok) {
        const t = await resp.text()
        throw new Error(`Embedding API error: ${resp.status} - ${t}`)
      }

      const data = await resp.json()
      // Ollama response shape: { embedding: [...] }
      if (!data || !Array.isArray(data.embedding)) {
        throw new Error('Embedding response malformed')
      }
      return data.embedding
    } catch (err) {
      console.error('Error generating embedding:', err)
      // fallback: zero vector (length 1024 is used elsewhere in your code; 若embedding長度不同請調整)
      return new Array(1024).fill(0)
    }
  }

  /**
   * 建立 collection 並返回集合 ID（保證 metadata 不是空 dict）
   */
  async getOrCreateCollection(name: string): Promise<string> {
    try {
      // 先嘗試獲取現有集合
      const listResp = await fetch(`${this.baseUrl}/api/v1/collections`)
      if (listResp.ok) {
        const collections = await listResp.json()
        const existingCollection = collections.find((c: any) => c.name === name)
        if (existingCollection) {
          console.log(`Collection '${name}' already exists with ID: ${existingCollection.id}`)
          return existingCollection.id
        }
      }

      // 創建新集合
      const body = {
        name,
        // 不可使用空物件 {}（Chroma 會拒絕），至少放一個 key
        metadata: { createdBy: 'aituber-app' },
        get_or_create: true,
      }

      const resp = await fetch(`${this.baseUrl}/api/v1/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (resp.ok) {
        const collection = await resp.json()
        console.log(`Collection '${name}' created with ID: ${collection.id}`)
        return collection.id
      }

      const txt = await resp.text()
      console.error(`Create collection failed: ${resp.status} - ${txt}`)
      throw new Error(`Failed to create collection: ${resp.status} - ${txt}`)
    } catch (err) {
      console.error('Error in getOrCreateCollection:', err)
      throw err
    }
  }

  /**
   * 強制安全的 addDocuments：確保 metadatas 非空、ids 為 UUID、數量一致，並有完整 debug log
   */
  async addDocuments(collectionName: string, documents: Document[]): Promise<void> {
    console.log(`📥 addDocuments called. collection='${collectionName}', count=${documents?.length ?? 0}`)

    if (!Array.isArray(documents) || documents.length === 0) {
      console.warn('No documents provided to addDocuments()')
      return
    }

    // 確保 collection 存在並獲取其 ID
    const collectionId = await this.getOrCreateCollection(collectionName)

    // Debug 輸出輸入 documents（避免列出完整 content）
    console.log('=== incoming documents preview ===')
    documents.forEach((d, i) => {
      console.log(`doc[${i}] id: ${d.id ?? '(none)'} contentSample: "${(d.content ?? '').slice(0, 80)}" metadataKeys: ${d.metadata ? Object.keys(d.metadata).length : 0}`)
    })

    // 產生 embeddings（序列方式，若想並行可改成 Promise.all）
    const embeddings: number[][] = []
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i]
      try {
        console.log(`Generating embedding for doc[${i}]...`)
        const emb = await this.generateEmbedding(doc.content ?? '')
        embeddings.push(emb)
      } catch (err) {
        console.error(`Embedding generation failed for doc[${i}], using fallback vector`, err)
        embeddings.push(new Array(1024).fill(0))
      }
    }

    // 準備 metadatas：如果 metadata 為空就補一個預設欄位，避免 Chroma 報錯
    const metadatas = documents.map((d) => {
      if (!d.metadata || Object.keys(d.metadata).length === 0) {
        return { _source: 'aituber', _createdAt: new Date().toISOString() }
      }
      return d.metadata
    })

    // ids：Chroma v1 add 需要 ids（且必須為 UUID），所以幫每個產生 UUID（如果 caller 已有 id 可改用）
    const ids = documents.map((d) => (d.id && typeof d.id === 'string' ? d.id : uuidv4()))

    const requestBody = {
      ids,
      documents: documents.map((d) => d.content ?? ''),
      metadatas,
      embeddings,
    }

    // sanity check
    console.log('=== request body counts ===', {
      ids: requestBody.ids.length,
      docs: requestBody.documents.length,
      metas: requestBody.metadatas.length,
      embeds: requestBody.embeddings.length,
      firstEmbedLength: requestBody.embeddings[0]?.length,
      firstMetaSample: requestBody.metadatas[0],
    })

    // POST 到 v1 add endpoint，使用集合 ID
    const addUrl = `${this.baseUrl}/api/v1/collections/${collectionId}/add`
    console.log(`POST ${addUrl}`)

    try {
      const resp = await fetch(addUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (!resp.ok) {
        const txt = await resp.text()
        console.error('❌ Chroma add failed:', { status: resp.status, statusText: resp.statusText, bodyText: txt })
        throw new Error(`Chroma add failed: ${resp.status} - ${txt}`)
      }

      console.log('✅ Documents added to Chroma successfully')
    } catch (err) {
      console.error('Exception while adding documents to Chroma:', err)
      throw err
    }
  }

  /**
   * 查詢相似度（v1）
   */
  async searchSimilar(collectionName: string, query: string, limit = 5): Promise<SearchResult[]> {
    console.log(`Searching collection='${collectionName}' for: "${query}"`)
    const queryEmbedding = await this.generateEmbedding(query)

    // 獲取集合 ID
    const collectionId = await this.getOrCreateCollection(collectionName)
    const queryUrl = `${this.baseUrl}/api/v1/collections/${collectionId}/query`
    const body = {
      query_embeddings: [queryEmbedding],
      n_results: limit,
      include: ['documents', 'metadatas', 'distances'],
    }

    const resp = await fetch(queryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!resp.ok) {
      const txt = await resp.text()
      console.error('Chroma query failed:', resp.status, txt)
      throw new Error(`Chroma query failed: ${resp.status} - ${txt}`)
    }

    const data = await resp.json()
    const results: SearchResult[] = []

    if (data.ids && data.documents && data.metadatas && data.distances) {
      for (let i = 0; i < data.ids[0].length; i++) {
        results.push({
          id: data.ids[0][i],
          content: data.documents[0][i] ?? '',
          metadata: data.metadatas[0][i] ?? {},
          distance: data.distances[0][i],
        })
      }
    }

    console.log(`Found ${results.length} results`)
    return results
  }

  /**
   * 刪除文件 (v1)
   */
  async deleteDocuments(collectionName: string, ids: string[]): Promise<void> {
    if (!Array.isArray(ids) || ids.length === 0) return
    const collectionId = await this.getOrCreateCollection(collectionName)
    const resp = await fetch(`${this.baseUrl}/api/v1/collections/${collectionId}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    if (!resp.ok) {
      const txt = await resp.text()
      throw new Error(`Chroma delete failed: ${resp.status} - ${txt}`)
    }
  }

  /**
   * 列出 collection (v1)
   */
  async listCollections(): Promise<string[]> {
    const resp = await fetch(`${this.baseUrl}/api/v1/collections`)
    if (!resp.ok) return []
    const data = await resp.json()
    return Array.isArray(data) ? data.map((c: any) => c.name) : []
  }

  /**
   * 取得 collection 中文件數 (v1)
   */
  async getDocumentCount(collectionName: string): Promise<number> {
    const collectionId = await this.getOrCreateCollection(collectionName)
    const resp = await fetch(`${this.baseUrl}/api/v1/collections/${collectionId}/count`)
    if (!resp.ok) return 0
    const data = await resp.json()
    return data?.count ?? 0
  }
}
