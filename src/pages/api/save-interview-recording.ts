import { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '500mb', // 允許大檔案上傳
    },
  },
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const { filename, videoData } = req.body

    if (!filename || !videoData) {
      return res.status(400).json({ message: 'Missing filename or video data' })
    }

    // 確保 interview-recordings 資料夾存在
    const recordingsDir = path.join(process.cwd(), 'interview-recordings')
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true })
    }

    // 從 base64 轉換為 Buffer
    const base64Data = videoData.replace(/^data:video\/webm;base64,/, '')
    const videoBuffer = Buffer.from(base64Data, 'base64')

    // 保存檔案
    const filePath = path.join(recordingsDir, filename)
    fs.writeFileSync(filePath, videoBuffer)

    console.log(`✅ 錄製檔案已保存: ${filePath}`)

    return res.status(200).json({
      success: true,
      message: 'Recording saved successfully',
      filename,
      filePath,
    })
  } catch (error) {
    console.error('保存錄製檔案時發生錯誤:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to save recording',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

