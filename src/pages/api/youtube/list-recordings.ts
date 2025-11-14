import type { NextApiRequest, NextApiResponse } from 'next'

import { promises as fs } from 'node:fs'
import path from 'node:path'

interface RecordingInfo {
  fileName: string
  size: number
  modifiedAt: number
}

const RECORDINGS_DIR = process.env.YOUTUBE_RECORDINGS_DIR || 'youtube-recordings'

const handler = async (_req: NextApiRequest, res: NextApiResponse) => {
  try {
    const dirPath = path.isAbsolute(RECORDINGS_DIR)
      ? RECORDINGS_DIR
      : path.join(process.cwd(), RECORDINGS_DIR)

    let files: string[] = []
    try {
      files = await fs.readdir(dirPath)
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        res.status(200).json({ recordings: [], dir: dirPath })
        return
      }
      throw error
    }

    const stats = await Promise.all(
      files
        .filter((file) => file.toLowerCase().endsWith('.mp4'))
        .map(async (file) => {
          const fullPath = path.join(dirPath, file)
          const stat = await fs.stat(fullPath)
          if (!stat.isFile()) return null
          const info: RecordingInfo = {
            fileName: file,
            size: stat.size,
            modifiedAt: stat.mtimeMs,
          }
          return info
        })
    )

    const recordings = stats
      .filter((item): item is RecordingInfo => Boolean(item))
      .sort((a, b) => b.modifiedAt - a.modifiedAt)

    res.status(200).json({ recordings })
  } catch (error) {
    console.error('[YouTube][list-recordings] Failed to list files', error)
    res.status(500).json({ error: 'Failed to list recording files' })
  }
}

export default handler


