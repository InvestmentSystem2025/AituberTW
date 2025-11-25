import type { NextApiRequest, NextApiResponse } from 'next'

const MCP_SERVER_URL = process.env.MCP_SERVER_INTERNAL_URL || 'http://mcp-server:3001'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { path } = req.query
  const pathArray = Array.isArray(path) ? path : [path]
  const targetPath = pathArray.length > 0 ? pathArray.join('/') : ''
  
  // 構建目標 URL
  let targetUrl = `${MCP_SERVER_URL}`
  if (targetPath) {
    targetUrl += `/${targetPath}`
  }
  
  // 添加查詢參數
  if (req.url?.includes('?')) {
    const queryString = req.url.split('?')[1]
    targetUrl += `?${queryString}`
  }
  
  try {
    // 準備請求選項
    const fetchOptions: RequestInit = {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
      },
    }
    
    // 處理請求體（非 GET/HEAD 請求）
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.body) {
        fetchOptions.body = typeof req.body === 'string' 
          ? req.body 
          : JSON.stringify(req.body)
      }
    }
    
    // 轉發請求
    const response = await fetch(targetUrl, fetchOptions)
    const data = await response.json()
    
    // 轉發響應
    res.status(response.status).json(data)
  } catch (error) {
    console.error('MCP Server proxy error:', error)
    res.status(500).json({ 
      error: 'Proxy request failed',
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

