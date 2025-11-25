import type { NextApiRequest, NextApiResponse } from 'next'

import { getValidAccessToken } from '@/lib/youtubeAuth'

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  const { liveChatId, pageToken } = req.query

  if (!liveChatId || typeof liveChatId !== 'string') {
    res.status(400).json({ error: 'liveChatId is required' })
    return
  }

  try {
    const accessToken = await getValidAccessToken()

    const url = new URL('https://youtube.googleapis.com/youtube/v3/liveChat/messages')
    url.searchParams.set('liveChatId', liveChatId)
    url.searchParams.set('part', 'id,snippet,authorDetails')
    if (pageToken && typeof pageToken === 'string') {
      url.searchParams.set('pageToken', pageToken)
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('[YouTube][live-chat] Failed to fetch messages', response.status, text)
      res.status(response.status).json({
        error: 'Failed to fetch live chat messages',
        details: text,
      })
      return
    }

    const data = await response.json()
    res.status(200).json(data)
  } catch (error) {
    console.error('[YouTube][live-chat] Unexpected error', error)
    if (error instanceof Error && error.message.includes('token not found')) {
      res.status(400).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to fetch live chat messages' })
  }
}

export default handler
