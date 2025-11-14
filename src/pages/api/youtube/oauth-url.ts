import type { NextApiRequest, NextApiResponse } from 'next'

import { getClientConfig } from '@/lib/youtubeAuth'

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/youtube.readonly',
]

const buildAuthUrl = ({
  clientId,
  redirectUri,
}: {
  clientId: string
  redirectUri: string
}) => {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

const handler = async (_req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { clientId, redirectUri } = await getClientConfig()
    const authUrl = buildAuthUrl({ clientId, redirectUri })
    res.status(200).json({ authUrl })
  } catch (error: any) {
    console.error('[YouTube][oauth-url] Failed to generate auth URL', error)
    res.status(500).json({
      error: 'Failed to generate YouTube OAuth URL',
      details: error?.message,
    })
  }
}

export default handler
