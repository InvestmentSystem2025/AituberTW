import type { NextApiRequest, NextApiResponse } from 'next'

import { createReadStream } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { google } from 'googleapis'

import {
  getClientConfig,
  readStoredTokens,
  writeStoredTokens,
} from '@/lib/youtubeAuth'

interface UploadRequestBody {
  fileName: string
  title: string
  description?: string
  tags?: string[]
  privacyStatus?: 'public' | 'private' | 'unlisted'
}

const RECORDINGS_DIR = process.env.YOUTUBE_RECORDINGS_DIR || 'youtube-recordings'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  const { fileName, title, description, tags, privacyStatus = 'private' } =
    req.body as UploadRequestBody

  if (!fileName) {
    res.status(400).json({ error: 'fileName is required' })
    return
  }

  if (!title) {
    res.status(400).json({ error: 'title is required' })
    return
  }

  try {
    const tokens = await readStoredTokens()

    if (!tokens) {
      res.status(400).json({ error: 'YouTube OAuth token not found' })
      return
    }

    const { clientId, clientSecret, redirectUri } = await getClientConfig()

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    )

    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type,
      expiry_date: tokens.expiry_date,
    })

    oauth2Client.on('tokens', async (newTokens) => {
      if (!newTokens) return
      const merged = {
        access_token: newTokens.access_token || tokens.access_token,
        refresh_token: newTokens.refresh_token || tokens.refresh_token,
        scope: newTokens.scope || tokens.scope,
        token_type: newTokens.token_type || tokens.token_type,
        expiry_date: newTokens.expiry_date ?? tokens.expiry_date,
      }
      await writeStoredTokens(merged)
    })

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client })

    const dirPath = path.isAbsolute(RECORDINGS_DIR)
      ? RECORDINGS_DIR
      : path.join(process.cwd(), RECORDINGS_DIR)

    const filePath = path.join(dirPath, fileName)

    await fs.access(filePath)

    const fileStream = createReadStream(filePath)

    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title,
          description,
          tags,
        },
        status: {
          privacyStatus,
        },
      },
      media: {
        body: fileStream,
      },
    })

    res.status(200).json({
      success: true,
      videoId: response.data.id,
      kind: response.data.kind,
    })
  } catch (error) {
    console.error('[YouTube][upload-video] Upload failed', error)
    res.status(500).json({ error: 'Failed to upload video to YouTube' })
  }
}

export default handler
