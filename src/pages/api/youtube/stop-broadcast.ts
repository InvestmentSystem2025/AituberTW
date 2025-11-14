import type { NextApiRequest, NextApiResponse } from 'next'

import { getValidAccessToken } from '@/lib/youtubeAuth'

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  const { broadcastId } = req.body as { broadcastId?: string }

  if (!broadcastId) {
    res.status(400).json({ error: 'broadcastId is required' })
    return
  }

  try {
    const accessToken = await getValidAccessToken()

    const url = new URL('https://www.googleapis.com/youtube/v3/liveBroadcasts/transition')
    url.searchParams.set('broadcastStatus', 'complete')
    url.searchParams.set('id', broadcastId)
    url.searchParams.set('part', 'status')

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`YouTube transition failed (${response.status}): ${text}`)
    }

    const data = await response.json()
    res.status(200).json({ success: true, data })
  } catch (error) {
    console.error('[YouTube][stop-broadcast] Failed to complete broadcast', error)
    res.status(500).json({ error: 'Failed to transition YouTube broadcast to complete' })
  }
}

export default handler




