import type { NextApiRequest, NextApiResponse } from 'next'

import { getValidAccessToken } from '@/lib/youtubeAuth'

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  const { videoId } = req.query

  if (!videoId || typeof videoId !== 'string') {
    res.status(400).json({ error: 'videoId is required' })
    return
  }

  try {
    const accessToken = await getValidAccessToken()

    const url = new URL('https://youtube.googleapis.com/youtube/v3/videos')
    url.searchParams.set('id', videoId)
    url.searchParams.set('part', 'liveStreamingDetails')

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('[YouTube][video] Failed to fetch details', response.status, text)
      res.status(response.status).json({
        error: 'Failed to fetch video details',
        details: text,
      })
      return
    }

    const data = await response.json()
    res.status(200).json(data)
  } catch (error) {
    console.error('[YouTube][video] Unexpected error', error)
    if (error instanceof Error && error.message.includes('token not found')) {
      res.status(400).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to fetch video details' })
  }
}

export default handler
