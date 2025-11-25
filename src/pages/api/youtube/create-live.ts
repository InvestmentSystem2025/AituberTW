import type { NextApiRequest, NextApiResponse } from 'next'

import { getValidAccessToken } from '@/lib/youtubeAuth'

interface CreateLiveRequestBody {
  title: string
  description?: string
  scheduledStartTime?: string
  scheduledEndTime?: string
  privacyStatus?: 'public' | 'private' | 'unlisted'
  enableAutoStart?: boolean
  enableAutoStop?: boolean
}

interface YouTubeBroadcastResponse {
  id: string
  snippet?: {
    liveChatId?: string
  }
}

interface YouTubeStreamResponse {
  id: string
  cdn?: {
    ingestionInfo?: {
      ingestionAddress?: string
      streamName?: string
      backupIngestionAddress?: string
    }
  }
}

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'

const postToYouTube = async <T>(
  path: string,
  accessToken: string,
  body: any,
  query: Record<string, string> = {}
): Promise<T> => {
  const url = new URL(`${YOUTUBE_API_BASE}${path}`)
  Object.entries(query).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `YouTube API request failed (${response.status}): ${errorText}`
    )
  }

  return (await response.json()) as T
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  const {
    title,
    description,
    scheduledStartTime,
    scheduledEndTime,
    privacyStatus = 'private',
    enableAutoStart = false,
    enableAutoStop = false,
  } = req.body as CreateLiveRequestBody

  if (!title || typeof title !== 'string') {
    res.status(400).json({ error: 'title is required' })
    return
  }

  try {
    const accessToken = await getValidAccessToken()

    const broadcast = await postToYouTube<YouTubeBroadcastResponse>(
      '/liveBroadcasts',
      accessToken,
      {
        snippet: {
          title,
          description,
          scheduledStartTime: scheduledStartTime || new Date().toISOString(),
          scheduledEndTime,
        },
        status: {
          privacyStatus,
          selfDeclaredMadeForKids: false,
        },
        contentDetails: {
          enableAutoStart,
          enableAutoStop,
        },
      },
      { part: 'snippet,contentDetails,status' }
    )

    const stream = await postToYouTube<YouTubeStreamResponse>(
      '/liveStreams',
      accessToken,
      {
        snippet: {
          title: `${title} stream`,
          description,
        },
        cdn: {
          frameRate: 'variable',
          ingestionType: 'rtmp',
          resolution: 'variable',
        },
        contentDetails: {
          isReusable: true,
        },
      },
      { part: 'snippet,cdn,contentDetails' }
    )

    await postToYouTube(
      '/liveBroadcasts/bind',
      accessToken,
      {},
      {
        id: broadcast.id,
        part: 'id,snippet,contentDetails,status',
        streamId: stream.id,
      }
    )

    const ingestionInfo = stream.cdn?.ingestionInfo

    res.status(200).json({
      broadcastId: broadcast.id,
      liveChatId: broadcast.snippet?.liveChatId ?? null,
      streamId: stream.id,
      ingestionInfo: {
        ingestionAddress: ingestionInfo?.ingestionAddress ?? null,
        backupIngestionAddress: ingestionInfo?.backupIngestionAddress ?? null,
        streamName: ingestionInfo?.streamName ?? null,
      },
      scheduledStartTime: scheduledStartTime || null,
      enableAutoStart,
      enableAutoStop,
    })
  } catch (error) {
    console.error('[YouTube][create-live] Failed to create broadcast', error)
    res.status(500).json({ error: 'Failed to create YouTube Live broadcast' })
  }
}

export default handler






