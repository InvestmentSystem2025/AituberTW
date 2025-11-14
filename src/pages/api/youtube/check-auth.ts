import type { NextApiRequest, NextApiResponse } from 'next'

import { readStoredTokens } from '@/lib/youtubeAuth'

const handler = async (_req: NextApiRequest, res: NextApiResponse) => {
  try {
    const tokens = await readStoredTokens()
    const authorized = Boolean(tokens?.access_token && tokens?.refresh_token)

    res.status(200).json({ authorized })
  } catch (error) {
    console.error('[YouTube][check-auth] Failed to check authorization', error)
    res.status(500).json({ error: 'Failed to check YouTube OAuth status' })
  }
}

export default handler




